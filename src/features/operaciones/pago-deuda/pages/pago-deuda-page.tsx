import { useEffect, useState } from "react";
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
import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { formatDateValue, getPeruDateValue } from "@/features/operaciones/efectivizacion/shared/utils/date";
import { PagoDeudaBoard } from "@/features/operaciones/pago-deuda/components/pago-deuda-board";
import { PagoDeudaEmpresasComisionModal } from "@/features/operaciones/pago-deuda/components/pago-deuda-empresas-comision-modal";
import { PagoDeudaSolicitudForm } from "@/features/operaciones/pago-deuda/components/pago-deuda-solicitud-form";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import { isAdministrator, isJefeTienda, useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { PagoDeudaReportPdf, getPagoDeudaReportAccount, getPagoDeudaReportSteps, type PagoDeudaReportAccountConfig, type PagoDeudaReportKpi } from "@/features/operaciones/pago-deuda/components/pago-deuda-reporte";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface PagoDeudaKpi {
    total_operaciones_pendientes?: number | null;
    total_operaciones_pagados?: number | null;
    monto_solicitados?: number | null;
    comisiones?: number | null;
    monto_devueltos?: number | null;
}

const getTodayValue = getPeruDateValue;

const stringToCalendarDate = (str: string) => {
    const [year, month, day] = str.split("-").map(Number);
    return new CalendarDate(year, month, day);
};

const formatSelectedDate = (str: string) => {
    return formatDateValue(str);
};

export const PagoDeudaPage = () => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [refreshKey, setRefreshKey] = useState(0);
    const [isEmpresasComisionOpen, setIsEmpresasComisionOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isReglasOpen, setIsReglasOpen] = useState(false);
    const [isKpiLoading, setIsKpiLoading] = useState(false);
    const [kpi, setKpi] = useState<PagoDeudaKpi | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayValue);
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const canViewAllPagoDeuda = isAdministrator(businessUser);
    const canViewSucursalPagoDeuda = isJefeTienda(businessUser);

    useEffect(() => {
        let ignore = false;
        if (userId === null) {
            setKpi(null);
            setIsKpiLoading(false);
            return () => { ignore = true; };
        }
        setIsKpiLoading(true);

        const kpiParams: Record<string, unknown> = {
            p_fecha_registro_desde: `${selectedDate}T00:00:00`,
            p_fecha_registro_hasta: `${selectedDate}T23:59:59`,
        };
        if (canViewSucursalPagoDeuda) kpiParams.p_id_usuario_consulta = userId;
        else if (!canViewAllPagoDeuda) kpiParams.p_id_usuario_solicitud = userId;

        pagoDeudaService
            .getKpi(kpiParams)
            .then((rows) => {
                if (!ignore) setKpi((rows?.[0] ?? null) as PagoDeudaKpi | null);
            })
            .finally(() => {
                if (!ignore) setIsKpiLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [canViewAllPagoDeuda, canViewSucursalPagoDeuda, refreshKey, selectedDate, userId]);

    const handleCalendarChange = (date: any) => {
        if (!date) return;
        setSelectedDate(`${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`);
        setIsCalendarOpen(false);
    };

    const handleChanged = () => setRefreshKey((value) => value + 1);

    const getReportFileName = (extension: "pdf" | "xlsx") => `pago_deuda_${selectedDate.replaceAll("-", "")}.${extension}`;

    const loadReportRows = async () => {
        if (!userId) {
            addToast("error", "No se pudo resolver el usuario actual.");
            return null;
        }

        const solicitudParams: Record<string, unknown> = {
            p_fecha_desde: `${selectedDate}T00:00:00`,
            p_fecha_hasta: `${selectedDate}T23:59:59`,
        };
        if (canViewSucursalPagoDeuda) solicitudParams.p_id_usuario_consulta = userId;
        else if (!canViewAllPagoDeuda) solicitudParams.p_id_usuario_solicitud = userId;

        const kpiParams: Record<string, unknown> = {
            p_fecha_registro_desde: `${selectedDate}T00:00:00`,
            p_fecha_registro_hasta: `${selectedDate}T23:59:59`,
        };
        if (canViewSucursalPagoDeuda) kpiParams.p_id_usuario_consulta = userId;
        else if (!canViewAllPagoDeuda) kpiParams.p_id_usuario_solicitud = userId;

        const [rows, accountRows, kpiRows] = await Promise.all([
            pagoDeudaService.getSolicitudes(solicitudParams),
            pagoDeudaService.getEmpresasComision({ p_id_estado: 1 }),
            pagoDeudaService.getKpi(kpiParams),
        ]);
        const accountConfigs = new Map<number, PagoDeudaReportAccountConfig>();
        accountRows.forEach((account) => {
            accountConfigs.set(Number(account.id_empresa_cuenta_bancaria), {
                id_empresa_cuenta_bancaria: Number(account.id_empresa_cuenta_bancaria),
                banco_nombre: String(account.banco_nombre ?? ""),
                billetera_digital: String(account.billetera_digital ?? ""),
            });
        });
        return { rows, accountConfigs, kpi: (kpiRows?.[0] ?? {}) as PagoDeudaReportKpi };
    };

    const downloadExcel = async (rows: OperacionProceso[], accountConfigs: Map<number, PagoDeudaReportAccountConfig>, reportKpi: PagoDeudaReportKpi) => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Altoque Peru WK";
        const sheet = workbook.addWorksheet("Pago Deuda", { properties: { defaultRowHeight: 19 } });
        sheet.views = [{ showGridLines: false }];
        sheet.columns = [
            { width: 16 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 },
            { width: 14 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 18 }, { width: 20 },
        ];

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
            sheet.mergeCells(row, 1, row, 11);
            const cell = sheet.getCell(row, 1);
            cell.value = value;
            styleCell(cell, options);
            sheet.getRow(row).height = 22;
        };

        mergeRow(1, "ALTOQUE PERU WK", { bold: true, color: colors.white, bg: colors.navy });
        mergeRow(2, "Reporte de Pago Deuda", { bold: true, color: colors.white, bg: colors.navy });
        mergeRow(3, `Fecha: ${formatSelectedDate(selectedDate)} | Usuario: ${businessUser?.nombre ?? businessUser?.username ?? "-"}`, { color: colors.white, bg: colors.navy });
        mergeRow(5, "Indicadores", { bold: true, color: colors.white, bg: colors.navy });
        const kpiLabels = ["Total Operaciones Pendientes", "Total Operaciones Pagados", "Monto Solicitados", "Comisiones", "Monto Devueltos"];
        const kpiValues: Array<string | number> = [
            Number(reportKpi.total_operaciones_pendientes ?? 0),
            Number(reportKpi.total_operaciones_pagados ?? 0),
            Number(reportKpi.monto_solicitados ?? 0),
            Number(reportKpi.comisiones ?? 0),
            Number(reportKpi.monto_devueltos ?? 0),
        ];
        kpiLabels.forEach((label, index) => {
            const labelCell = sheet.getCell(6, index + 1);
            labelCell.value = label;
            styleCell(labelCell, { bold: true, color: colors.white, bg: colors.navy });
            const valueCell = sheet.getCell(7, index + 1);
            valueCell.value = kpiValues[index];
            styleCell(valueCell, { bold: true, bg: colors.white });
            if (index >= 2) valueCell.numFmt = '"S/ "#,##0.00';
        });
        mergeRow(9, `Pago Deuda | Total: ${rows.length}`, { bold: true, color: colors.white, bg: colors.navy });

        const headerRow = sheet.getRow(10);
        const headers = ["Pasos", "DNI", "Banco Solicitado", "Monto Solicitado", "Comision S/", "Comision %", "Comision Extra S/", "Monto Devuelto", "Cuenta Comision", "Estado", "Fecha Hora"];
        headers.forEach((header, index) => {
            headerRow.getCell(index + 1).value = header;
            styleCell(headerRow.getCell(index + 1), { bold: true, color: colors.white, bg: colors.navy });
        });

        const hasReturn = (row: OperacionProceso) => Boolean(row.id_operacion_match) || Number(row.monto_devuelto ?? 0) >= Number(row.monto_deposito_cliente ?? 0);
        rows.forEach((row, rowIndex) => {
            const extra = Number(row.comision_monto_extra_servicio ?? 0);
            const commissionTotal = Number(row.resultado_comision_servicio ?? 0);
            const commissionBase = Math.max(0, commissionTotal - extra);
            const values = [
                getPagoDeudaReportSteps(row).map((done) => done ? "✓" : "").join(" "),
                row.dni_cliente ?? "-",
                row.nombre_banco_cliente ?? "-",
                Number(row.monto_deposito_cliente ?? 0),
                commissionBase,
                Number(row.comision_servicio ?? 0),
                extra,
                hasReturn(row) ? Number(row.monto_deposito_cliente ?? 0) : Number(row.monto_devuelto ?? 0),
                getPagoDeudaReportAccount(row, accountConfigs),
                row.nombre_estado ?? "-",
                row.fecha_registro
                    ? `${new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(row.fecha_registro))}\n${new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(row.fecha_registro))}`
                    : "-",
            ];
            const excelRow = sheet.getRow(11 + rowIndex);
            excelRow.height = 30;
            values.forEach((value, index) => {
                const cell = excelRow.getCell(index + 1);
                cell.value = value;
                styleCell(cell, { bg: rowIndex % 2 ? colors.row : colors.white });
                if ([3, 4, 6, 7].includes(index)) cell.numFmt = '"S/ "#,##0.00';
                if (index === 5) cell.numFmt = '0.##"%"';
            });
        });

        const totalRow = sheet.getRow(11 + rows.length);
        totalRow.getCell(1).value = "Totales";
        totalRow.getCell(4).value = rows.reduce((sum, row) => sum + Number(row.monto_deposito_cliente ?? 0), 0);
        totalRow.getCell(5).value = rows.reduce((sum, row) => {
            const extra = Number(row.comision_monto_extra_servicio ?? 0);
            return sum + Math.max(0, Number(row.resultado_comision_servicio ?? 0) - extra);
        }, 0);
        totalRow.getCell(7).value = rows.reduce((sum, row) => sum + Number(row.comision_monto_extra_servicio ?? 0), 0);
        totalRow.getCell(8).value = rows.reduce((sum, row) => sum + (Number(row.id_operacion_match) || Number(row.monto_devuelto ?? 0) >= Number(row.monto_deposito_cliente ?? 0) ? Number(row.monto_deposito_cliente ?? 0) : Number(row.monto_devuelto ?? 0)), 0);
        for (let index = 1; index <= 11; index += 1) styleCell(totalRow.getCell(index), { bold: true, bg: colors.row });
        totalRow.getCell(4).numFmt = '"S/ "#,##0.00';
        totalRow.getCell(5).numFmt = '"S/ "#,##0.00';
        totalRow.getCell(7).numFmt = '"S/ "#,##0.00';
        totalRow.getCell(8).numFmt = '"S/ "#,##0.00';

        const buffer = await workbook.xlsx.writeBuffer();
        const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = getReportFileName("xlsx");
        link.click();
        URL.revokeObjectURL(url);
    };

    const downloadPdf = async (rows: OperacionProceso[], accountConfigs: Map<number, PagoDeudaReportAccountConfig>, reportKpi: PagoDeudaReportKpi) => {
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
            root.render(
                <PagoDeudaReportPdf
                    rows={rows}
                    date={selectedDate}
                    userName={String(businessUser?.nombre ?? businessUser?.username ?? "-")}
                    accountConfigs={accountConfigs}
                    kpi={reportKpi}
                />,
            );
            await new Promise((resolve) => window.setTimeout(resolve, 250));
            if (document.fonts?.ready) await document.fonts.ready;
            const element = host.querySelector<HTMLElement>(".pago-deuda-report") ?? host;
            await html2pdf().set({
                filename: getReportFileName("pdf"),
                margin: 0,
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 3, useCORS: true, backgroundColor: "#FFFFFF", scrollY: 0 },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            }).from(element).save();
        } finally {
            root.unmount();
            host.remove();
        }
    };

    const handleDownload = async (format: "pdf" | "xlsx") => {
        setIsDownloading(true);
        try {
            const report = await loadReportRows();
            if (!report) return;
            if (format === "pdf") await downloadPdf(report.rows, report.accountConfigs, report.kpi);
            else await downloadExcel(report.rows, report.accountConfigs, report.kpi);
            addToast("success", "Reporte descargado correctamente.");
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudo generar el reporte.");
        } finally {
            setIsDownloading(false);
        }
    };

    const kpiCards = [
        { label: "Total Operaciones Pendientes", value: formatInteger(kpi?.total_operaciones_pendientes), tone: "text-primary" },
        { label: "Total Operaciones Pagados", value: formatInteger(kpi?.total_operaciones_pagados), tone: "text-concept-ingreso" },
        { label: "Monto Solicitados", value: formatMoney(kpi?.monto_solicitados), tone: "text-primary" },
        { label: "Comisiones", value: formatMoney(kpi?.comisiones), tone: "text-concept-ingreso" },
        { label: "Monto Devueltos", value: formatMoney(kpi?.monto_devueltos), tone: "text-concept-salida" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="relative">
                        <Button size="sm" color="secondary" iconLeading={CalendarIcon} onClick={() => setIsCalendarOpen(!isCalendarOpen)}>
                            {formatSelectedDate(selectedDate)}
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
                        <Button
                            size="sm"
                            color="secondary"
                            iconLeading={Download01}
                            iconTrailing={ChevronDown}
                            isLoading={isDownloading}
                        >
                            Descargar
                        </Button>
                        <Dropdown.Popover className="w-48">
                            <Dropdown.Menu>
                                <Dropdown.Item icon={File06} onAction={() => void handleDownload("xlsx")}>
                                    Excel
                                </Dropdown.Item>
                                <Dropdown.Item icon={File07} onAction={() => void handleDownload("pdf")}>
                                    PDF
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown.Root>
                    <OperacionConfigDropdown
                        onOpenEmpresasComision={() => setIsEmpresasComisionOpen(true)}
                        onOpenReglas={() => setIsReglasOpen(true)}
                        showEmpresasComision
                    />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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

                <PagoDeudaSolicitudForm onSaved={handleChanged} />
                <PagoDeudaBoard refreshKey={refreshKey} selectedDate={selectedDate} onChanged={handleChanged} />
            </div>
            <OperacionReglasEfectivizacionModal
                isOpen={isReglasOpen}
                mode="pago-deuda"
                onClose={() => setIsReglasOpen(false)}
                onSaved={handleChanged}
            />
            <PagoDeudaEmpresasComisionModal
                isOpen={isEmpresasComisionOpen}
                onClose={() => setIsEmpresasComisionOpen(false)}
                onSaved={handleChanged}
            />
        </AppLayout>
    );
};
