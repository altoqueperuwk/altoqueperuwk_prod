import * as XLSX from "xlsx";

export type ClienteCargaRow = {
    dni: string;
    nombre: string;
    codigo: string;
    telefono_whatsapp: string;
};

const normalizeHeader = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();

const aliases = {
    dni: ["dni", "cedula", "documento", "nrodocumento", "numerodocumento"],
    nombre: ["nombre", "nombrecliente", "cliente"],
    codigo: ["codigo", "codigocomunidad", "comunidad"],
    telefono_whatsapp: ["telefonowhatsapp", "telefonowhatsapp", "telefono", "whatsapp", "celular"],
};

const findHeaderRow = (matrix: unknown[][]) => {
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 20); rowIndex += 1) {
        const headers = (matrix[rowIndex] ?? []).map(normalizeHeader);
        const hasDocument = aliases.dni.some((alias) => headers.includes(alias));
        const hasCommunity = aliases.codigo.some((alias) => headers.includes(alias));
        if (hasDocument && hasCommunity) return { rowIndex, headers };
    }
    return null;
};

const getColumnIndex = (headers: string[], names: string[]) => names.map(normalizeHeader).map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;

export const parseClientesExcel = async (file: File): Promise<ClienteCargaRow[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("El archivo no contiene hojas para procesar.");

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
    const header = findHeaderRow(matrix);
    if (!header) throw new Error("No se encontraron las columnas DNI y Codigo.");

    const indexes = {
        dni: getColumnIndex(header.headers, aliases.dni),
        nombre: getColumnIndex(header.headers, aliases.nombre),
        codigo: getColumnIndex(header.headers, aliases.codigo),
        telefono_whatsapp: getColumnIndex(header.headers, aliases.telefono_whatsapp),
    };

    return matrix.slice(header.rowIndex + 1).map((row) => ({
        dni: String(indexes.dni >= 0 ? row[indexes.dni] ?? "" : "").trim(),
        nombre: String(indexes.nombre >= 0 ? row[indexes.nombre] ?? "" : "").trim(),
        codigo: String(indexes.codigo >= 0 ? row[indexes.codigo] ?? "" : "").trim(),
        telefono_whatsapp: String(indexes.telefono_whatsapp >= 0 ? row[indexes.telefono_whatsapp] ?? "" : "").trim(),
    })).filter((row) => Object.values(row).some(Boolean));
};

export const downloadClientesTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
        ["DNI", "Nombre", "Código", "Teléfono / WhatsApp"],
        ["12345678", "Nombre del cliente", "ATK1", "987358019"],
    ]);
    worksheet["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 24 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");
    XLSX.writeFile(workbook, "formato_carga_masiva_clientes.xlsx");
};
