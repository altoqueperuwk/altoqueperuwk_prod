import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Coins01, Eye, Users03, XCircle, XClose } from "@untitledui/icons";
import { Navigate, useLocation } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { estadoVisual } from "../shared/compensacion-estados";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { type CazaErroresOption, cazaErroresCodeFromPath, cazaErroresOptions } from "./caza-errores-policy";
import { CazaErroresShell } from "./caza-errores-shell";
import { ConversacionProcesoForm } from "./conversacion-proceso-form";
import { ErrorRegistroForm } from "./error-registro-form";
import { HallazgoExpedienteDialog } from "./hallazgo-expediente-dialog";
import { incidenciaColumns, incidenciaRows } from "./incidencia-columns";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaCatalogo, IncidenciaEvento } from "./incidencias.types";
import { MalFlujoSafetyPayForm } from "./mal-flujo-safetypay-form";

const emptyCatalog: IncidenciaCatalogo = { tipos: [], reportantes: [], responsables: [], penalidades: [] };
const formFor: Record<CazaErroresOption, typeof MalFlujoSafetyPayForm> = {
    MAL_FLUJO_SAFETYPAY: MalFlujoSafetyPayForm,
    CONVERSACION_PROCESO: ConversacionProcesoForm,
    ERROR_REGISTRO: ErrorRegistroForm,
};
const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(new Date());
const monthBounds = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return { from: "", to: "" };
    const [year, monthNumber] = month.split("-").map(Number);
    return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}` };
};

export const CazaErroresOptionRoute = withAlertProvider(() => {
    const { pathname } = useLocation();
    const option = cazaErroresCodeFromPath(pathname);
    return option ? <CazaErroresOptionPage option={option} /> : <Navigate to="/403" replace />;
});

const CazaErroresOptionPage = ({ option }: { option: CazaErroresOption }) => {
    const { isStoreManager } = useCompensacionPerfil();
    const notify = useAlert();
    const config = cazaErroresOptions[option];
    const [catalog, setCatalog] = useState(emptyCatalog);
    const [events, setEvents] = useState<IncidenciaEvento[]>([]);
    const [selected, setSelected] = useState<IncidenciaEvento | null>(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [month, setMonth] = useState(currentMonth);
    const [query, setQuery] = useState({ search: "", status: "", month: currentMonth() });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setLoadError("");
        try {
            const nextCatalog = await incidenciasService.getCatalog();
            setCatalog(nextCatalog);
            const period = monthBounds(query.month);
            const types = config.codes.flatMap((code) => {
                const item = nextCatalog.penalidades.find((penalty) => penalty.codigo === code);
                return item ? [item] : [];
            });
            const results = await Promise.all(
                types.map(async (type) => {
                    const filters = {
                        tray: "TODOS",
                        category: "AUDITORIA_PAGO",
                        status: query.status,
                        penaltyId: type.id,
                        search: query.search,
                        ...period,
                        pageSize: 100,
                    };
                    const first = await incidenciasService.getList({ ...filters, page: 1 });
                    const rest = await Promise.all(
                        Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => incidenciasService.getList({ ...filters, page: index + 2 })),
                    );
                    return [...first.items, ...rest.flatMap((result) => result.items)];
                }),
            );
            const unique = new Map<number, IncidenciaEvento>();
            for (const item of results.flat()) unique.set(item.id, item);
            setEvents([...unique.values()].sort((a, b) => b.fechaEvento.localeCompare(a.fechaEvento) || b.id - a.id));
        } catch (error) {
            const message = error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudieron cargar los reportes";
            setLoadError(message);
            setEvents([]);
            notify("error", message);
        } finally {
            setIsLoading(false);
        }
    }, [notify, config.codes, query, refreshKey]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (JSON.stringify(query) === JSON.stringify({ search, status, month })) return;
        const timer = window.setTimeout(() => {
            setPage(1);
            setSelected(null);
            setQuery({ search, status, month });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [month, query, search, status]);

    const rows = useMemo(() => incidenciaRows(events.slice((page - 1) * pageSize, page * pageSize)), [events, page, pageSize]);
    const columns = useMemo(
        () =>
            incidenciaColumns("AUDITORIA_PAGO")
                .filter((column) => !["descuento", "descuentoAprobado"].includes(column.key))
                .map((column) => (column.key === "bono" ? { ...column, header: "Monto previsto" } : column)),
        [],
    );
    const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
    const counts = useMemo(
        () => ({
            pending: events.filter((item) => item.estado === "PENDIENTE").length,
            approved: events.filter((item) => item.estado === "APROBADO" || item.estado === "LIQUIDADO").length,
            rejected: events.filter((item) => item.estado === "RECHAZADO").length,
            commission: events
                .filter((item) => item.estado === "APROBADO" || item.estado === "LIQUIDADO")
                .reduce((total, item) => total + Number(item.montoBonoReportante ?? 0), 0),
        }),
        [events],
    );
    const Form = formFor[option];

    if (!isStoreManager) return <Navigate to="/403" replace />;

    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <CompensacionHeading section="incidencias" title={config.title} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>section]:flex [&>section]:flex-col [&>section>div:last-child]:flex-1">
                    {[
                        { label: "Pendientes", value: counts.pending, icon: Users03, tone: "text-warning-primary" },
                        { label: "Aprobados", value: counts.approved, icon: CheckCircle, tone: "text-success-primary" },
                        { label: "Rechazados", value: counts.rejected, icon: XCircle, tone: "text-error-primary" },
                        {
                            label: "Comisión Aprobada",
                            value: new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(counts.commission),
                            icon: Coins01,
                            tone: "text-success-primary",
                        },
                    ].map((metric) => (
                        <CompensacionPanel
                            key={metric.label}
                            title={metric.label}
                            trailing={<metric.icon aria-hidden="true" className={`size-5 ${metric.tone}`} />}
                        >
                            <p className={`text-display-xs font-semibold tabular-nums ${metric.tone}`}>{isLoading || loadError ? "—" : metric.value}</p>
                        </CompensacionPanel>
                    ))}
                </div>

                <CazaErroresShell>
                    <Form
                        catalog={catalog}
                        onCancel={() => {}}
                        onSave={() => {
                            setPage(1);
                            setRefreshKey((value) => value + 1);
                        }}
                    />
                </CazaErroresShell>

                {loadError && <AlertMessage tone="error">{loadError}</AlertMessage>}

                <DataTable
                    density="compact"
                    wrapText
                    toolbar={
                        <CompensacionFiltros toolbar>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="w-full sm:w-64">
                                    <Input
                                        aria-label="Nombre o DNI Colaborador"
                                        placeholder="Nombre o DNI Colaborador"
                                        size="sm"
                                        value={search}
                                        onChange={setSearch}
                                    />
                                </div>
                                <div className="w-full sm:w-44">
                                    <Select
                                        aria-label="Estado"
                                        size="sm"
                                        selectedKey={status}
                                        items={[
                                            { id: "", label: "Todos los estados" },
                                            ...["PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"].map((value) => ({
                                                id: value,
                                                label: estadoVisual("registro", value).label,
                                            })),
                                        ]}
                                        onSelectionChange={(key) => setStatus(key == null ? "" : String(key))}
                                    >
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>
                                </div>
                                <MonthPicker hideLabel label="Periodo" allowAllMonths={false} value={month} onChange={setMonth} />
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        color="secondary"
                                        iconLeading={XClose}
                                        onClick={() => {
                                            const current = currentMonth();
                                            setSearch("");
                                            setStatus("");
                                            setMonth(current);
                                            setQuery({ search: "", status: "", month: current });
                                            setPage(1);
                                            setSelected(null);
                                        }}
                                    >
                                        Limpiar
                                    </Button>
                                </div>
                            </div>
                        </CompensacionFiltros>
                    }
                    columns={columns}
                    data={isLoading || loadError ? [] : rows}
                    isLoading={isLoading}
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage={loadError ? "Consulta no disponible" : "No hay hallazgos de esta opción en el período"}
                    emptyDescription="Revisa el mes y los filtros."
                    renderActions={(row) => {
                        const item = events.find((entry) => entry.id === Number(row.id));
                        return item ? (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={Eye}
                                tooltip="Ver detalle del hallazgo"
                                className={compensationTableActionClass}
                                onClick={() => setSelected(item)}
                            />
                        ) : null;
                    }}
                />

                {selected && (
                    <HallazgoExpedienteDialog id={selected.id} onClose={() => setSelected(null)} onChanged={() => setRefreshKey((value) => value + 1)} />
                )}
            </div>
        </AppLayout>
    );
};
