import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download01, File05, RefreshCw01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { type PeriodoCompensacion, periodosService } from "@/features/compensaciones/shared/periodos.service";
import { sucursalService } from "@/services/sucursal.service";
import { NotasCell, compensationDate } from "../shared/compensacion-cells";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { reporteColumns } from "./reporte-columns";
import { buildReporteFile, downloadBlob } from "./reportes-export";
import { reportesService } from "./reportes.service";
import type { ExportacionHistorial, ReporteColumna, ReporteFormato, ReportePayload } from "./reportes.types";

/** Un solo reporte: Bonos y Penalidades por colaborador. */
const columns: ReporteColumna[] = [
    { key: "colaborador_nombre", label: "Colaborador" },
    { key: "colaborador_documento", label: "DNI" },
    { key: "sucursal_nombre", label: "Sede" },
    { key: "total_bonos", label: "Bonos", kind: "money" },
    { key: "total_descuentos", label: "Penalidades", kind: "money" },
    { key: "total_pagar", label: "Neto", kind: "money" },
];
const totals = columns.filter((column) => column.kind === "money");
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
/** El servidor separa "comisiones": para el usuario son Bonos. */
const soloBonos = (row: Record<string, unknown>) => {
    const { total_comisiones, total_ingresos, ...rest } = row;
    if (rest.total_bonos == null && total_comisiones == null) return rest;
    return { ...rest, total_bonos: Number(rest.total_bonos ?? 0) + Number(total_comisiones ?? 0) };
};

export const ReportesPage = withAlertProvider(() => {
    const notify = useAlert();
    const [periods, setPeriods] = useState<PeriodoCompensacion[]>([]);
    const [periodId, setPeriodId] = useState(0);
    const [branches, setBranches] = useState<{ id: number; nombre: string }[]>([]);
    const [branchId, setBranchId] = useState(0);
    const [format, setFormat] = useState<ReporteFormato>("PDF");
    const [report, setReport] = useState<ReportePayload | null>(null);
    const [history, setHistory] = useState<ExportacionHistorial[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const requestId = useRef(0);

    const [page, setPage] = useState(1),
        [pageSize, setPageSize] = useState(20);
    const [historyPage, setHistoryPage] = useState(1),
        [historyPageSize, setHistoryPageSize] = useState(20);
    const invalidate = () => {
        ++requestId.current;
        setReport(null);
        setHistory([]);
        setPage(1);
        setHistoryPage(1);
    };
    const selectedPeriod = periods.find((item) => item.id === periodId);
    useEffect(() => {
        Promise.all([periodosService.getPeriods(), sucursalService.getList()])
            .then(([periodRows, branchRows]) => {
                setPeriods(periodRows);
                setPeriodId((current) => current || periodRows[0]?.id || 0);
                setBranches(branchRows.map((item) => ({ id: Number(item.id), nombre: String(item.nombre ?? "") })));
            })
            .catch((error) => notify("error", error instanceof Error ? error.message : "No fue posible cargar los filtros"));
    }, [notify]);
    const load = useCallback(async () => {
        const request = ++requestId.current;
        setReport(null);
        setHistory([]);

        setPage(1);
        setHistoryPage(1);
        if (!periodId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const [reportResult, historyResult] = await Promise.allSettled([reportesService.getReport(periodId, branchId), reportesService.getExports(periodId)]);
        if (request !== requestId.current) return;
        if (reportResult.status === "fulfilled") setReport(reportResult.value);
        else {
            setReport(null);
            notify("error", reportResult.reason instanceof Error ? reportResult.reason.message : "No fue posible generar el reporte");
        }
        if (historyResult.status === "fulfilled") setHistory(historyResult.value);
        else setHistory([]);
        setIsLoading(false);
    }, [notify, branchId, periodId, refreshKey]);
    useEffect(() => {
        void load();
    }, [load]);
    const tableColumns = useMemo(() => reporteColumns(columns), []);
    const items = useMemo(() => (report?.items ?? []).map(soloBonos), [report?.items]);
    const summary = useMemo(() => soloBonos(report?.resumen ?? {}), [report?.resumen]);
    const rows = useMemo(() => items.map((item, index) => ({ ...item, id: Number((item as Record<string, unknown>).id_colaborador ?? index + 1) })), [items]);
    const exportReport = async () => {
        if (!report || !selectedPeriod || isLoading || isExporting || !items.length) return;
        setIsExporting(true);
        try {
            const built = await buildReporteFile(
                format,
                "Compensaciones - Bonos y Penalidades",
                report.periodo || selectedPeriod.periodo,
                columns,
                items,
                summary,
            );
            await reportesService.registerExport({
                periodId,
                type: "GENERAL_FINANCIERO",
                format,
                fileName: built.fileName,
                hash: built.hash,
                totalRows: items.length,
                totalReported: Math.max(0, Number((summary as Record<string, unknown>).total_pagar ?? 0)),
                branchId,
            });
            downloadBlob(built.blob, built.fileName);
            notify("success", "Reporte generado y registrado.");
            setRefreshKey((value) => value + 1);
        } catch (error) {
            notify("error", error instanceof Error ? error.message : "No fue posible exportar el reporte");
        } finally {
            setIsExporting(false);
        }
    };
    const historyColumns: ColumnDef[] = [
        { key: "file", header: "Archivo", render: (value) => <NotasCell value={value} /> },
        { key: "format", header: "Formato" },
        { key: "rows", header: "Registros", align: "right" },
        {
            key: "status",
            header: "Estado",
            render: (value) => <CompensacionEstado dominio="exportacion" valor={value} />,
        },
        { key: "date", header: "Fecha de generación", render: compensationDate },
    ];

    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <CompensacionHeading section="reportes" title="Reporte de Bonos" />
                <CompensacionFiltros>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="w-64">
                            <Select
                                label="Periodo"
                                placeholder="Seleccionar periodo"
                                isDisabled={isExporting}
                                size="sm"
                                items={periods.map((item) => ({ id: item.id, label: `${item.nombre} · ${humanize(item.estado)}` }))}
                                selectedKey={periodId || null}
                                onSelectionChange={(key) => {
                                    if (key !== null && Number(key) !== periodId) {
                                        invalidate();
                                        setPeriodId(Number(key));
                                    }
                                }}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                        <div className="w-56">
                            <Select
                                label="Sede"
                                isDisabled={isExporting}
                                size="sm"
                                items={[{ id: 0, label: "Todas las sedes" }, ...branches.map((item) => ({ id: item.id, label: item.nombre }))]}
                                selectedKey={branchId}
                                onSelectionChange={(key) => {
                                    if (Number(key ?? 0) === branchId) return;
                                    invalidate();
                                    setBranchId(key ? Number(key) : 0);
                                }}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                        <div className="w-36">
                            <Select
                                label="Formato"
                                size="sm"
                                isDisabled={isExporting}
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
                            iconLeading={RefreshCw01}
                            isDisabled={!periodId || isExporting}
                            isLoading={isLoading}
                            onClick={() => {
                                invalidate();
                                setRefreshKey((value) => value + 1);
                            }}
                        >
                            Actualizar
                        </Button>
                        <Button
                            size="sm"
                            color="primary"
                            iconLeading={Download01}
                            isDisabled={isLoading || !items.length}
                            isLoading={isExporting}
                            onClick={() => void exportReport()}
                        >
                            Descargar {format}
                        </Button>
                    </div>
                </CompensacionFiltros>
                <div className="grid gap-3 sm:grid-cols-3">
                    {totals.map(({ key, label }) => {
                        const value = (summary as Record<string, unknown>)[key];
                        return (
                            <CompensacionPanel key={key} title={label}>
                                <p className="text-display-xs font-semibold text-primary tabular-nums">{value == null ? "—" : money.format(Number(value))}</p>
                            </CompensacionPanel>
                        );
                    })}
                </div>
                <DataTable
                    density="compact"
                    columns={tableColumns}
                    data={rows.slice((page - 1) * pageSize, page * pageSize)}
                    isLoading={isLoading}
                    page={page}
                    totalPages={Math.max(1, Math.ceil(rows.length / pageSize))}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage="No hay datos para este reporte"
                    emptyDescription="Prueba con otro período o sede."
                />
                <CompensacionPanel title="Historial de Exportaciones" trailing={<File05 aria-hidden="true" className="size-5 text-brand-secondary" />}>
                    <DataTable
                        density="compact"
                        columns={historyColumns}
                        data={history.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize).map((item) => ({
                            id: item.id,
                            format: item.formato,
                            file: item.nombreArchivo,
                            rows: item.totalRegistros,
                            status: item.estado,
                            date: item.fechaRegistro,
                        }))}
                        isLoading={isLoading}
                        page={historyPage}
                        totalPages={Math.max(1, Math.ceil(history.length / historyPageSize))}
                        pageSize={historyPageSize}
                        onPageChange={setHistoryPage}
                        onPageSizeChange={(size) => {
                            setHistoryPageSize(size);
                            setHistoryPage(1);
                        }}
                        emptyMessage="Aún no hay exportaciones registradas"
                    />
                </CompensacionPanel>
            </div>
        </AppLayout>
    );
});
