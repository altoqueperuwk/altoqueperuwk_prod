import { createRoot } from "react-dom/client";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { BancariaReporteCierrePdfOficial } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-reporte-cierre-pdf-oficial";
import { getReporteEfectivizacionUnificada } from "@/features/operaciones/efectivizacion/bancaria/utils/reporte-efectivizacion";
import type { ReporteCierreCajaData, ReporteCierreCajaRow } from "./reporte-cierre-caja.service";

const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const money = (value: unknown) => Number(value ?? 0);
const percent = (value: unknown) => `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(money(value))}%`;
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

const onlyRequiredSections = (data: ReporteCierreCajaData): ReporteCierreCajaData => ({
    ...data,
    movimientos: [],
});

const normalizePart = (value: unknown, fallback: string) => String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;

export const getCierreReportFileName = (row: ReporteCierreCajaRow, extension: "pdf" | "xlsx") => {
    const datePart = row.fecha_cierre ? date(row.fecha_cierre).replaceAll("/", "") : "sin_fecha";
    return `${normalizePart(row.nombre_empresa, "empresa")}_${normalizePart(row.nombre_banco, "cuenta")}_${datePart}.${extension}`;
};

export const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export const buildCierrePdf = async (data: ReporteCierreCajaData, fileName: string) => {
    const html2pdf = (await import("html2pdf.js")).default;
    if (!document.getElementById("reporte-cierre-pdf-font")) {
        const style = document.createElement("style");
        style.id = "reporte-cierre-pdf-font";
        style.textContent = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');";
        document.head.appendChild(style);
    }

    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.left = "0";
    host.style.top = "0";
    host.style.width = "794px";
    host.style.background = "#FFFFFF";
    host.style.pointerEvents = "none";
    host.style.zIndex = "-1";
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
        root.render(<BancariaReporteCierrePdfOficial data={onlyRequiredSections(data) as never} />);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        if (document.fonts?.ready) await document.fonts.ready;
        const reportElement = host.querySelector(".report-container") ?? host;
        const output = await html2pdf()
            .set({
                margin: [0, 0, 0, 0] as [number, number, number, number],
                filename: fileName,
                image: { type: "jpeg" as const, quality: 0.98 },
                html2canvas: { scale: 3, useCORS: true, backgroundColor: "#FFFFFF", scrollY: 0, windowWidth: 794, windowHeight: Math.max(reportElement.scrollHeight, 1123) },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
                pagebreak: { mode: ["css", "legacy"], avoid: [".cover", ".kpi-card", ".section-header"] },
            } as never)
            .from(reportElement as HTMLElement)
            .outputPdf("blob");
        return output as Blob;
    } finally {
        root.unmount();
        host.remove();
    }
};

export const buildCierreExcel = async (data: ReporteCierreCajaData) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Altoque Peru WK";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Cierre de Caja", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, properties: { defaultRowHeight: 18 } });
    const colors = { navySoft: "2D3F52", paper: "F4F6F9", line: "E5E7EB", row: "F8FAFC", white: "FFFFFF", green: "10B981", coral: "F0654B" };
    const kpi = (data.kpi ?? {}) as Record<string, number>;
    const { pagadas: efectivizacion, pendientes: efectivizacionPendientes } = getReporteEfectivizacionUnificada(data);
    const pagoDeuda = (data.pago_deuda as Record<string, unknown>[] ?? []);
    const pagoDeudaPendientes = (data.pago_deuda_pendientes as Record<string, unknown>[] ?? []);
    const pos = (data.pos as Record<string, unknown>[] ?? []);
    const posPendientes = (data.pos_pendientes as Record<string, unknown>[] ?? []);
    const retenciones = (data.retenciones as Record<string, unknown>[] ?? []);
    const hasRetentionSplit = data.retenciones_pagadas !== undefined || data.retenciones_pendientes !== undefined;
    const retencionesPagadas = hasRetentionSplit
        ? (data.retenciones_pagadas as Record<string, unknown>[] ?? [])
        : retenciones.filter((row) => String(row.estado ?? row.nombre_estado ?? "").trim().toLowerCase() === "pagado");
    const retencionesPendientes = hasRetentionSplit
        ? (data.retenciones_pendientes as Record<string, unknown>[] ?? [])
        : retenciones.filter((row) => String(row.estado ?? row.nombre_estado ?? "").trim().toLowerCase() !== "pagado");
    const saldoBanco = money(kpi.caja_inicial) + money(kpi.ingresos) - money(kpi.salidas);
    worksheet.columns = [
        { width: 13 }, { width: 18 }, { width: 14 }, { width: 12 },
        { width: 12 }, { width: 13 }, { width: 13 }, { width: 11 },
        { width: 13 }, { width: 12 }, { width: 12 }, { width: 14 },
        { width: 11 }, { width: 11 },
    ];
    worksheet.views = [{ showGridLines: false }];

    const styleCell = (cell: ExcelJS.Cell, options: { bold?: boolean; size?: number; color?: string; bg?: string; align?: "left" | "center" | "right" } = {}) => {
        cell.font = { name: "Arial", size: options.size ?? 8, bold: options.bold ?? false, color: { argb: options.color ?? "1E2A38" } };
        cell.alignment = { horizontal: options.align ?? "left", vertical: "middle", wrapText: true };
        cell.border = { top: { style: "thin", color: { argb: colors.line } }, left: { style: "thin", color: { argb: colors.line } }, bottom: { style: "thin", color: { argb: colors.line } }, right: { style: "thin", color: { argb: colors.line } } };
        if (options.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.bg } };
    };
    const merge = (row: number, start: number, end: number, value: string | number, options: Parameters<typeof styleCell>[1] = {}) => {
        worksheet.mergeCells(row, start, row, end);
        const cell = worksheet.getCell(row, start);
        cell.value = value;
        styleCell(cell, options);
    };

    merge(1, 1, 14, "ALTOQUE PERU WK", { bold: true, color: colors.white, bg: colors.navySoft });
    merge(2, 1, 14, "Reporte de Cierre de Caja", { bold: true, color: colors.white, bg: colors.navySoft });
    merge(3, 1, 14, `Fecha: ${new Date().toLocaleString("es-PE")}`, { bold: true, color: colors.white, bg: colors.navySoft });
    merge(4, 1, 14, `Empresa: ${String(data.empresa ?? "Empresa").toUpperCase()}`, { bold: true, color: colors.white, bg: colors.navySoft });
    merge(5, 1, 14, `Cuenta: ${String(data.banco ?? "Cuenta").toUpperCase()}`, { bold: true, color: colors.white, bg: colors.navySoft });

    let nextRow = 7;
    [["Caja Inicial", kpi.caja_inicial], ["Caja Actual", kpi.caja_actual], ["Saldo Banco", saldoBanco], ["Caja Recaudacion", kpi.total_recaudado], ["Ingresos", kpi.ingresos], ["Salidas", kpi.salidas], ["Gastos Operacionales", kpi.gastos_operacionales], ["Ganancias", kpi.ganancias], ["Retencion Recaudacion", kpi.ingresos_retenidos], ["Fuera de Horario", kpi.fuera_horario]].forEach(([label, value], index) => {
        const row = nextRow + Math.floor(index / 4) * 2;
        const column = (index % 4) * 3 + 1;
        merge(row, column, column + 2, String(label), { bold: true, color: colors.white, bg: colors.navySoft });
        merge(row + 1, column, column + 2, money(value), { bold: true, color: ["Salidas", "Gastos Operacionales"].includes(String(label)) ? colors.coral : colors.green, bg: colors.white });
        worksheet.getCell(row + 1, column).numFmt = '"S/ "#,##0.00';
    });
    nextRow += 7;

    const addSection = (title: string, headers: string[], rows: Array<Array<string | number>>, totalIndexes: number[]) => {
        if (!rows.length) return;
        worksheet.getRow(nextRow).getCell(1).value = title;
        worksheet.getRow(nextRow).getCell(2).value = `Total: ${rows.length}`;
        styleCell(worksheet.getRow(nextRow).getCell(1), { bold: true, color: colors.white, bg: colors.navySoft });
        styleCell(worksheet.getRow(nextRow).getCell(2), { bold: true, color: colors.white, bg: colors.navySoft });
        nextRow += 1;
        headers.forEach((header, index) => { const cell = worksheet.getRow(nextRow).getCell(index + 1); cell.value = header; styleCell(cell, { bold: true, color: colors.white, bg: colors.navySoft }); });
        nextRow += 1;
        rows.forEach((values, rowIndex) => { values.forEach((value, index) => { const cell = worksheet.getRow(nextRow).getCell(index + 1); cell.value = value; if (typeof value === "number") cell.numFmt = '"S/ "#,##0.00'; styleCell(cell, { bg: rowIndex % 2 ? colors.row : colors.white }); }); nextRow += 1; });
        const total = worksheet.getRow(nextRow);
        total.getCell(1).value = "Totales";
        totalIndexes.forEach((index) => { const cell = total.getCell(index + 1); cell.value = rows.reduce((sum, row) => sum + Number(row[index] ?? 0), 0); cell.numFmt = '"S/ "#,##0.00'; });
        for (let index = 1; index <= headers.length; index += 1) styleCell(total.getCell(index), { bold: true, bg: colors.row });
        nextRow += 2;
    };

    addSection("Efectivizacion", ["Facturacion", "Empresa", "Cuenta", "Cod. Op.", "DNI", "Comunidad", "Deposito", "% Comision", "S/ Comision", "Gastos", "Ganancia", "Transferencia", "Estado", "Fecha"], efectivizacion.map((row) => [text(row.facturacion), text(row.empresa), text(row.cuenta), text(row.operacion), text(row.dni), text(row.comunidad), money(row.deposito), percent(row.porcentaje_comision), money(row.soles_comision), money(row.gastos), money(row.ganancia), money(row.transferencia), text(row.estado), date(row.fecha)]), [6, 8, 9, 10, 11]);
    addSection("Efectivizacion - Pendientes", ["Facturacion", "Empresa", "Cuenta", "Cod. Op.", "DNI", "Comunidad", "Deposito", "% Comision", "S/ Comision", "Gastos", "Ganancia", "Transferencia", "Estado", "Fecha"], efectivizacionPendientes.map((row) => [text(row.facturacion), text(row.empresa), text(row.cuenta), text(row.operacion), text(row.dni), text(row.comunidad), money(row.deposito), percent(row.porcentaje_comision), money(row.soles_comision), money(row.gastos), money(row.ganancia), money(row.transferencia), text(row.estado), date(row.fecha)]), [6, 8, 9, 10, 11]);
    addSection("Pago Deuda", ["Operacion", "DNI", "Empresa", "Cuenta", "Transferencia", "Empresa", "Cuenta", "Deposito", "% Comision", "S/ Comision", "Estado", "Fecha"], pagoDeuda.map((row) => [text(row.operacion ?? row.codigo_operacion_deposito_cliente), text(row.dni ?? row.dni_cliente), text(row.empresa_salida ?? row.nombre_empresa_salida), text(row.cuenta_salida ?? row.cuenta), money(row.transferencia ?? row.monto_transferencia), text(row.empresa_ingreso ?? row.nombre_empresa_ingreso), text(row.cuenta_ingreso), money(row.deposito ?? row.monto_devolucion), percent(row.porcentaje_comision ?? row.comision_servicio), money(row.soles_comision), text(row.estado ?? row.nombre_estado), date(row.fecha ?? row.fecha_registro)]), [4, 7]);
    addSection("Pago Deuda - Pendientes", ["Operacion", "DNI", "Empresa", "Cuenta", "Transferencia", "Empresa", "Cuenta", "Deposito", "% Comision", "S/ Comision", "Estado", "Fecha"], pagoDeudaPendientes.map((row) => [text(row.operacion ?? row.codigo_operacion_deposito_cliente), text(row.dni ?? row.dni_cliente), text(row.empresa_salida ?? row.nombre_empresa_salida), text(row.cuenta_salida ?? row.cuenta), money(row.transferencia ?? row.monto_transferencia), text(row.empresa_ingreso ?? row.nombre_empresa_ingreso), text(row.cuenta_ingreso), money(row.deposito ?? row.monto_devolucion), percent(row.porcentaje_comision ?? row.comision_servicio), money(row.soles_comision), text(row.estado ?? row.nombre_estado), date(row.fecha ?? row.fecha_registro)]), [4, 7]);
    addSection("POS", ["Cod. Op.", "DNI", "Deposito", "% Comision", "S/ Comision", "Empresa", "Cuenta", "Transferencia", "Estado", "Fecha"], pos.map((row) => [text(row.operacion ?? row.codigo_operacion_deposito_cliente), text(row.dni ?? row.dni_cliente), money(row.deposito), percent(row.porcentaje_comision), money(row.soles_comision), text(row.empresa), text(row.cuenta), money(row.transferencia), text(row.estado ?? row.nombre_estado), date(row.fecha ?? row.fecha_registro)]), [7]);
    addSection("POS - Pendientes", ["Cod. Op.", "DNI", "Deposito", "% Comision", "S/ Comision", "Empresa", "Cuenta", "Transferencia", "Estado", "Fecha"], posPendientes.map((row) => [text(row.operacion ?? row.codigo_operacion_deposito_cliente), text(row.dni ?? row.dni_cliente), money(row.deposito), percent(row.porcentaje_comision), money(row.soles_comision), text(row.empresa), text(row.cuenta), money(row.transferencia), text(row.estado ?? row.nombre_estado), date(row.fecha ?? row.fecha_registro)]), [7]);
    const retentionRows = (rows: Record<string, unknown>[]) => rows.map((row) => [
        text(row.codigo_operacion_deposito_cliente),
        text(row.dni_cliente),
        money(row.monto),
        text(row.estado ?? row.nombre_estado),
        date(row.fecha_deposito_cliente),
        date(row.fecha_corte_recaudacion),
        date(row.fecha_liberacion_abono),
        text(row.motivo_retencion),
        "Si",
    ]);
    addSection("Recaudacion Retenida - Pagadas", ["Codigo", "DNI", "Monto", "Estado", "Fecha Deposito", "Fecha Corte", "Fecha Abono", "Motivo", "Informativo"], retentionRows(retencionesPagadas), [2]);
    addSection("Recaudacion Retenida - Pendientes", ["Codigo", "DNI", "Monto", "Estado", "Fecha Deposito", "Fecha Corte", "Fecha Abono", "Motivo", "Informativo"], retentionRows(retencionesPendientes), [2]);
    merge(nextRow, 1, 14, `${data.empresa ?? "Empresa"} - Altoque Peru WK - Reporte de Cierre de Caja`, { size: 8, color: "64748B", bg: colors.paper });
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
};

export const downloadCierreExcel = async (data: ReporteCierreCajaData, fileName: string) => downloadBlob(await buildCierreExcel(onlyRequiredSections(data)), fileName);

export const downloadReportsAsZip = async (files: Array<{ name: string; blob: Blob }>, zipName: string) => {
    const zip = new JSZip();
    files.forEach((file) => zip.file(file.name, file.blob));
    downloadBlob(await zip.generateAsync({ type: "blob" }), zipName);
};
