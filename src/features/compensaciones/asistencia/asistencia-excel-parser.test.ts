import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseAsistenciaExcel } from "./asistencia-excel-parser";

const makeFile = (rows: unknown[][], name = "asistencia.xlsx") => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Marcaciones");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    return new File([buffer], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};

describe("parseAsistenciaExcel", () => {
    it("normaliza una columna combinada de fecha y hora", async () => {
        const result = await parseAsistenciaExcel(makeFile([
            ["Código huellero", "Nombre", "Fecha Hora", "Tipo"],
            ["A-01", "Ana Pérez", "20/09/2026 09:05:00", "Entrada"],
        ]));

        expect(result.sheetName).toBe("Marcaciones");
        expect(result.hash).toHaveLength(64);
        expect(result.rows[0]).toMatchObject({
            codigo_huellero: "A-01",
            fecha_hora: "2026-09-20T09:05:00-05:00",
            tipo_marcacion: "ENTRADA",
        });
    });

    it("combina columnas separadas de fecha y hora", async () => {
        const result = await parseAsistenciaExcel(makeFile([
            ["DNI", "Fecha", "Time", "In/Out"],
            ["12345678", "2026-09-20", "18:10", "Out"],
        ]));

        expect(result.rows[0]).toMatchObject({
            documento: "12345678",
            fecha_hora: "2026-09-20T18:10:00-05:00",
            tipo_marcacion: "SALIDA",
        });
    });
});

