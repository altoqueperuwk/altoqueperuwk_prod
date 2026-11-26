import ExcelJS from "exceljs";
import type { ReporteColumna, ReporteFormato } from "./reportes.types";

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const escapeHtml = (value: unknown) =>
    text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const csvSafe = (value: string) => (/^[=+\-@]/.test(value) ? `'${value}` : value);
const numericValue = (value: unknown): number | null => {
    if (value == null || typeof value === "boolean" || (typeof value !== "number" && typeof value !== "string")) return null;
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const display = (value: unknown, kind: ReporteColumna["kind"]) => {
    if (kind === "money" || kind === "percent" || kind === "number") {
        const numeric = numericValue(value);
        if (numeric === null) return "—";
        if (kind === "money") return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(numeric);
        return kind === "percent" ? `${numeric.toFixed(2)}%` : String(numeric);
    }
    if (kind === "date") {
        const date = value ? new Date(String(value)) : null;
        return date && Number.isFinite(date.getTime()) ? date.toLocaleString("es-PE", { timeZone: "America/Lima" }) : "—";
    }
    return text(value);
};
const summaryLabels: Record<string, string> = {
    total_colaboradores: "Colaboradores",
    total_sueldo_bruto: "Sueldo bruto",
    total_bonos: "Bonos",
    total_comisiones: "Bonos por Comisión",
    total_ingresos: "Ingresos",
    total_descuentos: "Penalidades",
    total_pagar: "Neto",
    total_pagado: "Pagado",
    total_pendiente: "Saldo pendiente",
    total_neto: "Total neto",
    total_conceptos: "Conceptos",
    total_sedes: "Sedes",
};
const summaryLabel = (key: string) => summaryLabels[key] ?? key.replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const summaryDisplay = (key: string, value: unknown) =>
    /sueldo|bono|comision|ingreso|descuento|pagar|pagado|pendiente|neto|importe|monto/.test(key)
        ? display(value, "money")
        : key.includes("porcentaje")
          ? display(value, "percent")
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
        Object.entries(summary).forEach(([key, value]) => sheet.addRow([summaryLabel(key), text(value)]));
        sheet.addRow([]);
        const header = sheet.addRow(columns.map((column) => column.label));
        header.font = { bold: true, color: { argb: "FFFFFF" } };
        header.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "344054" } };
        });
        rows.forEach((row) => {
            const added = sheet.addRow(
                columns.map((column) =>
                    column.kind === "money" || column.kind === "number" || column.kind === "percent" ? numericValue(row[column.key]) : text(row[column.key]),
                ),
            );
            columns.forEach((column, index) => {
                if (column.kind === "money") added.getCell(index + 1).numFmt = '"S/ "#,##0.00';
                if (column.kind === "percent") added.getCell(index + 1).numFmt = '0.00"%"';
            });
        });
        sheet.columns.forEach((column) => {
            column.width = 22;
        });
        const output = await workbook.xlsx.writeBuffer();
        blob = new Blob([output as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    } else {
        const html2pdf = (await import("html2pdf.js")).default;
        const host = document.createElement("div");
        host.style.cssText = "width:100%;box-sizing:border-box;padding:20px;background:#fff;color:#101828;font-family:Arial,sans-serif";
        const summaryHtml = Object.entries(summary)
            .map(
                ([key, value]) =>
                    `<div style="box-sizing:border-box;min-width:0;padding:8px;border:1px solid #e4e7ec;break-inside:avoid"><b>${escapeHtml(summaryLabel(key))}</b><br>${escapeHtml(summaryDisplay(key, value))}</div>`,
            )
            .join("");
        const headerHtml = columns
            .map((column) => `<th style="padding:5px;text-align:left;background:#344054;color:#fff;overflow-wrap:anywhere">${escapeHtml(column.label)}</th>`)
            .join("");
        const weights = columns.map((column, index) =>
            column.kind === "money" || column.kind === "number" || column.kind === "percent" ? 1 : index === 0 ? 4 : 1.5,
        );
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        const widths = weights.map((weight) => weight / totalWeight);
        const colgroup = widths.map((width) => `<col style="width:${width * 100}%">`).join("");
        const rowsHtml = rows
            .map(
                (row) =>
                    `<tr style="break-inside:avoid">${columns.map((column) => `<td style="padding:6px 5px;border-bottom:1px solid #e4e7ec;${column.kind === "money" || column.kind === "number" || column.kind === "percent" ? "white-space:nowrap" : "overflow-wrap:anywhere"}">${escapeHtml(display(row[column.key], column.kind))}</td>`).join("")}</tr>`,
            )
            .join("");
        host.innerHTML = `<h1 style="font-size:24px;margin:0 0 12px;overflow-wrap:anywhere">${escapeHtml(title)}</h1><p>Período: ${escapeHtml(period)}</p><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:18px 0;font-size:12px">${summaryHtml}</div><table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:9px"><colgroup>${colgroup}</colgroup><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
        document.body.appendChild(host);
        try {
            const pdf = await html2pdf()
                .set({
                    margin: [22, 8, 14, 8],
                    filename: fileName,
                    image: { type: "jpeg", quality: 0.96 },
                    html2canvas: { scale: 2 },
                    pagebreak: { mode: ["css", "legacy"], avoid: "tr" },
                    jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
                } as never)
                .from(host)
                .toPdf()
                .get("pdf");
            const pages = pdf.getNumberOfPages();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            for (let page = 1; page <= pages; page++) {
                pdf.setPage(page);
                pdf.setTextColor(52, 64, 84);
                if (page > 1) {
                    pdf.setFontSize(9);
                    pdf.text(pdf.splitTextToSize(`${title} - ${period}`, pageWidth - 26)[0], 13.3, 9);
                    pdf.setFontSize(6);
                    let x = 13.3;
                    columns.forEach((column, index) => {
                        const width = (pageWidth - 26.6) * widths[index];
                        pdf.text(pdf.splitTextToSize(column.label, Math.max(width - 3, 1)).slice(0, 2), x + 1.3, 16);
                        x += width;
                    });
                }
                pdf.setFontSize(8);
                pdf.text(`Página ${page} de ${pages}`, pageWidth - 13.3, pageHeight - 6, { align: "right" });
            }
            blob = pdf.output("blob");
        } finally {
            host.remove();
        }
    }
    return { blob, fileName, hash: await hashBlob(blob) };
};
