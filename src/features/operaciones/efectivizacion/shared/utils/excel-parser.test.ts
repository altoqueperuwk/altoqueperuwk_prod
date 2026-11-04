import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { findExcelHeaderIndex, getExcelAliases, mapExcelRows, normalizeExcelHeader, parseBcpTxtRows, readExcelRowsFromFile } from "./excel-parser";

// Trama sintética de ancho fijo; no contiene datos del reporte de clientes.
const bcpDocumentRow = (document: string, secondDocument = document) => {
    const line = " ".repeat(203).split("");
    const put = (start: number, value: string) => line.splice(start, value.length, ...value);
    put(0, "DD19100000000");
    put(13, document);
    put(57, "20261030");
    put(73, "000000000100000");
    put(130, "EFECTIVO");
    put(138, secondDocument);
    put(152, "    BM          ");
    put(168, "103924");
    put(187, "0100000000000123");
    return line.join("");
};

describe("documentos de TXT BCP", () => {
    it.each([
        ["00000012345678", "12345678"],
        ["00000001234567", "01234567"],
        ["00000412345678", "12345678"],
        ["00000101234567", "01234567"],
        ["     12345678I", "12345678"],
        ["     01234567I", "01234567"],
    ])("normaliza %s sin alterar los demás datos de la operación", (document, expected) => {
        const rows = parseBcpTxtRows(bcpDocumentRow(document));
        expect(rows).toEqual([{
            dni: `EFECTIVO000000${expected}`,
            monto: "1000", codigo_operacion: "00000123",
            fecha_pago: "2026-10-30 00:00:00", hora_proceso: "10:39:24",
            nombre_cliente_banco_ingreso: "BCP", estado: "",
        }]);
    });

    it.each([
        "00001234567890", // Diez dígitos significativos: no truncar indiscriminadamente.
        "     12345678X",
        "     12345678i",
        "     123I56789",
        "      1234567I",
        "    123456789I",
        "              ",
    ])("rechaza el documento no contemplado %s", (document) => {
        expect(parseBcpTxtRows(bcpDocumentRow(document))).toEqual([]);
    });

    it("rechaza campos discordantes en el caso con I", () => {
        expect(parseBcpTxtRows(bcpDocumentRow("     12345678I", "     87654321I"))).toEqual([]);
        expect(parseBcpTxtRows(bcpDocumentRow("00000012345678", "     12345678I"))).toEqual([]);
    });

    it.each([0, 2, 57, 73, 168, 187])("mantiene la validación de la trama en la posición %s", (position) => {
        const line = bcpDocumentRow("     12345678I");
        expect(parseBcpTxtRows(line.slice(0, position) + "X" + line.slice(position + 1))).toEqual([]);
    });

    it("excluye la cabecera y mantiene el orden de los tres formatos válidos", () => {
        const rows = parseBcpTxtRows([
            "CC19100000000P20261030",
            bcpDocumentRow("00000012345678"),
            bcpDocumentRow("00000412345679"),
            bcpDocumentRow("     12345680I"),
        ].join("\r\n"));
        expect(rows.map((row) => row.dni)).toEqual([
            "EFECTIVO00000012345678", "EFECTIVO00000012345679", "EFECTIVO00000012345680",
        ]);
    });

    it("lee un archivo TXT con ambos casos mediante el mismo contrato de carga", async () => {
        const content = ["CC19100000000", bcpDocumentRow("00000412345678"), bcpDocumentRow("     12345679I")].join("\n");
        const bytes = new TextEncoder().encode(content);
        const file = { name: "reporte-bcp.txt", arrayBuffer: async () => bytes.buffer } as File;
        const rows = await readExcelRowsFromFile(file, "bcp");
        expect(rows.map((row) => row.dni)).toEqual(["EFECTIVO00000012345678", "EFECTIVO00000012345679"]);
        await expect(readExcelRowsFromFile(file, "bbva")).rejects.toThrow("solo esta soportado para BCP");
    });
});

describe("excel-parser", () => {
    it("normalizes accents, separators and spaces", () => {
        expect(normalizeExcelHeader("  Código_Operación  ")).toBe("codigo operacion");
    });

    it("finds the header row using aliases", () => {
        const rows = [
            ["Reporte BCP"],
            ["DNI", "Importe", "Nro Operacion", "Fecha Pago"],
            ["12345678", "100", "ABC", "2026-07-13"],
        ];

        expect(findExcelHeaderIndex(rows)).toBe(1);
    });

    it("maps rows to backend excel contract", () => {
        const rows = [
            ["DNI", "Importe", "Nro Operacion", "Fecha Pago", "Hora", "Banco", "Estado"],
            ["12345678", "100.50", "OP-1", "2026-07-13", "10:00", "BCP", "OK"],
        ];

        expect(mapExcelRows(rows)).toEqual([
            {
                dni: "12345678",
                monto: "100.50",
                codigo_operacion: "OP-1",
                fecha_pago: "2026-07-13 00:00:00",
                hora_proceso: "10:00",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "OK",
            },
        ]);
    });

    it("uses route aliases without changing the backend contract", () => {
        const aliases = getExcelAliases("safetypay");

        expect(aliases.codigo_operacion).toContain("transaction id");
    });

    it("maps BCP txt detail rows to the same backend contract", () => {
        const content = [
            "CC19107381361P202607090000000800000000431657500885TS0U02003003CP0000",
            "DD1910738136100000044779896                              20260709        000000000060900000000000000000000000000000000111023848075EFECTIVO00000044779896    BM          075415             0184807500496406",
        ].join("\n");

        expect(parseBcpTxtRows(content)).toEqual([
            {
                dni: "EFECTIVO00000044779896",
                monto: "609",
                codigo_operacion: "00496406",
                fecha_pago: "2026-07-09 00:00:00",
                hora_proceso: "07:54:15",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "",
            },
        ]);
    });

    it("parses BCP fixed-width rows without using the BM or TERMIB block", () => {
        const content = [
            "DD1910738003400000002539973                              20260822        000000000050000000000000000000000000000000000111023583031EFECTIVO00000002539973    BM          094548             0258303100881048                                               ",
            "DD1910738003400000074307488                              20260822        000000000048000000000000000000000000000000000111023610059EFECTIVO00000074307488TERMIB          094958             0261005906002866     ",
        ].join("\n");

        expect(parseBcpTxtRows(content)).toEqual([
            {
                dni: "EFECTIVO00000002539973",
                monto: "500",
                codigo_operacion: "00881048",
                fecha_pago: "2026-08-22 00:00:00",
                hora_proceso: "09:45:48",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "",
            },
            {
                dni: "EFECTIVO00000074307488",
                monto: "480",
                codigo_operacion: "06002866",
                fecha_pago: "2026-08-22 00:00:00",
                hora_proceso: "09:49:58",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "",
            },
        ]);
    });

    it("requires core columns before mapping rows", () => {
        const rows = [
            ["DNI", "Importe", "Fecha Pago"],
            ["12345678", "100.50", "2026-07-13"],
        ];

        expect(() => mapExcelRows(rows)).toThrow("No se encontraron encabezados de columna en el archivo.");
    });

    it("throws when no compatible header exists", () => {
        expect(() => mapExcelRows([["foo", "bar"]])).toThrow("No se encontraron encabezados de columna en el archivo.");
    });

    it("combines compatible files from a ZIP in archive order", async () => {
        const archive = new JSZip();
        const workbook = [
            ["DNI", "Importe", "Nro Operacion", "Fecha Pago", "Hora", "Banco", "Estado"],
            ["12345678", "100.50", "OP-1", "2026-07-13", "10:00", "BCP", "OK"],
        ];
        const workbookWithSheet = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbookWithSheet, XLSX.utils.aoa_to_sheet(workbook), "Datos");
        const validBuffer = XLSX.write(workbookWithSheet, { type: "array", bookType: "xlsx" });

        archive.file("01.xlsx", validBuffer);
        archive.file("02.xlsx", validBuffer);
        archive.file("notas.pdf", "ignorado");

        const zipBuffer = await archive.generateAsync({ type: "arraybuffer" });
        const zipFile = {
            name: "carga-bancaria.zip",
            arrayBuffer: async () => zipBuffer,
        } as File;
        const rows = await readExcelRowsFromFile(zipFile, "default");

        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.codigo_operacion)).toEqual(["OP-1", "OP-1"]);
    });
});
