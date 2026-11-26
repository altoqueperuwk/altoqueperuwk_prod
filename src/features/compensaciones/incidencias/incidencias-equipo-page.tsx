import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Eye, File07, XCircle, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { NombreCell, NotasCell, compensationStatus } from "../shared/compensacion-cells";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionFiltros } from "../shared/compensacion-filtros";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { IncidenciaEquipoDetail } from "./incidencia-equipo-detail";
import { IncidenciaEquipoForm } from "./incidencia-equipo-form";
import { incidenciasService } from "./incidencias.service";
import type { EquipoIncidenciasResumen, IncidenciaCatalogo, IncidenciaEvento } from "./incidencias.types";

type Grupo = "AUDITORIA" | "PERSONAL" | "ESCALONADA";
/** Cada opción compartida (Esquema 12) es una sola pantalla: título, formulario (si registra) y concepto filtrado en el servidor. */
const grupos: Record<Grupo, { title: string; formTitle?: string; flow?: "CAZA" | "PERSONAL"; empty: string }> = {
    AUDITORIA: { title: "Auditoría Operaciones", formTitle: "Registrar Auditoria", flow: "CAZA", empty: "Sin auditorías ni penalidades con estos filtros" },
    PERSONAL: {
        title: "Indisciplina Colaborador",
        formTitle: "Registrar Indisciplina",
        flow: "PERSONAL",
        empty: "Sin faltas de uniforme ni indisciplina con estos filtros",
    },
    ESCALONADA: { title: "Penalidad Escalonada Bonos", empty: "Sin penalidades escalonadas con estos filtros" },
};
const emptyCatalog: IncidenciaCatalogo = { tipos: [], reportantes: [], responsables: [], penalidades: [] };
const emptySummary: EquipoIncidenciasResumen = { recibidasPendientes: 0, enviadasPendientes: 0, aprobadas: 0, rechazadas: 0 };
const message = (cause: unknown, fallback: string) => (cause && typeof cause === "object" && "message" in cause ? String(cause.message) : fallback);
const monthRange = (period?: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const year = period ? Number(period.split("-")[0]) : Number(parts.find((part) => part.type === "year")?.value);
    const month = period ? Number(period.split("-")[1]) : Number(parts.find((part) => part.type === "month")?.value);
    return {
        from: `${year}-${String(month).padStart(2, "0")}-01`,
        to: `${year}-${String(month).padStart(2, "0")}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
    };
};
type Response = { postura?: string; comentario?: string };
const responseOf = (item: IncidenciaEvento): Response =>
    item.datos?.respuesta_jefe_sede && typeof item.datos.respuesta_jefe_sede === "object" ? (item.datos.respuesta_jefe_sede as Response) : {};
const stanceLabel = (value?: string) => (value === "CONFORME" ? "Conforme" : value === "DESCARGO" ? "Descargo" : "Sin respuesta");

const columns: ColumnDef[] = [
    {
        key: "direccion",
        header: "Dirección",
        render: (value) => <StatusBadge>{value === "RECIBIDAS" ? "Recibida" : "Enviada"}</StatusBadge>,
    },
    { key: "responsable", header: "Colaborador", render: (value) => <NombreCell value={value} /> },
    {
        key: "sede",
        header: "Sede",
        render: (value) => (value ? <StatusBadge>{String(value)}</StatusBadge> : <span className="text-tertiary">Sin sede</span>),
    },
    {
        key: "cliente",
        header: "Cliente",
        render: (value, row) =>
            value || row.clienteDocumento ? (
                <div className="min-w-0">
                    <NombreCell value={value} />
                    <p className="text-xs whitespace-nowrap text-tertiary tabular-nums">{String(row.clienteDocumento ?? "")}</p>
                </div>
            ) : (
                <span className="text-tertiary">—</span>
            ),
    },
    {
        key: "operaciones",
        header: "Operación",
        render: (value) => {
            const items = Array.isArray(value) ? (value as { codigo: string | null; tipo: string | null }[]) : [];
            return items.length ? (
                <div className="min-w-0 space-y-0.5">
                    {items.slice(0, 2).map((item, index) => (
                        <p key={index} className="text-xs text-primary tabular-nums">
                            {item.codigo || item.tipo || "Operación"}
                        </p>
                    ))}
                    {items.length > 2 && <p className="text-xs text-tertiary">+{items.length - 2} más</p>}
                </div>
            ) : (
                <span className="text-tertiary">—</span>
            );
        },
    },
    { key: "tipo", header: "Tipo", render: (value) => <NotasCell value={value} /> },
    { key: "motivo", header: "Motivo", render: (value) => <NotasCell value={value} /> },
    { key: "enviadoPor", header: "Registrado por", render: (value) => <NombreCell value={value} /> },
    { key: "respuesta", header: "Respuesta", render: (value) => <span className="text-xs text-tertiary">{String(value)}</span> },
    {
        key: "estado",
        header: "Estado",
        render: (value) => <CompensacionEstado dominio="registro" valor={value} />,
    },
    { key: "fecha", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
];

export const IncidenciasEquipoPage = withAlertProvider<{ grupo?: Grupo }>(({ grupo } = {}) => {
    const config = grupo ? grupos[grupo] : undefined;
    const notify = useAlert();
    const dates = useMemo(monthRange, []);
    const [catalog, setCatalog] = useState(emptyCatalog);
    const [items, setItems] = useState<IncidenciaEvento[]>([]);
    const [summary, setSummary] = useState(emptySummary);
    const [direction, setDirection] = useState("");
    const [search, setSearch] = useState("");
    const [dni, setDni] = useState("");
    const [code, setCode] = useState("");
    const [status, setStatus] = useState("");
    const [from, setFrom] = useState(dates.from);
    const [to, setTo] = useState(dates.to);
    const [filters, setFilters] = useState({ search: "", dni: "", code: "", status: "", from: dates.from, to: dates.to });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [catalogError, setCatalogError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [selected, setSelected] = useState<IncidenciaEvento | null>(null);
    const request = useRef(0);

    useEffect(() => {
        let active = true;
        setCatalogError("");
        incidenciasService
            .getCatalog()
            .then((result) => {
                if (active) setCatalog(result);
            })
            .catch((cause) => {
                if (active) {
                    setCatalog(emptyCatalog);
                    setCatalogError(message(cause, "No fue posible cargar el catálogo de incidencias"));
                }
            });
        return () => {
            active = false;
        };
    }, [refresh]);
    const load = useCallback(async () => {
        const current = ++request.current;
        setBusy(true);
        setError("");
        setItems([]);
        try {
            const result = await incidenciasService.getTeamList({ direction, ...filters, page, pageSize, grupo });
            if (current !== request.current) return;
            setItems(result.items);
            setSummary(result.resumen);
            setTotalPages(result.totalPages);
        } catch (cause) {
            if (current !== request.current) return;
            const text = message(cause, "No fue posible cargar las incidencias");
            setError(text);
            setSummary(emptySummary);
            notify("error", text);
        } finally {
            if (current === request.current) setBusy(false);
        }
    }, [notify, direction, filters, page, pageSize, refresh, grupo]);
    useEffect(() => {
        void load();
        return () => {
            ++request.current;
        };
    }, [load]);

    const rows = useMemo(
        () =>
            items.map((item) => ({
                id: item.id,
                direccion: item.direccion,
                responsable: item.responsableNombre,
                sede: item.sucursalResponsableNombre,
                cliente: item.clienteNombre,
                clienteDocumento: item.clienteDocumento,
                operaciones: item.operaciones,
                tipo: item.penalidadNombre,
                motivo: item.motivo,
                enviadoPor: item.usuarioRegistraNombre,
                respuesta: stanceLabel(responseOf(item).postura),
                estado: item.estado,
                fecha: item.fechaEvento,
            })),
        [items],
    );
    const metrics = [
        {
            label: "Recibidas Pendientes",
            value: summary.recibidasPendientes,
            helper: "Requieren tu conformidad o descargo",
            icon: AlertCircle,
            tone: "text-warning-primary",
        },
        {
            label: "Enviadas Pendientes",
            value: summary.enviadasPendientes,
            helper: "Esperan decisión del Administrador",
            icon: File07,
            tone: "text-brand-secondary",
        },
        { label: "Aprobadas", value: summary.aprobadas, helper: "Decididas por Administración", icon: CheckCircle, tone: "text-success-primary" },
        { label: "Rechazadas", value: summary.rechazadas, helper: "Con motivo registrado", icon: XCircle, tone: "text-error-primary" },
    ];
    useEffect(() => {
        if (from && to && to < from) return;
        if (
            search === filters.search &&
            dni === filters.dni &&
            code === filters.code &&
            status === filters.status &&
            from === filters.from &&
            to === filters.to
        )
            return;
        const timer = setTimeout(() => {
            setPage(1);
            setFilters({ search, dni, code, status, from, to });
        }, 350);
        return () => clearTimeout(timer);
    }, [search, dni, code, status, from, to, filters]);

    const clear = () => {
        const currentDates = monthRange();
        setSearch("");
        setDni("");
        setCode("");
        setStatus("");
        setFrom(currentDates.from);
        setTo(currentDates.to);
        setPage(1);
        setSelected(null);
        setFilters({ search: "", dni: "", code: "", status: "", ...currentDates });
    };

    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <CompensacionHeading section="incidencias" title={config?.title ?? "Incidencias del Equipo"} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>section]:flex [&>section]:flex-col [&>section>div:last-child]:flex-1">
                    {metrics.map((metric) => {
                        const Icon = metric.icon;
                        return (
                            <CompensacionPanel
                                key={metric.label}
                                title={metric.label}
                                trailing={<Icon aria-hidden="true" className={`size-5 shrink-0 ${metric.tone}`} />}
                            >
                                <p className={`text-display-xs font-semibold tabular-nums ${metric.tone}`}>{busy || error ? "—" : metric.value}</p>
                                <p className="mt-1 text-xs text-tertiary">{error ? "Resumen no disponible" : metric.helper}</p>
                            </CompensacionPanel>
                        );
                    })}
                </div>
                {catalogError && <AlertMessage tone="error">{catalogError}</AlertMessage>}
                {!catalogError && config?.flow && catalog.responsables.length > 0 && (
                    <CompensacionPanel title={config.formTitle ?? "Registrar Incidencia"}>
                        <IncidenciaEquipoForm
                            flow={config.flow}
                            catalog={catalog}
                            onSave={() => {
                                setDirection("ENVIADAS");
                                setPage(1);
                                setRefresh((value) => value + 1);
                            }}
                        />
                    </CompensacionPanel>
                )}
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                <DataTable
                    density="compact"
                    wrapText
                    toolbar={
                        <CompensacionFiltros toolbar>
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="w-32">
                                    <Input
                                        size="sm"
                                        label=""
                                        aria-label="DNI"
                                        placeholder="DNI"
                                        value={dni}
                                        onChange={(value) => setDni(value.replace(/\D/g, "").slice(0, 9))}
                                        inputMode="numeric"
                                        maxLength={9}
                                    />
                                </div>
                                <div className="w-56">
                                    <Input
                                        size="sm"
                                        label=""
                                        aria-label="Nombre o DNI Colaborador"
                                        placeholder="Nombre o DNI Colaborador"
                                        value={search}
                                        onChange={setSearch}
                                    />
                                </div>
                                <div className="w-44">
                                    <Input
                                        size="sm"
                                        label=""
                                        aria-label="Código de operación"
                                        placeholder="Código de operación"
                                        value={code}
                                        onChange={setCode}
                                    />
                                </div>
                                <div className="w-52">
                                    <Select
                                        size="sm"
                                        aria-label="Estado"
                                        placeholder="Todos los estados"
                                        selectedKey={status}
                                        items={[
                                            { id: "", label: "Todos los estados" },
                                            ...["PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"].map((value) => ({
                                                id: value,
                                                label: compensationStatus(value),
                                            })),
                                        ]}
                                        onSelectionChange={(key) => setStatus(key !== null ? String(key) : "")}
                                    >
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>
                                </div>
                                <div className="w-44">
                                    <CompensacionDatePicker hideLabel label="Desde" value={from} onChange={setFrom} />
                                </div>
                                <div className="w-44">
                                    <CompensacionDatePicker hideLabel label="Hasta" value={to} onChange={setTo} />
                                </div>
                                <MonthPicker
                                    hideLabel
                                    label="Periodo"
                                    allowAllMonths={false}
                                    value={from.slice(0, 7)}
                                    onChange={(value) => {
                                        if (!value) return;
                                        const next = monthRange(value);
                                        setFrom(next.from);
                                        setTo(next.to);
                                    }}
                                />
                                <div className="w-52">
                                    <Select
                                        size="sm"
                                        aria-label="Dirección"
                                        placeholder="Todas (enviadas y recibidas)"
                                        selectedKey={direction}
                                        items={[
                                            { id: "", label: "Todas (enviadas y recibidas)" },
                                            { id: "ENVIADAS", label: "Enviadas" },
                                            { id: "RECIBIDAS", label: "Recibidas" },
                                        ]}
                                        onSelectionChange={(key) => {
                                            const value = key === "RECIBIDAS" || key === "ENVIADAS" ? key : "";
                                            if (value !== direction) {
                                                ++request.current;
                                                setSelected(null);
                                                setDirection(value);
                                                setPage(1);
                                            }
                                        }}
                                    >
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>
                                </div>
                                <Button size="sm" color="secondary" iconLeading={XClose} onClick={clear}>
                                    Limpiar
                                </Button>
                            </div>
                        </CompensacionFiltros>
                    }
                    columns={columns}
                    data={busy || error ? [] : rows}
                    isLoading={busy}
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage={error ? "Consulta no disponible" : (config?.empty ?? "No hay incidencias del equipo")}
                    emptyDescription="Cambia el período o los filtros."
                    renderActions={(row) => {
                        const item = items.find((entry) => entry.id === Number(row.id));
                        return item ? (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={Eye}
                                tooltip="Ver detalle de incidencia"
                                className={compensationTableActionClass}
                                onClick={() => setSelected(item)}
                            />
                        ) : null;
                    }}
                />
                {selected && (
                    <IncidenciaEquipoDetail
                        item={selected}
                        onClose={() => setSelected(null)}
                        onChanged={() => {
                            setSelected(null);
                            setRefresh((value) => value + 1);
                        }}
                    />
                )}
            </div>
        </AppLayout>
    );
});
