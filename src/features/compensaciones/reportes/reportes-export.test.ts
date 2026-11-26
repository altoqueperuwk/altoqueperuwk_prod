import ExcelJS from "exceljs";
import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildReporteFile } from "./reportes-export";
import type { ReporteColumna } from "./reportes.types";

const pdf = vi.hoisted(() => ({ html: "", output: vi.fn(), text: vi.fn(), setPage: vi.fn() }));
vi.mock("html2pdf.js", () => ({
    default: () => {
        const worker = {
            set: () => worker,
            from: (host: HTMLElement) => {
                pdf.html = host.innerHTML;
                return worker;
            },
            toPdf: () => worker,
            get: async () => {
                const blob = await pdf.output();
                return {
                    getNumberOfPages: () => 2,
                    internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
                    setPage: pdf.setPage,
                    setTextColor: vi.fn(),
                    setFontSize: vi.fn(),
                    text: pdf.text,
                    splitTextToSize: (text: string) => [text],
                    output: () => blob,
                };
            },
        };
        return worker;
    },
}));

const columns: ReporteColumna[] = [
    { key: "nombre", label: "Colaborador" },
    { key: "dni", label: "Documento" },
    { key: "sueldo", label: "Sueldo", kind: "money" },
    { key: "bonos", label: "Bonos", kind: "money" },
    { key: "comisiones", label: "Comisiones", kind: "money" },
    { key: "descuentos", label: "Descuentos", kind: "money" },
    { key: "total", label: "Total", kind: "money" },
    { key: "pagado", label: "Pagado", kind: "money" },
    { key: "saldo", label: "Saldo", kind: "money" },
];
const row = {
    nombre: 'Ficticio "A", Norte',
    dni: "00123456",
    sueldo: 1250,
    bonos: 150.5,
    comisiones: 25.25,
    descuentos: 30.75,
    total: 1395,
    pagado: 500,
    saldo: 895,
};

describe("Exportaciones financieras: archivos reales y preparación PDF", () => {
    beforeEach(() => {
        vi.stubGlobal("Blob", NodeBlob);
        vi.stubGlobal("crypto", webcrypto);
        pdf.output.mockReset();
        pdf.text.mockClear();
        pdf.setPage.mockClear();
        pdf.output.mockResolvedValue(new NodeBlob(["PDF simulado"]));
        pdf.html = "";
    });
    afterEach(() => vi.unstubAllGlobals());

    it("CSV conserva todos los importes, DNI y caracteres especiales", async () => {
        const result = await buildReporteFile("CSV", "General financiero", "2026-10", columns, [row], { total_pagar: 1395 });
        const csv = await result.blob.text();
        expect(csv).toContain('"Ficticio ""A"", Norte"');
        expect(csv).toContain('"00123456"');
        for (const value of [150.5, 25.25, 30.75, 1395, 500, 895]) {
            expect(csv).toContain(new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value));
        }
        expect(result.fileName).toBe("general_financiero_2026-10.csv");
        expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    });
    it("CSV neutraliza fórmulas de texto y distingue cero de valores desconocidos", async () => {
        const result = await buildReporteFile(
            "CSV",
            "Prueba",
            "2026-10",
            columns,
            [{ ...row, nombre: "=SUM(A1:A2)", bonos: 0, comisiones: null, saldo: Number.NaN }],
            {},
        );
        const csv = await result.blob.text();
        expect(csv).toContain('"\'=SUM(A1:A2)"');
        expect(csv).toContain(new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(0));
        expect(csv.match(/"—"/g)).toHaveLength(2);
        expect(csv).not.toContain("NaN");
    });
    it("XLSX mantiene números sumables, DNI con ceros iniciales y ausencias vacías", async () => {
        const result = await buildReporteFile(
            "XLSX",
            "General financiero",
            "2026-10",
            columns,
            [row, { ...row, nombre: "=SUM(A1:A2)", bonos: 0, comisiones: null, saldo: "" }],
            {},
        );
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await result.blob.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
        const sheet = workbook.getWorksheet("Reporte")!;
        // Sin resumen: título, período, separador, cabecera, datos.
        expect(sheet.getCell("B5").value).toBe("00123456");
        expect(sheet.getCell("D5").value).toBe(150.5);
        expect(sheet.getCell("E5").value).toBe(25.25);
        expect(sheet.getCell("F5").value).toBe(30.75);
        expect(sheet.getCell("G5").value).toBe(1395);
        expect(sheet.getCell("I5").value).toBe(895);
        expect(sheet.getCell("D6").value).toBe(0);
        expect(sheet.getCell("E6").value).toBeNull();
        expect(sheet.getCell("I6").value).toBeNull();
        expect(sheet.getCell("A6").value).toBe("=SUM(A1:A2)");
        expect(sheet.getCell("C5").numFmt).toBe('"S/ "#,##0.00');
    });
    it("PDF prepara HTML escapado y limpia el elemento temporal", async () => {
        await buildReporteFile("PDF", "<script>título</script>", "2026-10", columns, [{ ...row, nombre: "<img src=x onerror=alert(1)>" }], {
            total_pagar: 1395,
        });
        expect(pdf.html).toContain("&lt;script&gt;");
        expect(pdf.html).not.toContain("<img");
        expect(pdf.html).toContain("1,395.00");
        expect(pdf.html).toContain("Neto");
        expect(pdf.html).not.toContain("total pagar");
        expect(pdf.html).toContain("box-sizing:border-box");
        expect(pdf.html).toContain("white-space:nowrap");
        expect(pdf.html).toContain("table-layout:fixed");
        expect(pdf.text).toHaveBeenCalledWith("Página 2 de 2", expect.any(Number), 204, { align: "right" });
        expect(pdf.text).toHaveBeenCalledWith(["Colaborador"], expect.any(Number), 16);
        expect(document.body.textContent).not.toContain("Período: 2026-10");
    });
    it("limpia el elemento PDF también si el generador falla", async () => {
        pdf.output.mockRejectedValue(new Error("Falló el generador"));
        await expect(buildReporteFile("PDF", "Ensayo PDF", "2026-10", columns, [row], {})).rejects.toThrow("Falló el generador");
        expect(document.body.textContent).not.toContain("Ensayo PDF");
    });
});
