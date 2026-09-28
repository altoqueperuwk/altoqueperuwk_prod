import * as XLSX from "xlsx";
import type { AsistenciaImportRow, AsistenciaParsedFile } from "./asistencia.types";

const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLocaleLowerCase("es-PE");

const aliases = {
    codigo: ["codigo", "codigohuellero", "idusuario", "userid", "enrollnumber", "personid", "numeroempleado", "no"],
    documento: ["dni", "documento", "numerodocumento", "nrodocumento", "cedula"],
    nombre: ["nombre", "nombres", "empleado", "colaborador", "persona", "personname"],
    fechaHora: ["fechahora", "datetime", "marcacion", "horamarcacion", "punchdatetime"],
    fecha: ["fecha", "date", "punchdate"],
    hora: ["hora", "hour", "time", "punchtime"],
    tipo: ["tipo", "tipomarcacion", "entradaosalida", "estado", "punchtype", "inout"],
};

const findIndex = (headers: string[], names: string[]) => names.map(normalize).map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;

const findHeader = (matrix: unknown[][]) => {
    for (let index = 0; index < Math.min(matrix.length, 30); index += 1) {
        const headers = (matrix[index] ?? []).map(normalize);
        const hasPerson = findIndex(headers, aliases.codigo) >= 0 || findIndex(headers, aliases.documento) >= 0;
        const hasDate = findIndex(headers, aliases.fechaHora) >= 0 || findIndex(headers, aliases.fecha) >= 0;
        if (hasPerson && hasDate) return { index, headers, original: (matrix[index] ?? []).map((value) => String(value ?? "")) };
    }
    return null;
};

const pad = (value: number) => String(value).padStart(2, "0");
const isoFromParts = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) => `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}-05:00`;

const fromExcelNumber = (value: number) => {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? isoFromParts(parsed.y, parsed.m, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)) : null;
};

const parseDateText = (value: string) => {
    const clean = value.trim().replace(/\s+/g, " ");
    let match = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4] ?? 0), minute: Number(match[5] ?? 0), second: Number(match[6] ?? 0) };
    match = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) return { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]), hour: Number(match[4] ?? 0), minute: Number(match[5] ?? 0), second: Number(match[6] ?? 0) };
    return null;
};

const parseTime = (value: unknown) => {
    if (typeof value === "number") {
        const totalSeconds = Math.round((value % 1) * 86400);
        return { hour: Math.floor(totalSeconds / 3600) % 24, minute: Math.floor(totalSeconds / 60) % 60, second: totalSeconds % 60 };
    }
    if (value instanceof Date) return { hour: value.getHours(), minute: value.getMinutes(), second: value.getSeconds() };
    const match = String(value ?? "").trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const suffix = match[4]?.toUpperCase();
    if (suffix === "PM" && hour < 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    return { hour, minute: Number(match[2]), second: Number(match[3] ?? 0) };
};

const parseDateTime = (combined: unknown, dateValue: unknown, timeValue: unknown) => {
    if (combined instanceof Date) return isoFromParts(combined.getFullYear(), combined.getMonth() + 1, combined.getDate(), combined.getHours(), combined.getMinutes(), combined.getSeconds());
    if (typeof combined === "number") return fromExcelNumber(combined);
    if (combined !== null && combined !== undefined && String(combined).trim()) {
        const parts = parseDateText(String(combined));
        if (parts) return isoFromParts(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
    }

    let dateParts: ReturnType<typeof parseDateText> = null;
    if (dateValue instanceof Date) dateParts = { year: dateValue.getFullYear(), month: dateValue.getMonth() + 1, day: dateValue.getDate(), hour: 0, minute: 0, second: 0 };
    else if (typeof dateValue === "number") {
        const parsed = XLSX.SSF.parse_date_code(dateValue);
        if (parsed) dateParts = { year: parsed.y, month: parsed.m, day: parsed.d, hour: 0, minute: 0, second: 0 };
    } else dateParts = parseDateText(String(dateValue ?? ""));
    const timeParts = parseTime(timeValue);
    if (!dateParts) return null;
    return isoFromParts(dateParts.year, dateParts.month, dateParts.day, timeParts?.hour ?? dateParts.hour, timeParts?.minute ?? dateParts.minute, timeParts?.second ?? dateParts.second);
};

const normalizeType = (value: unknown): AsistenciaImportRow["tipo_marcacion"] => {
    const text = normalize(value);
    if (["entrada", "ingreso", "in", "checkin", "1"].includes(text)) return "ENTRADA";
    if (["salida", "out", "checkout", "2"].includes(text)) return "SALIDA";
    return "DESCONOCIDA";
};

const hashFile = async (buffer: ArrayBuffer) => {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const parseAsistenciaExcel = async (file: File): Promise<AsistenciaParsedFile> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: true, cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error("El archivo no contiene una hoja para procesar.");
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
    const header = findHeader(matrix);
    if (!header) throw new Error("No se reconocieron las columnas de empleado y fecha de marcación.");

    const indexes = {
        codigo: findIndex(header.headers, aliases.codigo),
        documento: findIndex(header.headers, aliases.documento),
        nombre: findIndex(header.headers, aliases.nombre),
        fechaHora: findIndex(header.headers, aliases.fechaHora),
        fecha: findIndex(header.headers, aliases.fecha),
        hora: findIndex(header.headers, aliases.hora),
        tipo: findIndex(header.headers, aliases.tipo),
    };

    const rows: AsistenciaImportRow[] = [];
    matrix.slice(header.index + 1).forEach((row, rowOffset) => {
        if (!row.some((value) => String(value ?? "").trim())) return;
        const fechaHora = parseDateTime(
            indexes.fechaHora >= 0 ? row[indexes.fechaHora] : null,
            indexes.fecha >= 0 ? row[indexes.fecha] : null,
            indexes.hora >= 0 ? row[indexes.hora] : null,
        );
        const datosOrigen = Object.fromEntries(header.original.map((name, index) => [name || `columna_${index + 1}`, row[index] ?? null]));
        rows.push({
            numero_fila: header.index + rowOffset + 2,
            codigo_huellero: indexes.codigo >= 0 ? String(row[indexes.codigo] ?? "").trim() || null : null,
            documento: indexes.documento >= 0 ? String(row[indexes.documento] ?? "").trim() || null : null,
            nombre: indexes.nombre >= 0 ? String(row[indexes.nombre] ?? "").trim() || null : null,
            fecha_hora: fechaHora ?? String(indexes.fechaHora >= 0 ? row[indexes.fechaHora] ?? "" : ""),
            tipo_marcacion: normalizeType(indexes.tipo >= 0 ? row[indexes.tipo] : null),
            datos_origen: datosOrigen,
        });
    });
    if (!rows.length) throw new Error("El archivo no contiene marcaciones para importar.");
    return { rows, sheetName, hash: await hashFile(buffer) };
};
