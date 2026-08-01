import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { findExcelHeaderIndex, getExcelAliases, mapExcelRows, normalizeExcelHeader, parseBcpTxtRows, readExcelRowsFromFile } from "./excel-parser";

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
                codigo_operacion: "848075",
                fecha_pago: "2026-07-09 07:54:15",
                hora_proceso: "075415",
                nombre_cliente_banco_ingreso: "BCP",
                estado: "BM",
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
