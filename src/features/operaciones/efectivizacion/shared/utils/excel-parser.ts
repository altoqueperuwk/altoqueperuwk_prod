import * as XLSX from "xlsx";
import JSZip from "jszip";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export type ExcelRow = {
    dni: string;
    monto: string;
    codigo_operacion: string;
    fecha_pago: string;
    hora_proceso: string;
    nombre_cliente_banco_ingreso: string | null;
    estado: string | null;
};

export type HeaderAliasConfig = {
    dni: string[];
    monto: string[];
    codigo_operacion: string[];
    fecha_pago: string[];
    hora_proceso?: string[];
    nombre_cliente_banco_ingreso?: string[];
    estado?: string[];
};

export type ExcelParserRoute = OperacionRutaBancaria | "default" | `/operaciones/${OperacionRutaBancaria}`;

export type HeaderMatch = {
    headerRowIndex: number;
    idxDni: number;
    idxMonto: number;
    idxCodigoOperacion: number;
    idxFechaPago: number;
    idxHoraProceso: number;
    idxBancoIngreso: number;
    idxEstado: number;
};

export class PartialExcelArchiveError extends Error {
    constructor(
        message: string,
        public readonly rows: ExcelRow[],
    ) {
        super(message);
        this.name = "PartialExcelArchiveError";
    }
}

const excelHeaderConfig: Record<`/operaciones/${OperacionRutaBancaria}`, HeaderAliasConfig> = {
    "/operaciones/bcp": {
        dni: ["Descripcion operacion", "Descripcion operación"],
        monto: ["Monto"],
        codigo_operacion: ["Nº operacion", "Nº operación", "Nro operacion", "Nro operación", "Nro. operacion", "Operación - Número"],
        fecha_pago: ["Fecha"],
        hora_proceso: ["Operación - Hora"],
    },
    "/operaciones/bbva": {
        dni: ["Codigo", "Código"],
        monto: ["Importe Pagado"],
        codigo_operacion: ["Nro Movimiento"],
        fecha_pago: ["Fecha Pago"],
    },
    "/operaciones/banbif": {
        dni: ["Cod.Integr.", "Cod Integr"],
        monto: ["Imp.Total", "Imp Total"],
        codigo_operacion: ["Nro.Recibo", "Nro Recibo"],
        fecha_pago: ["Fec.Pago", "Fec Pago"],
    },
    "/operaciones/scotiabank": {
        dni: ["Usuario"],
        monto: ["Importe"],
        codigo_operacion: ["Operacion", "Operación"],
        fecha_pago: ["Fecha de proceso"],
        hora_proceso: ["Hora de proceso"],
    },
    "/operaciones/interbank": {
        dni: ["Deudor"],
        monto: ["Monto pagado"],
        codigo_operacion: ["Nro. de operacion", "Nro. de operación", "Nro de operacion"],
        fecha_pago: ["Fecha de pago"],
    },
    "/operaciones/safetypay": {
        dni: ["Nro. Documento", "Nro Documento", "DNI"],
        monto: ["Importe", "Importe de la venta", "Monto"],
        codigo_operacion: ["Operación", "Id. de operación"],
        fecha_pago: ["Fecha", "Pagado"],
        estado: ["Estado"],
    },
};

const defaultHeaderConfig: HeaderAliasConfig = {
    dni: ["DNI", "Documento", "Numero documento", "Nro documento", "Doc", "RUC"],
    monto: ["Monto", "Importe", "Amount", "Valor", "Total"],
    codigo_operacion: ["Codigo operacion", "Codigo", "Operacion", "Nro operacion", "Num operacion", "Id operacion", "Transaction ID"],
    fecha_pago: ["Fecha pago", "Fecha", "Fecha deposito", "Fecha operacion"],
    hora_proceso: ["Hora proceso", "Hora", "Hora pago", "Hora operacion"],
    nombre_cliente_banco_ingreso: ["Banco", "Banco cliente", "Banco ingreso", "Entidad", "Nombre banco"],
    estado: ["Estado", "Status", "Situacion"],
};

const routeToPath = (route: ExcelParserRoute): `/operaciones/${OperacionRutaBancaria}` | "default" => {
    if (route === "default") return "default";
    if (route.startsWith("/operaciones/")) return route as `/operaciones/${OperacionRutaBancaria}`;
    return `/operaciones/${route}` as `/operaciones/${OperacionRutaBancaria}`;
};

const isBcpRoute = (route: ExcelParserRoute) => routeToPath(route) === "/operaciones/bcp";

export const getExcelConfig = (route: ExcelParserRoute): HeaderAliasConfig | null => {
    const path = routeToPath(route);
    if (path === "default") return defaultHeaderConfig;
    return excelHeaderConfig[path] ?? null;
};

export const normalizeExcelHeader = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

export const getExcelAliases = (route: ExcelParserRoute = "default") => {
    const config = getExcelConfig(route) ?? defaultHeaderConfig;
    const merged: HeaderAliasConfig =
        route === "default"
            ? config
            : {
                  dni: [...defaultHeaderConfig.dni, ...config.dni],
                  monto: [...defaultHeaderConfig.monto, ...config.monto],
                  codigo_operacion: [...defaultHeaderConfig.codigo_operacion, ...config.codigo_operacion],
                  fecha_pago: [...defaultHeaderConfig.fecha_pago, ...config.fecha_pago],
                  hora_proceso: [...(defaultHeaderConfig.hora_proceso ?? []), ...(config.hora_proceso ?? [])],
                  nombre_cliente_banco_ingreso: [
                      ...(defaultHeaderConfig.nombre_cliente_banco_ingreso ?? []),
                      ...(config.nombre_cliente_banco_ingreso ?? []),
                  ],
                  estado: [...(defaultHeaderConfig.estado ?? []), ...(config.estado ?? [])],
              };

    return Object.fromEntries(
        Object.entries(merged).map(([key, aliases]) => [key, aliases.map(normalizeExcelHeader)]),
    ) as Record<keyof ExcelRow, string[]>;
};

const findHeaderIndexInRow = (headers: string[], aliases: string[] | undefined) => {
    if (!aliases?.length) return -1;

    const normalizedHeaders = headers.map(normalizeExcelHeader);
    for (const alias of aliases) {
        const index = normalizedHeaders.indexOf(normalizeExcelHeader(alias));
        if (index >= 0) return index;
    }

    return -1;
};

export const findHeaderMatch = (matrix: unknown[][], config: HeaderAliasConfig): HeaderMatch | null => {
    for (let index = 0; index < matrix.length; index += 1) {
        const headers = (matrix[index] ?? []).map(String);
        const foundDni = findHeaderIndexInRow(headers, config.dni);
        const foundMonto = findHeaderIndexInRow(headers, config.monto);
        const foundCodigo = findHeaderIndexInRow(headers, config.codigo_operacion);
        const foundFecha = findHeaderIndexInRow(headers, config.fecha_pago);
        const foundHora = findHeaderIndexInRow(headers, config.hora_proceso);
        const foundBanco = findHeaderIndexInRow(headers, config.nombre_cliente_banco_ingreso);
        const foundEstado = findHeaderIndexInRow(headers, config.estado);

        if (foundMonto >= 0 && foundCodigo >= 0) {
            return {
                headerRowIndex: index,
                idxDni: foundDni,
                idxMonto: foundMonto,
                idxCodigoOperacion: foundCodigo,
                idxFechaPago: foundFecha,
                idxHoraProceso: foundHora,
                idxBancoIngreso: foundBanco,
                idxEstado: foundEstado,
            };
        }
    }

    return null;
};

export const findExcelHeaderIndex = (rows: unknown[][], route: ExcelParserRoute = "default") => {
    const config = getExcelConfig(route) ?? defaultHeaderConfig;
    return findHeaderMatch(rows, config)?.headerRowIndex ?? -1;
};

const hasExternalSheetReference = (content: string) => /sheet\d+\.htm/i.test(content) || /_archivos\//i.test(content);

const parseHtmlMatrix = (content: string, config: HeaderAliasConfig): unknown[][] | null => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");
    const tables = Array.from(doc.querySelectorAll("table"));
    if (!tables.length) return null;

    let bestMatrix: unknown[][] = [];
    let bestScore = -1;

    for (const table of tables) {
        const sheet = XLSX.utils.table_to_sheet(table);
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
        // Solo SafetyPay: table_to_sheet convierte identificadores numéricos a Number,
        // incluso si el HTML declara formato de texto. Recuperar el texto original.
        if (config === excelHeaderConfig["/operaciones/safetypay"]) {
            const match = findHeaderMatch(matrix, config);
            if (match) {
                const sourceRows = Array.from(table.rows);
                for (let row = match.headerRowIndex + 1; row < matrix.length; row += 1) {
                    const cell = sourceRows[row]?.cells[match.idxCodigoOperacion];
                    if (cell) matrix[row][match.idxCodigoOperacion] = cell.textContent?.trim() ?? "";
                }
            }
        }
        const nonEmptyCells = matrix.reduce(
            (acc, row) => acc + row.filter((cell) => String(cell ?? "").trim() !== "").length,
            0,
        );
        const score = findHeaderMatch(matrix, config) ? nonEmptyCells + 10000 : nonEmptyCells;

        if (score > bestScore) {
            bestScore = score;
            bestMatrix = matrix;
        }
    }

    return bestMatrix.length ? bestMatrix : null;
};

export const readMatrix = (buffer: ArrayBuffer, config: HeaderAliasConfig, fileName?: string): unknown[][] | null => {
    const extension = fileName?.split(".").pop()?.toLowerCase() ?? "";
    const isHtmlExt = extension === "htm" || extension === "html";
    const sampleText = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, Math.min(buffer.byteLength, 1024 * 1024)));
    const looksHtml =
        isHtmlExt ||
        sampleText.trim().toLowerCase().startsWith("<html") ||
        sampleText.trim().startsWith("<table") ||
        sampleText.includes("<table");

    if (looksHtml) {
        const encoding = /charset\s*=\s*["']?utf-?8/i.test(sampleText) ? "utf-8" : "latin1";
        const fullText = new TextDecoder(encoding).decode(buffer);
        const htmlMatrix = parseHtmlMatrix(fullText, config);
        if (htmlMatrix && htmlMatrix.length > 1) return htmlMatrix;
        if (hasExternalSheetReference(fullText)) return null;
    }

    const readOptions: XLSX.ParsingOptions[] = [
        { type: "array", raw: true },
        { type: "array", raw: true, codepage: 1252 },
        { type: "array", raw: false },
    ];

    for (const options of readOptions) {
        try {
            const isSafetyPay = config === excelHeaderConfig["/operaciones/safetypay"];
            let workbook = XLSX.read(buffer, { ...options, ...(isSafetyPay ? { cellNF: true } : {}) });
            const xData = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
            workbook = XLSX.read(xData, { type: "array" });

            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;

            const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
            if (config === excelHeaderConfig["/operaciones/safetypay"]) {
                const match = findHeaderMatch(matrix, config);
                if (match) {
                    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
                    for (let row = match.headerRowIndex + 1; row < matrix.length; row += 1) {
                        const cell = sheet[XLSX.utils.encode_cell({ r: row + range.s.r, c: match.idxCodigoOperacion + range.s.c })];
                        if (cell) matrix[row][match.idxCodigoOperacion] = String(
                            cell.t === "n" && !/^\d+$/.test(cell.w ?? "") ? cell.v : cell.w ?? cell.v ?? "",
                        ).trim();
                    }
                }
            }
            if (matrix.length > 1) return matrix;
        } catch {
            continue;
        }
    }

    return null;
};

const formatDateTime = (date: Date) => {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const excelSerialToIso = (value: number) => {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return "";

    return `${String(date.y).padStart(4, "0")}-${String(date.m ?? 1).padStart(2, "0")}-${String(date.d ?? 1).padStart(2, "0")} ${String(date.H ?? 0).padStart(2, "0")}:${String(date.M ?? 0).padStart(2, "0")}:${String(date.S ?? 0).padStart(2, "0")}`;
};

const normalizeDateToIso = (value: unknown): string => {
    if (value == null || String(value).trim() === "") return formatDateTime(new Date());

    if (typeof value === "number" && Number.isFinite(value)) {
        const serialDate = excelSerialToIso(value);
        if (serialDate) return serialDate;
    }

    const str = String(value).trim();
    const yyyymmddTime = str.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (yyyymmddTime) return `${yyyymmddTime[1]}-${yyyymmddTime[2]}-${yyyymmddTime[3]} ${yyyymmddTime[4]}:${yyyymmddTime[5]}:${yyyymmddTime[6]}`;

    const yyyyMmDd = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (yyyyMmDd) {
        const month = Number(yyyyMmDd[2]);
        if (month >= 1 && month <= 12) {
            return `${yyyyMmDd[1]}-${String(month).padStart(2, "0")}-${String(Number(yyyyMmDd[3])).padStart(2, "0")} ${String(Number(yyyyMmDd[4] ?? 0)).padStart(2, "0")}:${String(Number(yyyyMmDd[5] ?? 0)).padStart(2, "0")}:${String(Number(yyyyMmDd[6] ?? 0)).padStart(2, "0")}`;
        }
    }

    const yyyymmdd = str.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (yyyymmdd) return `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]} 00:00:00`;

    const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddmmyyyy) {
        const yearRaw = Number(ddmmyyyy[3]);
        const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
        return `${String(year).padStart(4, "0")}-${String(Number(ddmmyyyy[2])).padStart(2, "0")}-${String(Number(ddmmyyyy[1])).padStart(2, "0")} ${String(Number(ddmmyyyy[4] ?? 0)).padStart(2, "0")}:${String(Number(ddmmyyyy[5] ?? 0)).padStart(2, "0")}:${String(Number(ddmmyyyy[6] ?? 0)).padStart(2, "0")}`;
    }

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) return formatDateTime(parsed);

    return formatDateTime(new Date());
};

const normalizeDateToIsoSafetyPay = (value: unknown, isPaidColumn = false): string => {
    if (value == null || String(value).trim() === "") return formatDateTime(new Date());

    if (typeof value === "number" && Number.isFinite(value)) {
        const serialDate = excelSerialToIso(value);
        if (serialDate) return serialDate;
    }

    const str = String(value).trim();
    // El nuevo reporte usa día/mes/año y hora de 12 horas en la columna Pagado.
    // Fecha conserva la interpretación histórica mes/día/año.
    if (isPaidColumn) {
        const paidDate = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
        if (paidDate) {
            const [, day, month, year, hour, minute, second = "00", period] = paidDate;
            const hours = Number(hour) % 12 + (period.toLowerCase() === "p" ? 12 : 0);
            return `${year.length === 2 ? "20" : ""}${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${String(hours).padStart(2, "0")}:${minute}:${second}`;
        }
    }
    if (/^\d+(?:\.\d+)?$/.test(str)) {
        const serialDate = excelSerialToIso(Number(str));
        if (serialDate) return serialDate;
    }

    const mmddyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (mmddyyyy) {
        const month = Number(mmddyyyy[1]);
        const day = Number(mmddyyyy[2]);
        const yearRaw = Number(mmddyyyy[3]);
        const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(Number(mmddyyyy[4] ?? 0)).padStart(2, "0")}:${String(Number(mmddyyyy[5] ?? 0)).padStart(2, "0")}:${String(Number(mmddyyyy[6] ?? 0)).padStart(2, "0")}`;
        }
    }

    return normalizeDateToIso(value);
};

const formatBcpTxtDateTime = (fechaRaw: string, horaRaw: string) => {
    const fecha = fechaRaw.trim();
    const date = fecha.match(/^(\d{4})(\d{2})(\d{2})$/);

    if (!date) return normalizeDateToIso(fecha);

    // El backend combina esta fecha a medianoche con hora_proceso en Lima.
    return `${date[1]}-${date[2]}-${date[3]} 00:00:00`;
};

const formatBcpTxtTime = (horaRaw: string) => {
    const time = horaRaw.trim().match(/^(\d{2})(\d{2})(\d{2})$/);
    return time ? `${time[1]}:${time[2]}:${time[3]}` : "";
};

const BCP_TXT_POSITIONS = {
    dateStart: 57,
    amountStart: 73,
    dniStart: 138,
    dniLength: 14,
    timeStart: 168,
    referenceStart: 187,
    referenceLength: 16,
} as const;

export const parseBcpTxtRows = (content: string): ExcelRow[] => {
    const rows: ExcelRow[] = [];

    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trimEnd();
        if (!trimmed.startsWith("DD")) continue;

        const fechaRaw = trimmed.slice(BCP_TXT_POSITIONS.dateStart, BCP_TXT_POSITIONS.dateStart + 8);
        const montoRaw = trimmed.slice(BCP_TXT_POSITIONS.amountStart, BCP_TXT_POSITIONS.amountStart + 15);
        const dniField = trimmed.slice(BCP_TXT_POSITIONS.dniStart, BCP_TXT_POSITIONS.dniStart + BCP_TXT_POSITIONS.dniLength);
        const horaRaw = trimmed.slice(BCP_TXT_POSITIONS.timeStart, BCP_TXT_POSITIONS.timeStart + 6);
        const referencia = trimmed.slice(
            BCP_TXT_POSITIONS.referenceStart,
            BCP_TXT_POSITIONS.referenceStart + BCP_TXT_POSITIONS.referenceLength,
        );
        const numericHeader = /^DD\d{25}$/.test(trimmed.slice(0, 27));
        const documentWithSuffix = /^ {5}(\d{8})I$/.exec(dniField);
        const suffixHeader = documentWithSuffix !== null
            && /^DD\d{11}$/.test(trimmed.slice(0, 13))
            && trimmed.slice(13, 27) === dniField;
        // Solo TXT BCP: nueve dígitos significativos conservan los últimos ocho.
        // El sufijo literal I se admite únicamente en ambos campos coincidentes.
        const numericDocument = /^\d{14}$/.test(dniField)
            ? dniField.replace(/^0+/, "").padStart(8, "0")
            : "";
        const dni = suffixHeader
            ? documentWithSuffix![1]
            : numericDocument.length === 9 ? numericDocument.slice(-8) : numericDocument;
        const codigoOperacion = referencia.replace(/\D/g, "").slice(-8);
        const horaProceso = formatBcpTxtTime(horaRaw);
        const monto = Number(montoRaw) / 100;

        if (
            !(numericHeader || suffixHeader) ||
            !/^\d{8}$/.test(fechaRaw) ||
            !horaProceso ||
            !/^\d{15}$/.test(montoRaw) ||
            !/^\d{16}$/.test(referencia) ||
            !Number.isFinite(monto) ||
            monto <= 0 ||
            !/^\d{8}$/.test(dni) ||
            !/^\d{8}$/.test(codigoOperacion)
        ) continue;

        rows.push({
            dni: `EFECTIVO000000${dni}`,
            monto: String(monto),
            codigo_operacion: codigoOperacion,
            fecha_pago: formatBcpTxtDateTime(fechaRaw, horaRaw),
            hora_proceso: horaProceso,
            nombre_cliente_banco_ingreso: "BCP",
            estado: "",
        });
    }

    return rows;
};

export const buildExcelRowsFromMatrix = (matrix: unknown[][], match: HeaderMatch | null, route: ExcelParserRoute): ExcelRow[] => {
    if (!match) return [];

    const rows: ExcelRow[] = [];
    const path = routeToPath(route);
    const headers = matrix[match.headerRowIndex] ?? [];
    const isBcpDescription = isBcpRoute(route)
        && normalizeExcelHeader(headers[match.idxDni]) === "descripcion operacion";
    const isBcpHistorical = isBcpDescription
        && normalizeExcelHeader(headers[match.idxCodigoOperacion]) === "operacion numero";
    const valueIndexes = [match.idxDni, match.idxMonto, match.idxCodigoOperacion, match.idxFechaPago].filter((idx) => idx >= 0);

    for (let index = match.headerRowIndex + 1; index < matrix.length; index += 1) {
        const row = matrix[index] ?? [];
        if (row.every((cell) => !String(cell ?? "").trim())) continue;

        const getValue = (idx: number, offset = 0) =>
            idx >= 0 && row[idx + offset] !== undefined && row[idx + offset] !== null ? String(row[idx + offset]).trim() : "";

        const offset = isBcpHistorical || (path === "/operaciones/safetypay" && normalizeExcelHeader(headers[match.idxFechaPago]) === "pagado") ? 0 : [0, -1, 1]
            .map((candidate) => ({
                candidate,
                score: valueIndexes.reduce((acc, idx) => acc + (getValue(idx, candidate) ? 1 : 0), 0),
            }))
            .sort((a, b) => b.score - a.score || Math.abs(a.candidate) - Math.abs(b.candidate))[0]?.candidate ?? 0;

        const dni = getValue(match.idxDni, offset);
        if (isBcpDescription && !dni.toUpperCase().includes("EFECTIVO")) continue;

        const estado = isBcpHistorical ? null : getValue(match.idxEstado, offset);
        const searchableText = row.map((cell) => String(cell ?? "").toLowerCase()).join(" ");
        if (searchableText.includes("total de registros") || searchableText.includes("total registros")) continue;

        const fechaPagoRaw = getValue(match.idxFechaPago, offset);
        const fechaPago = path === "/operaciones/safetypay"
            ? normalizeDateToIsoSafetyPay(fechaPagoRaw, normalizeExcelHeader(headers[match.idxFechaPago]) === "pagado")
            : normalizeDateToIso(fechaPagoRaw);

        rows.push({
            dni,
            monto: getValue(match.idxMonto, offset),
            codigo_operacion: getValue(match.idxCodigoOperacion, offset),
            fecha_pago: fechaPago,
            hora_proceso: getValue(match.idxHoraProceso, offset),
            nombre_cliente_banco_ingreso: isBcpHistorical ? null : path === "/operaciones/safetypay" ? "CMR Falabella" : getValue(match.idxBancoIngreso, offset),
            estado,
        });
    }

    return rows;
};

const describeHeaderAliases = (config: HeaderAliasConfig) =>
    [
        `Monto: ${config.monto.join(" / ")}`,
        `Codigo operacion: ${config.codigo_operacion.join(" / ")}`,
        config.dni.length ? `DNI/documento: ${config.dni.join(" / ")}` : "",
        config.fecha_pago.length ? `Fecha: ${config.fecha_pago.join(" / ")}` : "",
    ]
        .filter(Boolean)
        .join("\n");

export const mapExcelRows = (rows: unknown[][], route: ExcelParserRoute = "default"): ExcelRow[] => {
    const config = getExcelConfig(route);
    if (!config) throw new Error("No hay configuracion de columnas para esta ruta.");

    const match = findHeaderMatch(rows, config);
    if (!match) {
        throw new Error(`No se encontraron encabezados de columna en el archivo.\n${describeHeaderAliases(config)}`);
    }

    const mappedRows = buildExcelRowsFromMatrix(rows, match, route);
    if (!mappedRows.length) throw new Error("No se encontraron filas para procesar.");

    return mappedRows;
};

const supportedArchiveExtensions = new Set(["xlsx", "xls", "html", "htm", "txt"]);

const getFileExtension = (fileName: string) => fileName.split(".").pop()?.toLowerCase() ?? "";

const readExcelRowsFromBuffer = async (buffer: ArrayBuffer, fileName: string, route: ExcelParserRoute): Promise<ExcelRow[]> => {
    const config = getExcelConfig(route);
    if (!config) throw new Error("No hay configuracion de columnas para esta ruta.");

    const extension = getFileExtension(fileName);

    if (extension === "txt") {
        if (!isBcpRoute(route)) throw new Error("El formato .txt solo esta soportado para BCP.");

        const text = new TextDecoder("latin1", { fatal: false }).decode(buffer);
        const txtRows = parseBcpTxtRows(text);
        if (!txtRows.length) throw new Error("No se encontraron movimientos BCP en el TXT.");

        return txtRows;
    }

    const matrix = readMatrix(buffer, config, fileName);
    if (!matrix || matrix.length < 2) throw new Error("No se pudo leer el archivo o esta vacio.");

    return mapExcelRows(matrix, route);
};

export const readExcelRowsFromFile = async (file: File, route: ExcelParserRoute): Promise<ExcelRow[]> => {
    const extension = getFileExtension(file.name);

    if (extension !== "zip") {
        return readExcelRowsFromBuffer(await file.arrayBuffer(), file.name, route);
    }

    let archive: JSZip;
    try {
        archive = await JSZip.loadAsync(await file.arrayBuffer());
    } catch {
        throw new Error("No se pudo abrir el archivo ZIP. Verifica que no este corrupto.");
    }

    const entries: Array<{ name: string; entry: JSZip.JSZipObject }> = [];
    archive.forEach((name, entry) => {
        const internalName = name.replaceAll("\\", "/");
        const baseName = internalName.split("/").pop() ?? "";
        const internalExtension = getFileExtension(baseName);

        if (!entry.dir && baseName && !baseName.startsWith(".") && !internalName.startsWith("__MACOSX/") && supportedArchiveExtensions.has(internalExtension)) {
            entries.push({ name: internalName, entry });
        }
    });

    if (!entries.length) {
        throw new Error("El ZIP no contiene archivos compatibles para procesar.");
    }

    const rows: ExcelRow[] = [];
    const errors: string[] = [];

    for (const { name, entry } of entries) {
        try {
            const buffer = await entry.async("arraybuffer");
            const parsedRows = await readExcelRowsFromBuffer(buffer, name, route);
            rows.push(...parsedRows);
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo leer el archivo.";
            errors.push(`${name}: ${message}`);
        }
    }

    if (!rows.length) {
        throw new Error(`No se encontraron archivos procesables dentro del ZIP. ${errors.join(" ")}`.trim());
    }

    if (errors.length) {
        throw new PartialExcelArchiveError(
            `Se procesaron archivos validos, pero algunos no pudieron leerse: ${errors.join(" | ")}`,
            rows,
        );
    }

    return rows;
};
