import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChartSquare02, Download01, File05, RefreshCw01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { liquidacionesService } from "@/features/compensaciones/liquidaciones/liquidaciones.service";
import type { PeriodoCompensacion } from "@/features/compensaciones/liquidaciones/liquidaciones.types";
import { useToast } from "@/providers/toast-provider";
import { sucursalService } from "@/services/sucursal.service";
import { buildReporteFile, downloadBlob } from "./reportes-export";
import { reportesService } from "./reportes.service";
import type { ExportacionHistorial, ReporteColumna, ReporteFormato, ReportePayload, ReporteTipo } from "./reportes.types";

interface ReportConfig {
    label: string;
    description: string;
    exportType: string;
    columns: ReporteColumna[];
}
const configs: Record<ReporteTipo, ReportConfig> = {
    FINANCIERO: {
        label: "Financiero",
        description: "Sueldos, variables, descuentos y saldos por colaborador.",
        exportType: "GENERAL_FINANCIERO",
        columns: [
            { key: "colaborador_nombre", label: "Colaborador" },
            { key: "colaborador_documento", label: "Documento" },
            { key: "sucursal_nombre", label: "Sede" },
            { key: "total_sueldo", label: "Sueldo", kind: "money" },
            { key: "total_bonos", label: "Bonos", kind: "money" },
            { key: "total_comisiones", label: "Comisiones", kind: "money" },
            { key: "total_descuentos", label: "Descuentos", kind: "money" },
            { key: "total_pagar", label: "Total", kind: "money" },
            { key: "total_pagado", label: "Pagado", kind: "money" },
            { key: "total_pendiente", label: "Pendiente", kind: "money" },
        ],
    },
    SEDES: {
        label: "Resumen por sede",
        description: "Distribución financiera consolidada por sede.",
        exportType: "RESUMEN_SEDE",
        columns: [
            { key: "sucursal_nombre", label: "Sede" },
            { key: "total_colaboradores", label: "Colaboradores", kind: "number" },
            { key: "total_sueldo", label: "Sueldo", kind: "money" },
            { key: "total_bonos", label: "Bonos", kind: "money" },
            { key: "total_comisiones", label: "Comisiones", kind: "money" },
            { key: "total_descuentos", label: "Descuentos", kind: "money" },
            { key: "total_pagar", label: "Total", kind: "money" },
            { key: "total_pendiente", label: "Pendiente", kind: "money" },
        ],
    },
    CONCEPTOS: {
        label: "Conceptos",
        description: "Desglose de importes por concepto y naturaleza.",
        exportType: "OTRO",
        columns: [
            { key: "concepto_codigo", label: "Código" },
            { key: "concepto_nombre", label: "Concepto" },
            { key: "categoria", label: "Categoría" },
            { key: "naturaleza", label: "Naturaleza" },
            { key: "total_colaboradores", label: "Colaboradores", kind: "number" },
            { key: "total_lineas", label: "Líneas", kind: "number" },
            { key: "importe_total", label: "Importe", kind: "money" },
        ],
    },
    ASISTENCIA: {
        label: "Asistencia",
        description: "Jornadas pagables, tardanzas, extras e incompletas.",
        exportType: "ASISTENCIA",
        columns: [
            { key: "colaborador_nombre", label: "Colaborador" },
            { key: "sucursal_nombre", label: "Sede" },
            { key: "dias_pagables", label: "Días pagables", kind: "number" },
            { key: "dias_completos", label: "Completos", kind: "number" },
            { key: "dias_con_tardanza", label: "Con tardanza", kind: "number" },
            { key: "minutos_tardanza", label: "Min. tardanza", kind: "number" },
            { key: "minutos_extra", label: "Min. extra", kind: "number" },
            { key: "dias_incompletos", label: "Incompletos", kind: "number" },
        ],
    },
    PRODUCTIVIDAD: {
        label: "Productividad",
        description: "Registro, conversión, operaciones y calificaciones.",
        exportType: "PRODUCTIVIDAD",
        columns: [
            { key: "colaborador_nombre", label: "Colaborador" },
            { key: "sucursal_nombre", label: "Sede" },
            { key: "clientes_registrados", label: "Registrados", kind: "number" },
            { key: "clientes_convertidos_7_dias", label: "Convertidos", kind: "number" },
            { key: "porcentaje_conversion_7_dias", label: "Conversión", kind: "percent" },
            { key: "operaciones_pagadas_atribuidas", label: "Operaciones", kind: "number" },
            { key: "calificaciones_aprobadas", label: "Calificaciones", kind: "number" },
        ],
    },
    PAGOS: {
        label: "Pagos",
        description: "Movimientos, reversas y referencias de pago.",
        exportType: "PAGOS",
        columns: [
            { key: "colaborador_nombre", label: "Colaborador" },
            { key: "sucursal_nombre", label: "Sede" },
            { key: "tipo_movimiento", label: "Movimiento" },
            { key: "componente", label: "Componente" },
            { key: "monto_neto", label: "Monto neto", kind: "money" },
            { key: "fecha_pago", label: "Fecha", kind: "date" },
            { key: "medio_pago", label: "Medio" },
            { key: "referencia", label: "Referencia" },
        ],
    },
};
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const number = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const isMoneyKey = (key: string) =>
    ["sueldo", "bono", "comision", "descuento", "pagar", "pagado", "pendiente", "neto", "importe", "monto", "ingresos", "reversas"].some((part) =>
        key.includes(part),
    );
const summaryValue = (key: string, value: unknown) =>
    key.includes("porcentaje")
        ? `${number.format(Number(value ?? 0))}%`
        : isMoneyKey(key)
          ? money.format(Number(value ?? 0))
          : number.format(Number(value ?? 0));

export const ReportesPage = () => {
    const { addToast } = useToast();
    const [periods, setPeriods] = useState<PeriodoCompensacion[]>([]);
    const [periodId, setPeriodId] = useState(0);
    const [branches, setBranches] = useState<{ id: number; nombre: string }[]>([]);
    const [branchId, setBranchId] = useState(0);
    const [type, setType] = useState<ReporteTipo>("FINANCIERO");
    const [format, setFormat] = useState<ReporteFormato>("PDF");
    const [report, setReport] = useState<ReportePayload | null>(null);
    const [history, setHistory] = useState<ExportacionHistorial[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const config = configs[type];
    const selectedPeriod = periods.find((item) => item.id === periodId);
    useEffect(() => {
        Promise.all([liquidacionesService.getPeriods(), sucursalService.getList()])
            .then(([periodRows, branchRows]) => {
                setPeriods(periodRows);
                setPeriodId((current) => current || periodRows[0]?.id || 0);
                setBranches(branchRows.map((item) => ({ id: Number(item.id), nombre: String(item.nombre ?? "") })));
            })
            .catch((error) => addToast("error", error instanceof Error ? error.message : "No fue posible cargar los filtros"));
    }, [addToast]);
    const load = useCallback(async () => {
        if (!periodId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const [reportResult, historyResult] = await Promise.allSettled([
            reportesService.getReport(type, periodId, branchId),
            reportesService.getExports(periodId),
        ]);
        if (reportResult.status === "fulfilled") setReport(reportResult.value);
        else {
            setReport(null);
            addToast("error", reportResult.reason instanceof Error ? reportResult.reason.message : "No fue posible generar el reporte");
        }
        if (historyResult.status === "fulfilled") setHistory(historyResult.value);
        else setHistory([]);
        setIsLoading(false);
    }, [addToast, branchId, periodId, refreshKey, type]);
    useEffect(() => {
        void load();
    }, [load]);
    const tableColumns = useMemo<ColumnDef[]>(
        () =>
            config.columns.map((column) => ({
                key: column.key,
                header: column.label,
                render: (value) =>
                    column.kind === "money"
                        ? money.format(Number(value ?? 0))
                        : column.kind === "percent"
                          ? `${number.format(Number(value ?? 0))}%`
                          : column.kind === "date" && value
                            ? dateTime.format(new Date(String(value)))
                            : String(value ?? "—"),
            })),
        [config.columns],
    );
    const rows = useMemo(
        () =>
            (report?.items ?? []).map((item, index) => ({
                id: Number(item.id_pago ?? item.id_liquidacion ?? item.id_colaborador ?? item.id_concepto ?? item.id_sucursal ?? index + 1),
                ...item,
            })),
        [report?.items],
    );
    const summaryEntries = Object.entries(report?.resumen ?? {}).slice(0, 4);
    const exportReport = async () => {
        if (!report || !selectedPeriod) return;
        setIsExporting(true);
        try {
            const built = await buildReporteFile(
                format,
                `Compensaciones - ${config.label}`,
                report.periodo || selectedPeriod.periodo,
                config.columns,
                report.items,
                report.resumen,
            );
            await reportesService.registerExport({
                periodId,
                type: config.exportType,
                format,
                fileName: built.fileName,
                hash: built.hash,
                totalRows: report.items.length,
                    totalReported: Math.max(0, Number(report.resumen.total_pagar ?? report.resumen.total_neto ?? 0)),
                branchId,
            });
            downloadBlob(built.blob, built.fileName);
            addToast("success", "Reporte generado y registrado");
            setRefreshKey((value) => value + 1);
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible exportar el reporte");
        } finally {
            setIsExporting(false);
        }
    };
    const historyColumns: ColumnDef[] = [
        { key: "type", header: "Reporte", render: (value) => humanize(String(value)) },
        { key: "format", header: "Formato" },
        { key: "file", header: "Archivo" },
        { key: "rows", header: "Registros" },
        {
            key: "status",
            header: "Estado",
            render: (value) => (
                <Badge size="sm" color={String(value) === "GENERADA" ? "success" : String(value) === "ANULADA" ? "gray" : "error"}>
                    {humanize(String(value))}
                </Badge>
            ),
        },
        { key: "date", header: "Generado", render: (value) => (value ? dateTime.format(new Date(String(value))) : "—") },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
                    <div>
                        <p className="text-sm font-medium text-brand-secondary">Compensaciones</p>
                        <h1 className="mt-1 text-display-xs font-semibold text-primary">Reportes</h1>
                        <p className="mt-1 text-sm text-tertiary">Consulta datos vigentes o snapshots cerrados y genera archivos auditables.</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="w-44">
                            <Select
                                label="Formato"
                                size="sm"
                                items={["PDF", "XLSX", "CSV"].map((item) => ({ id: item, label: item }))}
                                selectedKey={format}
                                onSelectionChange={(key) => key && setFormat(String(key) as ReporteFormato)}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                        <Button
                            size="sm"
                            color="primary"
                            iconLeading={Download01}
                            isDisabled={!report?.items.length}
                            isLoading={isExporting}
                            onClick={() => void exportReport()}
                        >
                            Descargar
                        </Button>
                    </div>
                </div>
                <section className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="w-64">
                            <Select
                                label="Período"
                                size="sm"
                                items={periods.map((item) => ({ id: item.id, label: `${item.nombre} · ${humanize(item.estado)}` }))}
                                selectedKey={periodId}
                                onSelectionChange={(key) => key !== null && setPeriodId(Number(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                        <div className="w-56">
                            <Select
                                label="Sede"
                                size="sm"
                                items={[{ id: 0, label: "Todas las sedes" }, ...branches.map((item) => ({ id: item.id, label: item.nombre }))]}
                                selectedKey={branchId}
                                onSelectionChange={(key) => setBranchId(key ? Number(key) : 0)}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                        <Button size="sm" color="secondary" iconLeading={RefreshCw01} isLoading={isLoading} onClick={() => setRefreshKey((value) => value + 1)}>
                            Actualizar
                        </Button>
                    </div>
                </section>
                <section className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
                    <div className="flex flex-wrap gap-2 border-b border-secondary p-3">
                        {(Object.keys(configs) as ReporteTipo[]).map((item) => (
                            <Button key={item} size="sm" color={type === item ? "primary" : "tertiary"} onClick={() => setType(item)}>
                                {configs[item].label}
                            </Button>
                        ))}
                    </div>
                    <div className="p-4">
                        <div className="flex items-start gap-3">
                            <BarChartSquare02 className="mt-0.5 size-5 text-brand-secondary" />
                            <div>
                                <h2 className="text-lg font-semibold text-primary">{config.label}</h2>
                                <p className="text-sm text-tertiary">{config.description}</p>
                                {report?.fuente && (
                                    <Badge className="mt-2" size="sm" color={report.fuente === "CIERRE" ? "success" : "brand"}>
                                        Fuente: {humanize(report.fuente)}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        {report?.nota && <div className="mt-4 rounded-lg border border-secondary bg-secondary p-3 text-sm text-tertiary">{report.nota}</div>}
                    </div>
                </section>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {summaryEntries.map(([key, value], index) => (
                        <motion.article
                            key={key}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.035 }}
                            className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"
                        >
                            <p className="text-xs font-medium text-tertiary">{humanize(key)}</p>
                            <p className="mt-3 text-display-xs font-semibold text-primary">{summaryValue(key, value)}</p>
                        </motion.article>
                    ))}
                </div>
                <DataTable
                    columns={tableColumns}
                    data={rows}
                    isLoading={isLoading}
                    page={1}
                    totalPages={1}
                    pageSize={20}
                    onPageChange={() => undefined}
                    onPageSizeChange={() => undefined}
                    emptyMessage="No hay datos para este reporte"
                    emptyDescription="Prueba con otro período o sede."
                />
                <section>
                    <div className="mb-3 flex items-center gap-2">
                        <File05 className="size-5 text-brand-secondary" />
                        <div>
                            <h2 className="text-lg font-semibold text-primary">Historial de exportaciones</h2>
                            <p className="text-sm text-tertiary">Evidencia auditable de los archivos generados para el período.</p>
                        </div>
                    </div>
                    <DataTable
                        columns={historyColumns}
                        data={history.map((item) => ({
                            id: item.id,
                            type: item.tipoReporte,
                            format: item.formato,
                            file: item.nombreArchivo,
                            rows: item.totalRegistros,
                            status: item.estado,
                            date: item.fechaRegistro,
                        }))}
                        isLoading={isLoading}
                        page={1}
                        totalPages={1}
                        pageSize={20}
                        onPageChange={() => undefined}
                        onPageSizeChange={() => undefined}
                        emptyMessage="Aún no hay exportaciones registradas"
                    />
                </section>
            </div>
        </AppLayout>
    );
};
