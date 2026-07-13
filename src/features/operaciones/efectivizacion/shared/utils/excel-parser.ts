import * as XLSX from "xlsx";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export type ExcelRow = {
    dni: string;
    monto: string;
    codigo_operacion: string;
    fecha_pago: string;
    hora_proceso: string;
    nombre_cliente_banco_ingreso: string;
    estado: string;
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

const excelHeaderConfig: Record<`/operaciones/${OperacionRutaBancaria}`, HeaderAliasConfig> = {
    "/operaciones/bcp": {
        dni: ["Descripcion operacion", "Descripcion operación"],
        monto: ["Monto"],
        codigo_operacion: ["Nº operacion", "Nº operación", "Nro operacion", "Nro operación", "Nro. operacion"],
        fecha_pago: ["Fecha"],
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
        dni: ["Nro. Documento", "Nro Documento"],
        monto: ["Importe de la venta", "Monto"],
        codigo_operacion: ["Id. de transaccion", "Id. de transacción", "Transaccion", "Transacción", "Transaction id"],
        fecha_pago: ["Fecha", "Fecha de Creacion", "Fecha de Creación"],
        nombre_cliente_banco_ingreso: ["Nombre del banco de pago", "Nombre del Banco"],
        estado: ["Estado"],
    },
};

const defaultHeaderConfig: HeaderAliasConfig = {
    dni: ["DNI", "Documento", "Numero documento", "Nro documento", "Doc", "RUC"],
    monto: ["Monto", "Importe", "Amount", "Valor", "Total"],
    codigo_operacion: ["Codigo operacion", "Codigo", "Operacion", "Nro operacion", "Num operacion", "Id operacion"],
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
        const fullText = new TextDecoder("latin1").decode(buffer);
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
            let workbook = XLSX.read(buffer, options);
            const xData = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
            workbook = XLSX.read(xData, { type: "array" });

            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;

            const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
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

const normalizeDateToIsoSafetyPay = (value: unknown): string => {
    if (value == null || String(value).trim() === "") return formatDateTime(new Date());

    if (typeof value === "number" && Number.isFinite(value)) {
        const serialDate = excelSerialToIso(value);
        if (serialDate) return serialDate;
    }

    const str = String(value).trim();
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

export const buildExcelRowsFromMatrix = (matrix: unknown[][], match: HeaderMatch | null, route: ExcelParserRoute): ExcelRow[] => {
    if (!match) return [];

    const rows: ExcelRow[] = [];
    const path = routeToPath(route);
    const valueIndexes = [match.idxDni, match.idxMonto, match.idxCodigoOperacion, match.idxFechaPago].filter((idx) => idx >= 0);

    for (let index = match.headerRowIndex + 1; index < matrix.length; index += 1) {
        const row = matrix[index] ?? [];
        if (row.every((cell) => !String(cell ?? "").trim())) continue;

        const getValue = (idx: number, offset = 0) =>
            idx >= 0 && row[idx + offset] !== undefined && row[idx + offset] !== null ? String(row[idx + offset]).trim() : "";

        const offset = [0, -1, 1]
            .map((candidate) => ({
                candidate,
                score: valueIndexes.reduce((acc, idx) => acc + (getValue(idx, candidate) ? 1 : 0), 0),
            }))
            .sort((a, b) => b.score - a.score || Math.abs(a.candidate) - Math.abs(b.candidate))[0]?.candidate ?? 0;

        const estado = getValue(match.idxEstado, offset);
        const searchableText = row.map((cell) => String(cell ?? "").toLowerCase()).join(" ");
        if (searchableText.includes("total de registros") || searchableText.includes("total registros")) continue;

        const fechaPagoRaw = getValue(match.idxFechaPago, offset);
        const fechaPago = path === "/operaciones/safetypay" ? normalizeDateToIsoSafetyPay(fechaPagoRaw) : normalizeDateToIso(fechaPagoRaw);

        rows.push({
            dni: getValue(match.idxDni, offset),
            monto: getValue(match.idxMonto, offset),
            codigo_operacion: getValue(match.idxCodigoOperacion, offset),
            fecha_pago: fechaPago,
            hora_proceso: getValue(match.idxHoraProceso, offset),
            nombre_cliente_banco_ingreso: getValue(match.idxBancoIngreso, offset),
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

export const readExcelRowsFromFile = async (file: File, route: ExcelParserRoute): Promise<ExcelRow[]> => {
    const config = getExcelConfig(route);
    if (!config) throw new Error("No hay configuracion de columnas para esta ruta.");

    const buffer = await file.arrayBuffer();
    const matrix = readMatrix(buffer, config, file.name);
    if (!matrix || matrix.length < 2) throw new Error("No se pudo leer el archivo o esta vacio.");

    return mapExcelRows(matrix, route);
};
