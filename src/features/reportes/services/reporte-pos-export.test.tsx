// @vitest-environment jsdom
import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildCierreExcel } from "./reporte-cierre-caja-download";
import { BancariaReporteCierrePdfOficial } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-reporte-cierre-pdf-oficial";

const headers = ["Cod. Op.", "POS", "Empresa POS", "DNI", "Deposito", "% Comision", "S/ Comision", "Empresa", "Cuenta", "Transferencia", "Estado", "Fecha"];
const data = { empresa: "A Cuenta WK S.A.", banco: "BBVA", ruta: "bbva", pos: [{
    operacion: "45654654", nombre_pos: "CULQI", nombre_empresa_pos: "Hueso Cash S.A.", dni: "47356534",
    deposito: 1000, porcentaje_comision: 8, soles_comision: 80, empresa: "A Cuenta WK S.A.", cuenta: "BBVA",
    transferencia: 920, estado: "Pagado", fecha: "2026-11-11T19:57:00-05:00",
}] };

it("exporta POS y Empresa POS en orden y mantiene transferencia y totales", async () => {
    const blob = await buildCierreExcel(data);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.worksheets[0];
    let headerRow = 0;
    sheet.eachRow((row, index) => { if (row.getCell(1).text === "Cod. Op." && row.getCell(2).text === "POS") headerRow = index; });
    expect(headerRow).toBeGreaterThan(0);
    expect(Array.from({ length: 12 }, (_, i) => sheet.getRow(headerRow).getCell(i + 1).value)).toEqual(headers);
    expect(Array.from({ length: 11 }, (_, i) => sheet.getRow(headerRow + 1).getCell(i + 1).value)).toEqual(["45654654", "CULQI", "Hueso Cash S.A.", "47356534", 1000, "8%", 80, "A Cuenta WK S.A.", "BBVA", 920, "Pagado"]);
    expect(sheet.getRow(headerRow + 2).getCell(10).value).toBe(920);
    mkdirSync("outputs/pos-export-dev-20261111", { recursive: true });
    writeFileSync("outputs/pos-export-dev-20261111/example.xlsx", bytes);
});

it("renderiza las columnas y el total bajo Transferencia en el PDF oficial", () => {
    const html = renderToStaticMarkup(<BancariaReporteCierrePdfOficial data={data as never} />);
    const dom = new DOMParser().parseFromString(html, "text/html");
    const table = Array.from(dom.querySelectorAll("table")).find(t => t.textContent?.includes("CULQI"));
    expect(table).toBeTruthy();
    expect(Array.from(table!.querySelectorAll("th")).map(x => x.textContent)).toEqual(headers);
    expect(table!.querySelector(".total-row td")?.getAttribute("colspan")).toBe("9");
    writeFileSync("outputs/pos-export-dev-20261111/example.html", '<meta charset="utf-8">' + html);
    const legacy = renderToStaticMarkup(<BancariaReporteCierrePdfOficial data={{ ...data, pos: [{ ...data.pos[0], nombre_pos: null, nombre_empresa_pos: null }] } as never} />);
    expect(legacy).toContain("—");
});
