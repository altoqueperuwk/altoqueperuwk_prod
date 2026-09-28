import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Clock, Edit03, RefreshCw01, UploadCloud02, UserCheck01, Users03, X } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { useToast } from "@/providers/toast-provider";
import { sucursalService } from "@/services/sucursal.service";
import { AsistenciaCorrectionModal } from "./asistencia-correction-modal";
import { asistenciaService } from "./asistencia.service";
import type { AsistenciaCarga, AsistenciaJornada, AsistenciaResumen, AsistenciaSolicitud } from "./asistencia.types";
import { AsistenciaUploadModal } from "./asistencia-upload-modal";
import { SolicitudResolverModal } from "./solicitud-resolver-modal";

const emptySummary: AsistenciaResumen = { integrantes: 0, jornadas: 0, tardanzas: 0, faltasEntrada: 0, faltasSalida: 0, ausencias: 0, diasCompletos: 0, pendientes: 0 };
const dateFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "America/Lima", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", hour12: false, minute: "2-digit", timeZone: "America/Lima" });
const formatDate = (value: string | null) => value ? dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—";
const formatDateTime = (value: string | null) => value ? dateTimeFormatter.format(new Date(value)) : "—";
const formatTime = (value: string | null) => value ? timeFormatter.format(new Date(value)) : "—";
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const requestedChange = (request: AsistenciaSolicitud) => {
    const values = request.valoresSolicitados;
    const entry = values.entrada_real ? formatTime(String(values.entrada_real)) : "—";
    const exit = values.salida_real ? formatTime(String(values.salida_real)) : "—";
    const state = values.estado_dia ? humanize(String(values.estado_dia)) : humanize(request.estadoDia);
    return `${entry} – ${exit} · ${state}`;
};

const limaDateParts = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return { year: Number(part("year")), month: Number(part("month")), day: Number(part("day")) };
};
const initialRange = () => {
    const current = limaDateParts();
    const last = new Date(Date.UTC(current.year, current.month, 0)).getUTCDate();
    return { from: `${current.year}-${String(current.month).padStart(2, "0")}-01`, to: `${current.year}-${String(current.month).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
};

const statusColor = (status: string): "success" | "warning" | "error" | "gray" | "brand" => {
    if (["COMPLETO", "APROBADA", "CONFIRMADA"].includes(status)) return "success";
    if (["PENDIENTE", "FALTA_ENTRADA", "FALTA_SALIDA", "VALIDADA"].includes(status)) return "warning";
    if (["AUSENTE", "RECHAZADA"].includes(status)) return "error";
    if (["JUSTIFICADO", "VACACIONES", "LICENCIA"].includes(status)) return "brand";
    return "gray";
};

export const AsistenciaPage = () => {
    const { addToast } = useToast();
    const [range, setRange] = useState(initialRange);
    const [draftFrom, setDraftFrom] = useState(range.from);
    const [draftTo, setDraftTo] = useState(range.to);
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [idSucursal, setIdSucursal] = useState(0);
    const [appliedSucursal, setAppliedSucursal] = useState(0);
    const [status, setStatus] = useState("");
    const [appliedStatus, setAppliedStatus] = useState("");
    const [branches, setBranches] = useState<Array<{ id: number; label: string }>>([]);
    const [jornadas, setJornadas] = useState<AsistenciaJornada[]>([]);
    const [summary, setSummary] = useState<AsistenciaResumen>(emptySummary);
    const [requests, setRequests] = useState<AsistenciaSolicitud[]>([]);
    const [latestLoad, setLatestLoad] = useState<AsistenciaCarga | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [correctionItem, setCorrectionItem] = useState<AsistenciaJornada | null>(null);
    const [resolution, setResolution] = useState<{ solicitud: AsistenciaSolicitud; decision: "APROBADA" | "RECHAZADA" } | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        sucursalService.getList().then((items) => setBranches(items.map((item) => ({ id: Number(item.id), label: String(item.nombre ?? "") })))).catch(() => addToast("error", "No se pudieron cargar las sedes"));
    }, [addToast]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        const [journeysResult, requestsResult, loadsResult] = await Promise.allSettled([
            asistenciaService.getJornadas({ from: range.from, to: range.to, search: appliedSearch, idSucursal: appliedSucursal, estado: appliedStatus, page, pageSize }),
            asistenciaService.getSolicitudes({ from: range.from, to: range.to, estado: "PENDIENTE", page: 1, pageSize: 20 }),
            asistenciaService.getCargas(),
        ]);
        if (journeysResult.status === "fulfilled") {
            setJornadas(journeysResult.value.items);
            setSummary(journeysResult.value.summary);
            setTotalPages(Math.max(1, journeysResult.value.totalPages));
        } else {
            setJornadas([]); setSummary(emptySummary); setTotalPages(1);
            addToast("error", journeysResult.reason instanceof Error ? journeysResult.reason.message : "No fue posible cargar la asistencia");
        }
        if (requestsResult.status === "fulfilled") setRequests(requestsResult.value.items);
        else setRequests([]);
        if (loadsResult.status === "fulfilled") setLatestLoad(loadsResult.value[0] ?? null);
        else setLatestLoad(null);
        setIsLoading(false);
    }, [addToast, appliedSearch, appliedStatus, appliedSucursal, page, pageSize, range.from, range.to, refreshKey]);

    useEffect(() => { void loadData(); }, [loadData]);

    const applyFilters = () => {
        if (!draftFrom || !draftTo) return addToast("error", "Selecciona el rango de fechas");
        if (draftTo < draftFrom) return addToast("error", "La fecha hasta no puede ser anterior a la fecha desde");
        setPage(1); setRange({ from: draftFrom, to: draftTo }); setAppliedSearch(search); setAppliedSucursal(idSucursal); setAppliedStatus(status);
    };

    const rows = useMemo<Record<string, unknown>[]>(() => jornadas.map((item) => ({ id: item.id, fecha: item.fecha, persona: item.colaboradorNombre, documento: item.colaboradorDocumento, entrada: item.entradaReal, salida: item.salidaReal, tardanza: item.minutosTardanza, extras: item.minutosExtra, estado: item.estadoDia, sede: item.sucursalNombre, cargo: item.cargoNombre })), [jornadas]);
    const columns: ColumnDef[] = [
        { key: "fecha", header: "Fecha", render: (value) => formatDate(String(value)) },
        { key: "persona", header: "Persona", render: (value, row) => <div><p className="font-medium text-primary">{String(value)}</p><p className="mt-0.5 text-xs text-tertiary">{String(row.documento)} · {String(row.sede)}</p></div> },
        { key: "entrada", header: "Entrada", render: (value) => <span className="font-medium tabular-nums">{formatTime(value ? String(value) : null)}</span> },
        { key: "salida", header: "Salida", render: (value) => <span className="font-medium tabular-nums">{formatTime(value ? String(value) : null)}</span> },
        { key: "tardanza", header: "Tardanza", render: (value) => <span className={Number(value) > 0 ? "font-medium text-warning-primary" : "text-tertiary"}>{Number(value)} min</span> },
        { key: "extras", header: "Min. extra", render: (value) => `${Number(value)} min` },
        { key: "estado", header: "Estado del día", render: (value) => <Badge size="sm" color={statusColor(String(value))}>{humanize(String(value))}</Badge> },
    ];

    const metrics = [
        { label: "Integrantes detectados", value: summary.integrantes, helper: `${summary.jornadas} jornadas`, icon: Users03, tone: "text-brand-secondary" },
        { label: "Tardanzas", value: summary.tardanzas, helper: "Luego de la tolerancia", icon: Clock, tone: "text-warning-primary" },
        { label: "Faltas de salida", value: summary.faltasSalida, helper: "Solo entrada detectada", icon: AlertCircle, tone: "text-error-primary" },
        { label: "Faltas de entrada", value: summary.faltasEntrada, helper: "Solo salida detectada", icon: AlertCircle, tone: "text-error-primary" },
        { label: "Días completos", value: summary.diasCompletos, helper: "Entrada y salida detectadas", icon: UserCheck01, tone: "text-success-primary" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-brand-secondary">Compensaciones</p><h1 className="mt-1 text-display-xs font-semibold text-primary">Control de asistencia</h1><p className="mt-1 text-sm text-tertiary">Consolida las marcaciones del huellero y gestiona correcciones auditadas.</p></div><Button size="md" color="primary" iconLeading={UploadCloud02} onClick={() => setIsUploadOpen(true)}>Subir Excel</Button></div>

                {latestLoad && <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col justify-between gap-4 rounded-xl border border-secondary bg-primary p-5 shadow-xs sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold text-primary">Último archivo: {latestLoad.nombreArchivo}</p><Badge size="sm" color={statusColor(latestLoad.estadoCarga)}>{humanize(latestLoad.estadoCarga)}</Badge></div><p className="mt-1 text-xs text-tertiary">Importado {formatDateTime(latestLoad.fechaRegistro)} · {latestLoad.totalValidas} válidas · {latestLoad.totalInvalidas} inválidas · {latestLoad.totalDuplicadas} duplicadas</p></div><Button size="sm" color="secondary" iconLeading={RefreshCw01} onClick={() => setRefreshKey((value) => value + 1)}>Actualizar datos</Button></motion.section>}

                {requests.length > 0 && <section className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs"><div className="flex items-center justify-between border-b border-secondary px-5 py-4"><div><h2 className="text-sm font-semibold text-primary">Solicitudes pendientes de asistencia ({requests.length})</h2><p className="mt-1 text-xs text-tertiary">Revisa el cambio solicitado antes de aplicarlo.</p></div></div><div className="divide-y divide-secondary">{requests.slice(0, 5).map((request) => <div key={request.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-center"><div><p className="text-sm font-medium text-primary">{request.colaboradorNombre}</p><p className="mt-0.5 text-xs text-tertiary">{request.colaboradorDocumento} · {formatDate(request.fecha)}</p></div><div className="text-xs text-secondary"><p>Actual: {formatTime(request.entradaReal)} – {formatTime(request.salidaReal)} · {humanize(request.estadoDia)}</p><p className="mt-1 font-medium text-brand-secondary">Cambio: {requestedChange(request)}</p></div><div><p className="text-xs font-medium text-primary">{request.motivo}</p><p className="mt-1 text-xs text-tertiary">Solicitado por {request.usuarioSolicitaNombre}</p></div><div className="flex gap-2"><Button size="xs" color="secondary" iconLeading={Check} onClick={() => setResolution({ solicitud: request, decision: "APROBADA" })}>Aprobar</Button><Button size="xs" color="secondary-destructive" iconLeading={X} onClick={() => setResolution({ solicitud: request, decision: "RECHAZADA" })}>Rechazar</Button></div></div>)}</div></section>}

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metrics.map((metric, index) => { const Icon = metric.icon; return <motion.article key={metric.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.035 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"><div className="flex items-start justify-between"><p className="text-xs font-medium text-tertiary">{metric.label}</p><Icon className={`size-5 ${metric.tone}`} /></div><p className={`mt-3 text-display-xs font-semibold tabular-nums ${metric.tone}`}>{metric.value}</p><p className="mt-1 text-xs text-tertiary">{metric.helper}</p></motion.article>; })}</div>

                <section className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"><div className="flex flex-wrap items-end gap-3"><div className="w-44"><Input label="Desde" size="sm" type="date" value={draftFrom} onChange={setDraftFrom} /></div><div className="w-44"><Input label="Hasta" size="sm" type="date" value={draftTo} onChange={setDraftTo} /></div><div className="w-56"><Input label="Persona" size="sm" placeholder="Nombre o DNI" value={search} onChange={setSearch} /></div><div className="w-48"><Select label="Sede" size="sm" items={[{ id: 0, label: "Todas" }, ...branches]} selectedKey={idSucursal} onSelectionChange={(key) => setIdSucursal(key !== null ? Number(key) : 0)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div><div className="w-48"><Select label="Estado" size="sm" items={[{ id: "", label: "Todos" }, ...["COMPLETO", "FALTA_ENTRADA", "FALTA_SALIDA", "AUSENTE", "PENDIENTE", "JUSTIFICADO"].map((value) => ({ id: value, label: humanize(value) }))]} selectedKey={status} onSelectionChange={(key) => setStatus(key !== null ? String(key) : "")}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div><Button size="sm" color="primary" onClick={applyFilters}>Consultar</Button></div></section>

                <DataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} emptyMessage="No hay jornadas en el período" emptyDescription="Confirma una carga del huellero o cambia los filtros." renderActions={(row) => { const item = jornadas.find((journey) => journey.id === Number(row.id)); return item ? <Button size="xs" color="tertiary" iconLeading={Edit03} onClick={() => setCorrectionItem(item)}>Corregir</Button> : null; }} />

                <AsistenciaUploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} onConfirmed={() => { setIsUploadOpen(false); setRefreshKey((value) => value + 1); }} />
                <AsistenciaCorrectionModal isOpen={correctionItem !== null} onClose={() => setCorrectionItem(null)} onSave={() => { setCorrectionItem(null); setRefreshKey((value) => value + 1); }} jornada={correctionItem} />
                <SolicitudResolverModal solicitud={resolution?.solicitud ?? null} decision={resolution?.decision ?? null} onClose={() => setResolution(null)} onSave={() => { setResolution(null); setRefreshKey((value) => value + 1); }} />
            </div>
        </AppLayout>
    );
};
