import ExcelJS from "exceljs";
import type { ReporteColumna, ReporteFormato } from "./reportes.types";

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const escapeHtml = (value: unknown) =>
    text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const csvSafe = (value: string) => (/^[=+\-@]/.test(value) ? `'${value}` : value);
const display = (value: unknown, kind: ReporteColumna["kind"]) =>
    kind === "money"
        ? new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value ?? 0))
        : kind === "percent"
          ? `${Number(value ?? 0).toFixed(2)}%`
          : kind === "date" && value
            ? new Date(String(value)).toLocaleString("es-PE")
            : text(value);
const safeName = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
const hashBlob = async (blob: Blob) =>
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
export const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export const buildReporteFile = async (
    format: ReporteFormato,
    title: string,
    period: string,
    columns: ReporteColumna[],
    rows: Record<string, unknown>[],
    summary: Record<string, unknown>,
) => {
    const extension = format.toLowerCase();
    const fileName = `${safeName(title)}_${period.slice(0, 7) || "periodo"}.${extension}`;
    let blob: Blob;
    if (format === "CSV") {
        const escape = (value: string) => `"${csvSafe(value).replaceAll('"', '""')}"`;
        const lines = [
            columns.map((column) => escape(column.label)).join(","),
            ...rows.map((row) => columns.map((column) => escape(display(row[column.key], column.kind))).join(",")),
        ];
        blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    } else if (format === "XLSX") {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Al Toque Perú WK";
        const sheet = workbook.addWorksheet("Reporte");
        sheet.addRow([title]);
        sheet.mergeCells(1, 1, 1, Math.max(columns.length, 1));
        sheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: "FFFFFF" } };
        sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "6941C6" } };
        sheet.addRow([`Período: ${period}`]);
        Object.entries(summary).forEach(([key, value]) => sheet.addRow([key.replaceAll("_", " "), text(value)]));
        sheet.addRow([]);
        const header = sheet.addRow(columns.map((column) => column.label));
        header.font = { bold: true, color: { argb: "FFFFFF" } };
        header.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "344054" } };
        });
        rows.forEach((row) =>
            sheet.addRow(
                columns.map((column) =>
                    column.kind === "money" || column.kind === "number" || column.kind === "percent" ? Number(row[column.key] ?? 0) : text(row[column.key]),
                ),
            ),
        );
        sheet.columns.forEach((column) => {
            column.width = 22;
        });
        const output = await workbook.xlsx.writeBuffer();
        blob = new Blob([output as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    } else {
        const html2pdf = (await import("html2pdf.js")).default;
        const host = document.createElement("div");
        host.style.cssText = "width:1050px;padding:32px;background:#fff;color:#101828;font-family:Arial,sans-serif";
        const summaryHtml = Object.entries(summary)
            .map(
                ([key, value]) =>
                    `<div style="padding:8px;border:1px solid #e4e7ec"><b>${escapeHtml(key.replaceAll("_", " "))}</b><br>${escapeHtml(value)}</div>`,
            )
            .join("");
        const headerHtml = columns
            .map((column) => `<th style="padding:8px;text-align:left;background:#344054;color:#fff">${escapeHtml(column.label)}</th>`)
            .join("");
        const rowsHtml = rows
            .map(
                (row) =>
                    `<tr>${columns.map((column) => `<td style="padding:7px;border-bottom:1px solid #e4e7ec">${escapeHtml(display(row[column.key], column.kind))}</td>`).join("")}</tr>`,
            )
            .join("");
        host.innerHTML = `<h1>${escapeHtml(title)}</h1><p>Período: ${escapeHtml(period)}</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0">${summaryHtml}</div><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
        document.body.appendChild(host);
        try {
            blob = (await html2pdf()
                .set({
                    margin: 8,
                    filename: fileName,
                    image: { type: "jpeg", quality: 0.96 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
                } as never)
                .from(host)
                .outputPdf("blob")) as Blob;
        } finally {
            host.remove();
        }
    }
    return { blob, fileName, hash: await hashBlob(blob) };
};
