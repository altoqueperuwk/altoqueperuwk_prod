import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDate } from "@internationalized/date";
import ExcelJS from "exceljs";
import { Calendar as CalendarIcon, ChevronDown, Download01, File06, File07 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Calendar } from "@/components/application/date-picker/calendar";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { OperacionConfigDropdown } from "@/features/operaciones/efectivizacion/shared/components/operacion-config-dropdown";
import { OperacionReglasEfectivizacionModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-reglas-efectivizacion-modal";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionAsistidaKpi, OperacionProceso, OperacionRuta } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { isAdministrator, isJefeTienda, useAuth } from "@/providers/auth-provider";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { formatDateValue, getPeruDateValue } from "@/features/operaciones/efectivizacion/shared/utils/date";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { AsistidaOperationalBoard } from "@/features/operaciones/efectivizacion/asistida/components/asistida-operational-board";
import { AsistidaSolicitudForm } from "@/features/operaciones/efectivizacion/asistida/components/asistida-solicitud-form";
import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";
import { AsistidaReportPdf, getAsistidaReportCellValue, getAsistidaReportColumns } from "@/features/operaciones/efectivizacion/asistida/components/asistida-reporte";
import { useToast } from "@/providers/toast-provider";

interface AsistidaPageProps {
    ruta: Extract<OperacionRuta, "pos" | "linkpago">;
}

const getTodayValue = getPeruDateValue;

const stringToCalendarDate = (str: string) => {
    const [year, month, day] = str.split("-").map(Number);
    return new CalendarDate(year, month, day);
};

export const AsistidaPage = ({ ruta }: AsistidaPageProps) => {
    const { businessUser } = useAuth();
    const [refreshKey, setRefreshKey] = useState(0);
    const [isReglasOpen, setIsReglasOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayValue);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [kpi, setKpi] = useState<OperacionAsistidaKpi | null>(null);
    const [isKpiLoading, setIsKpiLoading] = useState(false);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const { addToast } = useToast();
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const canViewAllAssisted = isAdministrator(businessUser) || isJefeTienda(businessUser);
    const { data: cajas, error, isLoading } = useRouteCompanies(ruta);
    const primaryCompany = useMemo(
        () => cajas.find((caja) => caja.flag_caja_ingreso_principal) ?? cajas[0] ?? null,
        [cajas],
    );
    const routeLabel = getRutaLabel(ruta);

    const loadReportData = async () => {
        if (userId === null) throw new Error("No se encontro el usuario autenticado.");
        const params: Record<string, unknown> = {
            p_ruta: ruta,
            p_fecha_registro_desde: `${selectedDate}T00:00:00`,
            p_fecha_registro_hasta: `${selectedDate}T23:59:59`,
        };
        if (!canViewAllAssisted) params.p_id_usuario_solicitud = userId;
        const [rows, deletedRows, kpiRows] = await Promise.all([
            operacionesRpcService.getOperacionAsistidaBandeja(params),
            operacionesRpcService.getOperacionAsistidaBandeja({ ...params, p_nombre_estado: "Eliminado" }),
            operacionesRpcService.getOperacionAsistidaKpi(params),
        ]);
        return {
            rows: (rows ?? []).filter((row) => Number(row.id_estado) !== 10),
            deletedRows: deletedRows ?? [],
            kpi: kpiRows[0] ?? null,
        };
    };

    const getReportFileName = (extension: string) => {
        const safeRoute = ruta === "linkpago" ? "linkpago" : "pos";
        return `${safeRoute}-${selectedDate.replaceAll("-", "")}.${extension}`;
    };

    const downloadExcel = async (rows: OperacionProceso[], deletedRows: OperacionProceso[], reportKpi: OperacionAsistidaKpi | null) => {
        const columns = getAsistidaReportColumns(ruta);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Altoque Peru WK";
        const sheet = workbook.addWorksheet(ruta === "linkpago" ? "LinkPago" : "POS", { properties: { defaultRowHeight: 19 } });
        sheet.views = [{ showGridLines: false }];
        sheet.columns = columns.map((column) => ({ width: column.key === "hora" ? 20 : column.key === "comisionEcompany" || column.key === "comisionAtk" ? 19 : 16 }));
        const colors = { navy: "1E2A38", white: "FFFFFF", line: "E5E7EB", row: "F8FAFC", ink: "334155" };
        const styleCell = (cell: ExcelJS.Cell, options: { bold?: boolean; color?: string; bg?: string } = {}) => {
            cell.font = { name: "Arial", size: 9, bold: options.bold ?? false, color: { argb: options.color ?? colors.ink } };
            cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
            cell.border = {
                top: { style: "thin", color: { argb: colors.line } },
                bottom: { style: "thin", color: { argb: colors.line } },
                left: { style: "thin", color: { argb: colors.line } },
                right: { style: "thin", color: { argb: colors.line } },
            };
            if (options.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.bg } };
        };
        const mergeRow = (row: number, value: string, options: { bold?: boolean; color?: string; bg?: string } = {}) => {
            sheet.mergeCells(row, 1, row, columns.length);
            const cell = sheet.getCell(row, 1);
            cell.value = value;
            styleCell(cell, options);
        };
        const userName = businessUser?.nombre ?? businessUser?.username ?? "-";
        mergeRow(1, "ALTOQUE PERU WK", { bold: true, color: colors.white, bg: colors.navy });
        mergeRow(2, `Reporte de ${ruta === "linkpago" ? "LinkPago" : "POS"}`, { bold: true, color: colors.white, bg: colors.navy });
        mergeRow(3, `Fecha: ${selectedDate} | Usuario: ${userName}`, { color: colors.white, bg: colors.navy });
        mergeRow(5, "Indicadores", { bold: true, color: colors.white, bg: colors.navy });
        ["Comisiones", "Gastos", "Ganancia", "Salidas"].forEach((label, index) => {
            const labelCell = sheet.getCell(6, index + 1);
            labelCell.value = label;
            styleCell(labelCell, { bold: true, color: colors.white, bg: colors.navy });
            const valueCell = sheet.getCell(7, index + 1);
            valueCell.value = [reportKpi?.comisiones, reportKpi?.gastos, reportKpi?.ganancia, reportKpi?.salidas][index] ?? 0;
            valueCell.numFmt = '"S/ "#,##0.00';
            styleCell(valueCell, { bold: true });
        });
        mergeRow(9, `${ruta === "linkpago" ? "LinkPago" : "POS"} | Total: ${rows.length}`, { bold: true, color: colors.white, bg: colors.navy });
        const headerRow = sheet.getRow(10);
        columns.forEach((column, index) => {
            headerRow.getCell(index + 1).value = column.label;
            styleCell(headerRow.getCell(index + 1), { bold: true, color: colors.white, bg: colors.navy });
        });
        rows.forEach((row, rowIndex) => {
            const excelRow = sheet.getRow(11 + rowIndex);
            excelRow.height = 30;
            columns.forEach((column, index) => {
                const cell = excelRow.getCell(index + 1);
                const rawValue = getAsistidaReportCellValue(row, column.key);
                cell.value = column.key === "comision"
                    ? `${formatMoney(Number(rawValue))} (${row.comision_servicio ?? 0}%)`
                    : rawValue;
                styleCell(cell, { bg: rowIndex % 2 ? colors.row : colors.white });
                if (column.money && column.key !== "comision") cell.numFmt = '"S/ "#,##0.00';
            });
        });
        const totalRow = sheet.getRow(11 + rows.length);
        totalRow.getCell(1).value = "Totales";
        columns.forEach((column, index) => {
            if (!column.money) return;
            totalRow.getCell(index + 1).value = rows.reduce((sum, row) => sum + Number(getAsistidaReportCellValue(row, column.key)), 0);
            totalRow.getCell(index + 1).numFmt = '"S/ "#,##0.00';
        });
        for (let index = 1; index <= columns.length; index += 1) styleCell(totalRow.getCell(index), { bold: true, bg: colors.row });
        if (deletedRows.length > 0) {
            const deletedTitleRow = totalRow.number + 2;
            mergeRow(deletedTitleRow, `Operaciones Eliminadas | Total: ${deletedRows.length}`, { bold: true, color: colors.white, bg: colors.navy });
            const deletedHeaderRow = sheet.getRow(deletedTitleRow + 1);
            columns.forEach((column, index) => {
                deletedHeaderRow.getCell(index + 1).value = column.label;
                styleCell(deletedHeaderRow.getCell(index + 1), { bold: true, color: colors.white, bg: colors.navy });
            });
            deletedRows.forEach((row, rowIndex) => {
                const excelRow = sheet.getRow(deletedTitleRow + 2 + rowIndex);
                excelRow.height = 30;
                columns.forEach((column, index) => {
                    const cell = excelRow.getCell(index + 1);
                    const rawValue = column.key === "estado" ? "Eliminado" : getAsistidaReportCellValue(row, column.key);
                    cell.value = column.key === "comision"
                        ? `${formatMoney(Number(rawValue))} (${row.comision_servicio ?? 0}%)`
                        : rawValue;
                    styleCell(cell, { bg: rowIndex % 2 ? colors.row : colors.white });
                    if (column.money && column.key !== "comision") cell.numFmt = '"S/ "#,##0.00';
                });
            });
        }
        const buffer = await workbook.xlsx.writeBuffer();
        const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = getReportFileName("xlsx");
        link.click();
        URL.revokeObjectURL(url);
    };

    const downloadPdf = async (rows: OperacionProceso[], deletedRows: OperacionProceso[], reportKpi: OperacionAsistidaKpi | null) => {
        const html2pdf = (await import("html2pdf.js")).default;
        const host = document.createElement("div");
        host.style.position = "absolute";
        host.style.left = "0";
        host.style.top = "0";
        host.style.width = "794px";
        host.style.zIndex = "9999";
        host.style.background = "#FFFFFF";
        host.style.pointerEvents = "none";
        document.body.appendChild(host);
        const root = createRoot(host);
        try {
            root.render(<AsistidaReportPdf ruta={ruta} rows={rows} deletedRows={deletedRows} date={selectedDate} userName={String(businessUser?.nombre ?? businessUser?.username ?? "-")} kpi={reportKpi} />);
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const element = host.querySelector(".asistida-report") as HTMLElement | null;
            if (!element) throw new Error("No se pudo preparar el reporte PDF.");
            await html2pdf().set({
                margin: 0,
                filename: getReportFileName("pdf"),
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 3, backgroundColor: "#FFFFFF", useCORS: true },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            }).from(element).save();
        } finally {
            root.unmount();
            host.remove();
        }
    };

    const handleDownload = async (format: "pdf" | "xlsx") => {
        setIsDownloadOpen(false);
        setIsDownloading(true);
        try {
            const report = await loadReportData();
            if (format === "pdf") await downloadPdf(report.rows, report.deletedRows, report.kpi);
            else await downloadExcel(report.rows, report.deletedRows, report.kpi);
            addToast("success", "Reporte descargado correctamente.");
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo generar el reporte.");
        } finally {
            setIsDownloading(false);
        }
    };

    useEffect(() => {
        let ignore = false;
        if (userId === null) {
            setKpi(null);
            setIsKpiLoading(false);
            return () => { ignore = true; };
        }
        setIsKpiLoading(true);

        const kpiParams: Record<string, unknown> = {
            p_ruta: ruta,
            p_fecha_registro_desde: `${selectedDate}T00:00:00`,
            p_fecha_registro_hasta: `${selectedDate}T23:59:59`,
        };
        if (!canViewAllAssisted) kpiParams.p_id_usuario_solicitud = userId;

        operacionesRpcService
            .getOperacionAsistidaKpi(kpiParams)
            .then((rows) => {
                if (!ignore) setKpi(rows[0] ?? null);
            })
            .finally(() => {
                if (!ignore) setIsKpiLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [canViewAllAssisted, refreshKey, ruta, selectedDate, userId]);

    const kpiCards = [
        { label: "Comisiones", value: formatMoney(kpi?.comisiones), tone: "text-concept-ingreso" },
        { label: "Gastos", value: formatMoney(kpi?.gastos), tone: "text-concept-gasto" },
        { label: "Ganancia", value: formatMoney(kpi?.ganancia), tone: "text-concept-ganancia" },
        { label: "Salidas", value: formatMoney(kpi?.salidas), tone: "text-concept-salida" },
    ];

    const handleCalendarChange = (date: any) => {
        if (date) {
            setSelectedDate(`${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`);
            setIsCalendarOpen(false);
        }
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="flex items-end gap-2">
                        <div className="relative">
                            <Button size="sm" color="secondary" iconLeading={CalendarIcon} onClick={() => setIsCalendarOpen(!isCalendarOpen)}>
                                {formatDateValue(selectedDate)}
                            </Button>
                            {isCalendarOpen && (
                                <div className="absolute right-0 top-full z-50 mt-2">
                                    <div className="rounded-lg border border-secondary bg-primary p-3 shadow-lg">
                                        <Calendar value={stringToCalendarDate(selectedDate)} onChange={handleCalendarChange}>
                                            <div />
                                        </Calendar>
                                    </div>
                                </div>
                            )}
                        </div>
                        <Dropdown.Root>
                            <Button size="sm" color="secondary" iconLeading={Download01} iconTrailing={ChevronDown} isLoading={isDownloading}>
                                Descargar
                            </Button>
                            <Dropdown.Popover className="w-48">
                                <Dropdown.Menu>
                                    <Dropdown.Item icon={File06} isDisabled={isDownloading} onAction={() => void handleDownload("xlsx")}>
                                        Excel
                                    </Dropdown.Item>
                                    <Dropdown.Item icon={File07} isDisabled={isDownloading} onAction={() => void handleDownload("pdf")}>
                                        PDF
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown.Popover>
                        </Dropdown.Root>
                        <OperacionConfigDropdown onOpenReglas={() => setIsReglasOpen(true)} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {kpiCards.map((card) => (
                        <RouteKpiCard
                            key={card.label}
                            isLoading={isKpiLoading}
                            label={card.label}
                            value={card.value}
                            valueClassName={card.tone}
                        />
                    ))}
                </div>

                <AsistidaSolicitudForm
                    activeCompany={primaryCompany}
                    onSaved={() => setRefreshKey((value) => value + 1)}
                    ruta={ruta}
                />

                {isLoading && <span className="text-sm text-tertiary">Cargando configuracion...</span>}

                {error && (
                    <div className="rounded-lg border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary">
                        {error}
                    </div>
                )}

                <AsistidaOperationalBoard
                    companies={cajas}
                    refreshKey={refreshKey}
                    ruta={ruta}
                    selectedDate={selectedDate}
                    onChanged={() => setRefreshKey((value) => value + 1)}
                />

                <OperacionReglasEfectivizacionModal
                    activeCompany={primaryCompany}
                    isOpen={isReglasOpen}
                    onClose={() => setIsReglasOpen(false)}
                    onSaved={() => setRefreshKey((value) => value + 1)}
                    ruta={ruta}
                />
            </div>
        </AppLayout>
    );
};
