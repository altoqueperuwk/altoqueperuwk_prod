import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Coins01, Eye, File07, Plus } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { useToast } from "@/providers/toast-provider";
import { IncidenciaDetailModal } from "./incidencia-detail-modal";
import { IncidenciaPopup } from "./incidencia-popup";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaBandeja, IncidenciaCatalogo, IncidenciaEvento, IncidenciasResumen } from "./incidencias.types";

const emptyCatalog: IncidenciaCatalogo = { tipos: [], reportantes: [], responsables: [], penalidades: [] };
const emptySummary: IncidenciasResumen = { recibidosPendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, totalDescuentosAprobados: 0, totalBonosReportantes: 0 };
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const dateTime = new Intl.DateTimeFormat("es-PE", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "America/Lima", year: "numeric" });
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const monthRange = () => { const parts = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date()); const year = Number(parts.find((part) => part.type === "year")?.value); const month = Number(parts.find((part) => part.type === "month")?.value); return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: `${year}-${String(month).padStart(2, "0")}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` }; };
const statusColor = (value: string): "success" | "warning" | "error" | "brand" | "gray" => ["APROBADO", "LIQUIDADO"].includes(value) ? "success" : value === "PENDIENTE" ? "warning" : ["RECHAZADO", "ANULADO"].includes(value) ? "error" : value === "BORRADOR" ? "brand" : "gray";

export const IncidenciasPage = () => {
    const { addToast } = useToast();
    const dates = useMemo(monthRange, []);
    const [catalog, setCatalog] = useState(emptyCatalog);
    const [items, setItems] = useState<IncidenciaEvento[]>([]);
    const [summary, setSummary] = useState(emptySummary);
    const [tray, setTray] = useState<IncidenciaBandeja>("RECIBIDOS");
    const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [status, setStatus] = useState(""); const [from, setFrom] = useState(dates.from); const [to, setTo] = useState(dates.to);
    const [filters, setFilters] = useState({ search: "", category: "", status: "", from: dates.from, to: dates.to });
    const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20); const [totalPages, setTotalPages] = useState(1); const [isLoading, setIsLoading] = useState(true); const [isPopupOpen, setIsPopupOpen] = useState(false); const [selected, setSelected] = useState<IncidenciaEvento | null>(null); const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => { incidenciasService.getCatalog().then(setCatalog).catch((error) => addToast("error", error instanceof Error ? error.message : "No fue posible cargar el catálogo de incidencias")); }, [addToast, refreshKey]);
    const loadData = useCallback(async () => { setIsLoading(true); try { const result = await incidenciasService.getList({ tray, ...filters, penaltyId: 0, page, pageSize }); setItems(result.items); setSummary(result.resumen); setTotalPages(Math.max(1, result.totalPages)); } catch (error) { setItems([]); setSummary(emptySummary); setTotalPages(1); addToast("error", error instanceof Error ? error.message : "No fue posible cargar las incidencias"); } finally { setIsLoading(false); } }, [addToast, filters, page, pageSize, refreshKey, tray]);
    useEffect(() => { void loadData(); }, [loadData]);
    const apply = () => { if (from && to && to < from) return addToast("error", "La fecha hasta no puede ser anterior a la fecha desde"); setPage(1); setFilters({ search, category, status, from, to }); };
    const changeTray = (value: IncidenciaBandeja) => { setTray(value); setPage(1); };

    const rows = useMemo<Record<string, unknown>[]>(() => items.map((item) => ({ id: item.id, tipo: item.penalidadNombre, categoria: item.categoria, reportante: item.reportanteNombre ?? "—", sedeOrigen: item.sucursalOrigenNombre ?? "—", responsable: item.responsableNombre, sedeResponsable: item.sucursalResponsableNombre ?? "—", fecha: item.fechaEvento, descuento: item.montoReferencia, bono: item.montoBonoReportante, estado: item.estado })), [items]);
    const columns: ColumnDef[] = [
        { key: "tipo", header: "Incidencia", render: (value, row) => <div><p className="font-medium text-primary">{String(value)}</p><p className="mt-0.5 text-xs text-tertiary">{humanize(String(row.categoria))} · #{String(row.id)}</p></div> },
        { key: "reportante", header: "Reportante", render: (value, row) => <div><p className="font-medium text-primary">{String(value)}</p><p className="mt-0.5 text-xs text-tertiary">{String(row.sedeOrigen)}</p></div> },
        { key: "responsable", header: "Responsable", render: (value, row) => <div><p className="font-medium text-primary">{String(value)}</p><p className="mt-0.5 text-xs text-tertiary">{String(row.sedeResponsable)}</p></div> },
        { key: "fecha", header: "Fecha", render: (value) => dateTime.format(new Date(String(value))) },
        { key: "descuento", header: "Descuento", render: (value) => <span className="font-semibold text-error-primary">{money.format(Number(value))}</span> },
        { key: "bono", header: "Bono", render: (value) => <span className={value !== null ? "font-semibold text-success-primary" : "text-tertiary"}>{value !== null ? money.format(Number(value)) : "—"}</span> },
        { key: "estado", header: "Estado", render: (value) => <Badge size="sm" color={statusColor(String(value))}>{humanize(String(value))}</Badge> },
    ];
    const metrics = [
        { label: "Pendientes", value: summary.recibidosPendientes, helper: tray === "RECIBIDOS" ? "Esperando decisión de sede" : "En la bandeja actual", icon: File07, tone: "text-warning-primary" },
        { label: "Aprobadas", value: summary.aprobados, helper: `${summary.rechazados} rechazada(s)`, icon: CheckCircle, tone: "text-success-primary" },
        { label: "Descuentos aprobados", value: money.format(summary.totalDescuentosAprobados), helper: "Aplicables a responsables", icon: AlertCircle, tone: "text-error-primary" },
        { label: "Bonos a reportantes", value: money.format(summary.totalBonosReportantes), helper: `${summary.anulados} anulada(s)`, icon: Coins01, tone: "text-success-primary" },
    ];

    return <AppLayout><div className="flex flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-brand-secondary">Compensaciones</p><h1 className="mt-1 text-display-xs font-semibold text-primary">Incidencias</h1><p className="mt-1 text-sm text-tertiary">Gestiona penalidades cruzadas, auditorías de pagos, descargos y decisiones por sede.</p></div><Button size="md" color="primary" iconLeading={Plus} isDisabled={catalog.tipos.length === 0 || catalog.reportantes.length === 0} onClick={() => setIsPopupOpen(true)}>Nueva incidencia</Button></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric, index) => { const Icon = metric.icon; return <motion.article key={metric.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.035 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"><div className="flex items-start justify-between"><p className="text-xs font-medium text-tertiary">{metric.label}</p><Icon className={`size-5 ${metric.tone}`} /></div><p className={`mt-3 text-display-xs font-semibold tabular-nums ${metric.tone}`}>{metric.value}</p><p className="mt-1 text-xs text-tertiary">{metric.helper}</p></motion.article>; })}</div>
        <section className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs"><div className="flex flex-wrap gap-2 border-b border-secondary p-3">{(["RECIBIDOS", "ENVIADOS", "HISTORIAL", "TODOS"] as IncidenciaBandeja[]).map((value) => <Button key={value} size="sm" color={tray === value ? "primary" : "tertiary"} onClick={() => changeTray(value)}>{humanize(value)}</Button>)}</div><div className="flex flex-wrap items-end gap-3 p-4"><div className="w-56"><Input label="Buscar" size="sm" placeholder="Persona, DNI o motivo" value={search} onChange={setSearch} /></div><div className="w-48"><Select label="Categoría" size="sm" items={[{ id: "", label: "Todas" }, { id: "PENALIDAD", label: "Penalidad" }, { id: "AUDITORIA_PAGO", label: "Auditoría de pagos" }]} selectedKey={category} onSelectionChange={(key) => setCategory(key !== null ? String(key) : "")}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div><div className="w-44"><Select label="Estado" size="sm" items={[{ id: "", label: "Todos" }, ...["BORRADOR", "PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"].map((value) => ({ id: value, label: humanize(value) }))]} selectedKey={status} onSelectionChange={(key) => setStatus(key !== null ? String(key) : "")}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div><div className="w-40"><Input label="Desde" size="sm" type="date" value={from} onChange={setFrom} /></div><div className="w-40"><Input label="Hasta" size="sm" type="date" value={to} onChange={setTo} /></div><Button size="sm" color="primary" onClick={apply}>Consultar</Button></div></section>
        {catalog.tipos.length === 0 && !isLoading && <div className="rounded-xl border border-warning bg-warning-secondary p-4"><p className="text-sm font-semibold text-warning-primary">No hay tipos de incidencia activos</p><p className="mt-1 text-sm text-tertiary">Configura tipos de categoría Penalidad o Auditoría de pagos para habilitar el registro.</p></div>}
        <DataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} emptyMessage="No hay incidencias en esta bandeja" emptyDescription="Cambia el período, los filtros o selecciona otra bandeja." renderActions={(row) => { const item = items.find((entry) => entry.id === Number(row.id)); return item ? <Button size="xs" color="tertiary" iconLeading={Eye} onClick={() => setSelected(item)}>Ver</Button> : null; }} />
        <IncidenciaPopup isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} onSave={() => { setIsPopupOpen(false); setTray("TODOS"); setPage(1); setRefreshKey((value) => value + 1); }} catalog={catalog} />
        <IncidenciaDetailModal item={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); setRefreshKey((value) => value + 1); }} />
    </div></AppLayout>;
};
