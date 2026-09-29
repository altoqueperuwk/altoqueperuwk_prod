import ExcelJS from "exceljs";
import type { MetricasCliente, MetricasComision, MetricasComunidad, MetricasDerivacion, MetricasOperacionPendiente } from "./metricas-bancarias.types";

interface MetricasExportKpi {
    indicador: string;
    valor: string | number;
    detalle?: string;
}

interface MetricasExportInput {
    servicio?: string;
    banco: string;
    empresa: string;
    fechaDesde: string;
    fechaHasta: string;
    kpis: MetricasExportKpi[];
    commissions: MetricasComision[];
    communities: MetricasComunidad[];
    clients: MetricasCliente[];
    pendingOperations: MetricasOperacionPendiente[];
    derivations?: MetricasDerivacion[];
    sections?: MetricasReportSection[];
}

export type MetricasExportFormat = "xlsx" | "pdf";

export interface MetricasReportSection {
    title: string;
    columns: Array<{ header: string; key: string; width: number }>;
    rows: Record<string, string | number | null>[];
}

const moneyKeys = new Set(["recaudacion", "comision", "gastos", "ganancia", "ganancias", "salida", "transferencia", "montoSolicitado", "montoTransferido"]);

const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
};

const escapeHtml = (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatReportValue = (key: string, value: string | number | null) => {
    if (value == null || value === "") return "-";
    if (moneyKeys.has(key)) return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value)).replace("PEN", "S/");
    if (key === "porcentaje") return `${(Number(value) * 100).toFixed(2)}%`;
    return String(value);
};

export const exportMetricasBancarias = async (input: MetricasExportInput, format: MetricasExportFormat = "xlsx") => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Altoque Peru WK";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Reporte", {
        properties: { defaultRowHeight: 20 },
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
    const sections: MetricasReportSection[] = [];
    const maxColumns = 11;
    let nextRow = 1;

    const mergeTitleRow = (value: string, fill: string, fontSize = 12) => {
        sheet.mergeCells(nextRow, 1, nextRow, maxColumns);
        const cell = sheet.getCell(nextRow, 1);
        cell.value = value;
        cell.font = { bold: true, size: fontSize, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.alignment = { vertical: "middle" };
        sheet.getRow(nextRow).height = fontSize >= 15 ? 28 : 23;
        nextRow += 1;
    };

    mergeTitleRow(`Métricas Bancarias - ${input.servicio ?? "Efectivización"}`, "FF1E293B", 16);
    mergeTitleRow(`Banco: ${input.banco} | Empresa/Sede: ${input.empresa} | Periodo: ${input.fechaDesde} al ${input.fechaHasta}`, "FF344054", 10);
    nextRow += 1;
    mergeTitleRow("KPIs", "FF6941C6");
    const kpiHeader = sheet.getRow(nextRow);
    kpiHeader.getCell(1).value = "Indicador";
    kpiHeader.getCell(2).value = "Valor";
    kpiHeader.getCell(3).value = "Detalle";
    for (let index = 1; index <= 3; index += 1) {
        kpiHeader.getCell(index).font = { bold: true, color: { argb: "FFFFFFFF" } };
        kpiHeader.getCell(index).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7F56D9" } };
    }
    nextRow += 1;
    input.kpis.forEach((item) => {
        const row = sheet.getRow(nextRow);
        row.getCell(1).value = item.indicador;
        row.getCell(2).value = item.valor;
        row.getCell(3).value = item.detalle ?? "";
        row.getCell(1).font = { bold: true };
        nextRow += 1;
    });
    nextRow += 1;

    const addSheet = (name: string, columns: Array<{ header: string; key: string; width: number }>, rows: Record<string, string | number | null>[]) => {
        sections.push({ title: name, columns, rows });
        sheet.mergeCells(nextRow, 1, nextRow, Math.max(columns.length, 2));
        const titleCell = sheet.getCell(nextRow, 1);
        titleCell.value = name;
        titleCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF344054" } };
        nextRow += 1;
        const headerRow = sheet.getRow(nextRow);
        columns.forEach((column, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = column.header;
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6941C6" } };
            cell.alignment = { vertical: "middle", wrapText: true };
            sheet.getColumn(index + 1).width = Math.max(sheet.getColumn(index + 1).width ?? 0, column.width);
        });
        nextRow += 1;
        rows.forEach((item, rowIndex) => {
            const row = sheet.getRow(nextRow);
            columns.forEach((column, columnIndex) => {
                const cell = row.getCell(columnIndex + 1);
                cell.value = item[column.key];
                cell.alignment = { vertical: "middle", wrapText: true };
                cell.border = { bottom: { style: "thin", color: { argb: "FFD0D5DD" } } };
                if (moneyKeys.has(column.key)) cell.numFmt = '"S/ "#,##0.00';
                if (column.key === "porcentaje") cell.numFmt = "0.00%";
            });
            row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowIndex % 2 === 0 ? "FFFFFFFF" : "FFF7F7F8" } };
            nextRow += 1;
        });
        if (!rows.length) {
            sheet.getCell(nextRow, 1).value = "No hay resultados para mostrar.";
            nextRow += 1;
        }
        nextRow += 2;
        return sheet;
    };

    if (input.sections) {
        input.sections.forEach((section) => addSheet(section.title, section.columns, section.rows));
    } else {
    addSheet("Comisiones", [
        { header: "Porcentaje", key: "porcentaje", width: 14 }, { header: "Operaciones", key: "operaciones", width: 14 },
        { header: "Recaudacion", key: "recaudacion", width: 18 }, { header: "Comision", key: "comision", width: 18 },
        { header: "Gasto Operacional", key: "gastos", width: 20 }, { header: "Ganancia", key: "ganancias", width: 18 }, { header: "Salida", key: "salida", width: 18 },
    ], input.commissions.map((row) => ({ porcentaje: row.porcentaje / 100, operaciones: row.operaciones, recaudacion: row.recaudacion, comision: row.comision, gastos: row.gastosOperacionales, ganancias: row.ganancias, salida: row.salida })));

    addSheet("Comunidades", [
        { header: "Comunidad", key: "comunidad", width: 24 }, { header: "Operaciones", key: "operaciones", width: 14 },
        { header: "Recaudacion", key: "recaudacion", width: 18 }, { header: "Comision", key: "comision", width: 18 },
        { header: "Gasto Operacional", key: "gastos", width: 20 }, { header: "Ganancia", key: "ganancias", width: 18 },
        { header: "Salida", key: "salida", width: 18 }, { header: "Clientes Nuevos", key: "clientes", width: 16 }, { header: "Pendientes", key: "pendientes", width: 14 },
    ], input.communities.map((row) => ({ comunidad: row.comunidad, operaciones: row.operaciones, recaudacion: row.recaudacion, comision: row.comision, gastos: row.gastosOperacionales, ganancias: row.ganancias, salida: row.salida, clientes: row.clientesNuevos, pendientes: row.operacionesPendientes })));

    addSheet("Top clientes", [
        { header: "DNI", key: "dni", width: 16 }, { header: "Nombre Completo", key: "nombre", width: 36 }, { header: "Comunidad", key: "comunidad", width: 24 },
        { header: "Operaciones", key: "operaciones", width: 14 }, { header: "Pendientes", key: "pendientes", width: 14 }, { header: "Recaudacion", key: "recaudacion", width: 18 },
        { header: "Comision", key: "comision", width: 18 }, { header: "Gasto Operacional", key: "gastos", width: 20 }, { header: "Ganancia", key: "ganancias", width: 18 }, { header: "Salida", key: "salida", width: 18 },
    ], input.clients.map((row) => ({ dni: row.dni, nombre: row.nombreCompleto, comunidad: row.comunidad, operaciones: row.operaciones, pendientes: row.operacionesPendientes, recaudacion: row.recaudacion, comision: row.comision, gastos: row.gastosOperacionales, ganancias: row.ganancias, salida: row.salida })));

    addSheet("Pendientes", [
        { header: "Codigo", key: "codigo", width: 18 }, { header: "DNI", key: "dni", width: 16 }, { header: "Cliente", key: "cliente", width: 36 },
        { header: "Comunidad", key: "comunidad", width: 24 }, { header: "Banco", key: "banco", width: 16 }, { header: "Empresa", key: "empresa", width: 30 },
        { header: "Cuenta", key: "cuenta", width: 20 }, { header: "Fecha", key: "fecha", width: 22 }, { header: "Recaudacion", key: "recaudacion", width: 18 },
        { header: "Transferencia", key: "transferencia", width: 18 }, { header: "Estado actual", key: "estado", width: 18 },
    ], input.pendingOperations.map((row) => ({ codigo: row.codigoOperacion, dni: row.dni, cliente: row.nombreCompleto, comunidad: row.comunidad, banco: row.ruta.toUpperCase(), empresa: row.empresa, cuenta: row.cuenta, fecha: row.fecha, recaudacion: row.recaudacion, transferencia: row.transferencia, estado: row.estado })));

    if (input.derivations) {
        addSheet("Derivaciones atendidas", [
            { header: "Envio", key: "empresa", width: 30 },
            { header: "Banco origen", key: "banco", width: 20 },
            { header: "Comunidad", key: "comunidad", width: 22 },
            { header: "% Comision", key: "porcentaje", width: 14 },
            { header: "Operaciones", key: "operaciones", width: 16 },
            { header: "Gastos Operacionales", key: "gastos", width: 22 },
            { header: "Transferido al cliente", key: "transferencia", width: 22 },
        ], input.derivations.map((row) => ({
            empresa: row.empresaContraparte,
            banco: row.bancoContraparte,
            comunidad: row.comunidad,
            porcentaje: row.porcentajeComision / 100,
            operaciones: row.operaciones,
            gastos: row.gastosOperacionales,
            transferencia: row.montoTransferido,
        })));
    }
    }

    const safeBank = input.banco.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
    const baseName = `metricas-bancarias-${safeBank}-${input.fechaDesde}-${input.fechaHasta}`;
    if (format === "xlsx") {
        const output = await workbook.xlsx.writeBuffer();
        downloadBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${baseName}.xlsx`);
        return;
    }

    const sectionHtml = sections.map((section) => `
        <section>
            <h2>${escapeHtml(section.title)}</h2>
            <table>
                <thead><tr>${section.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("")}</tr></thead>
                <tbody>${section.rows.length
                    ? section.rows.map((row) => `<tr>${section.columns.map((column) => `<td>${escapeHtml(formatReportValue(column.key, row[column.key]))}</td>`).join("")}</tr>`).join("")
                    : `<tr><td colspan="${section.columns.length}">No hay resultados para mostrar.</td></tr>`}
                </tbody>
            </table>
        </section>
    `).join("");
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.left = "-100000px";
    host.innerHTML = `
        <style>
            .metricas-report { width:1123px; padding:28px; background:#fff; color:#1e293b; font-family:Arial,sans-serif; font-size:9px; }
            .metricas-report header { padding:18px 20px; color:#fff; background:#1e293b; border-radius:8px; }
            .metricas-report h1 { margin:0; font-size:18px; }
            .metricas-report .meta { margin-top:8px; color:#d0d5dd; }
            .metricas-report h2 { margin:18px 0 6px; padding:7px 9px; color:#fff; background:#344054; font-size:11px; break-after:avoid; }
            .metricas-report .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:12px; }
            .metricas-report .kpi { padding:8px; border:1px solid #d0d5dd; border-radius:5px; }
            .metricas-report .kpi-label { color:#667085; font-size:8px; }
            .metricas-report .kpi-value { margin-top:3px; font-weight:700; }
            .metricas-report table { width:100%; border-collapse:collapse; table-layout:auto; }
            .metricas-report th { padding:6px 5px; color:#fff; background:#6941c6; text-align:left; font-size:7px; }
            .metricas-report td { padding:6px 5px; border-bottom:1px solid #e4e7ec; vertical-align:top; overflow-wrap:anywhere; }
            .metricas-report tr { break-inside:avoid; }
            .metricas-report tbody tr:nth-child(even) { background:#f7f7f8; }
            @page { size:A4 landscape; margin:6mm; }
        </style>
        <div class="metricas-report">
            <header>
                <h1>Métricas Bancarias - ${escapeHtml(input.servicio ?? "Efectivización")}</h1>
                <div class="meta">Banco: ${escapeHtml(input.banco)} | Empresa/Sede: ${escapeHtml(input.empresa)} | Periodo: ${escapeHtml(input.fechaDesde)} al ${escapeHtml(input.fechaHasta)}</div>
            </header>
            <div class="kpis">${input.kpis.map((item) => `<div class="kpi"><div class="kpi-label">${escapeHtml(item.indicador)}</div><div class="kpi-value">${escapeHtml(item.valor)}</div>${item.detalle ? `<div class="kpi-label">${escapeHtml(item.detalle)}</div>` : ""}</div>`).join("")}</div>
            ${sectionHtml}
        </div>
    `;
    document.body.appendChild(host);
    try {
        const html2pdf = (await import("html2pdf.js")).default;
        const report = host.querySelector(".metricas-report") as HTMLElement;
        await html2pdf().set({
            margin: 0,
            filename: `${baseName}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, backgroundColor: "#FFFFFF", useCORS: true },
            jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        }).from(report).save();
    } finally {
        host.remove();
    }
};
