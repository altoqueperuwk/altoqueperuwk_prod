import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Eye, File07, Plus } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { useToast } from "@/providers/toast-provider";
import { colaboradoresService } from "../colaboradores/colaboradores.service";
import type { Colaborador } from "../colaboradores/colaboradores.types";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import { EvidenciaPopup } from "./evidencia-popup";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento, EvidenciasResumen, EvidenciaTipo } from "./evidencias.types";

const emptySummary: EvidenciasResumen = { borradores: 0, pendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 };
const moneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "America/Lima", year: "numeric" });
const formatDateTime = (value: string) => value ? dateTimeFormatter.format(new Date(value)) : "—";
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));

const monthRange = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
    const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: `${year}-${String(month).padStart(2, "0")}-${lastDay}` };
};

const statusColor = (status: string): "success" | "warning" | "error" | "gray" | "brand" => {
    if (["APROBADO", "LIQUIDADO"].includes(status)) return "success";
    if (status === "PENDIENTE") return "warning";
    if (["RECHAZADO", "ANULADO"].includes(status)) return "error";
    if (status === "BORRADOR") return "brand";
    return "gray";
};

export const EvidenciasPage = () => {
    const { addToast } = useToast();
    const initialDates = useMemo(monthRange, []);
    const [types, setTypes] = useState<EvidenciaTipo[]>([]);
    const [collaborators, setCollaborators] = useState<Colaborador[]>([]);
    const [items, setItems] = useState<EvidenciaEvento[]>([]);
    const [summary, setSummary] = useState<EvidenciasResumen>(emptySummary);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [status, setStatus] = useState("");
    const [typeId, setTypeId] = useState(0);
    const [from, setFrom] = useState(initialDates.from);
    const [to, setTo] = useState(initialDates.to);
    const [filters, setFilters] = useState({ search: "", category: "", status: "", typeId: 0, from: initialDates.from, to: initialDates.to });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [selected, setSelected] = useState<EvidenciaEvento | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        Promise.all([
            evidenciasService.getTypes(),
            colaboradoresService.getList({ search: "", idCargo: 0, idEstado: 0, idSucursal: 0, page: 1, pageSize: 200 }),
        ]).then(([typeRows, collaboratorRows]) => {
            setTypes(typeRows.filter((item) => item.estadoNombre.toLocaleUpperCase("es-PE") === "ACTIVO"));
            setCollaborators(collaboratorRows.items);
        }).catch((error) => addToast("error", error instanceof Error ? error.message : "No fue posible cargar los catálogos"));
    }, [addToast]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await evidenciasService.getList({ ...filters, page, pageSize });
            setItems(result.items);
            setSummary(result.resumen);
            setTotalPages(Math.max(1, result.totalPages));
        } catch (error) {
            setItems([]);
            setSummary(emptySummary);
            setTotalPages(1);
            addToast("error", error instanceof Error ? error.message : "No fue posible cargar las evidencias");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, filters, page, pageSize, refreshKey]);

    useEffect(() => { void loadData(); }, [loadData]);

    const applyFilters = () => {
        if (from && to && to < from) return addToast("error", "La fecha hasta no puede ser anterior a la fecha desde");
        setPage(1);
        setFilters({ search, category, status, typeId, from, to });
    };

    const clearFilters = () => {
        const dates = monthRange();
        setSearch(""); setCategory(""); setStatus(""); setTypeId(0); setFrom(dates.from); setTo(dates.to); setPage(1);
        setFilters({ search: "", category: "", status: "", typeId: 0, from: dates.from, to: dates.to });
    };

    const rows = useMemo<Record<string, unknown>[]>(() => items.map((item) => ({
        id: item.id,
        tipo: item.tipoNombre,
        categoria: item.categoria,
        colaborador: item.beneficiarioNombre ?? item.responsableNombre ?? "—",
        documento: item.beneficiarioDocumento ?? "",
        sede: item.sucursalOrigenNombre ?? "—",
        fecha: item.fechaEvento,
        estado: item.estado,
        importe: item.importeAprobado,
        sustento: item.evidencia.length,
    })), [items]);

    const columns: ColumnDef[] = [
        { key: "tipo", header: "Evidencia", render: (value, row) => <div><p className="font-medium text-primary">{String(value)}</p><p className="mt-0.5 text-xs text-tertiary">{humanize(String(row.categoria))} · #{String(row.id)}</p></div> },
        { key: "colaborador", header: "Colaborador", render: (value, row) => <div><p className="font-medium text-primary">{String(value)}</p><p className="mt-0.5 text-xs text-tertiary">{String(row.documento)}{row.sede ? ` · ${String(row.sede)}` : ""}</p></div> },
        { key: "fecha", header: "Fecha", render: (value) => formatDateTime(String(value)) },
        { key: "sustento", header: "Sustentos", render: (value) => Number(value) > 0 ? <Badge size="sm" color="brand">{Number(value)} archivo(s)</Badge> : <span className="text-tertiary">Sin adjuntos</span> },
        { key: "importe", header: "Importe", render: (value) => <span className={value !== null ? "font-semibold text-success-primary" : "text-tertiary"}>{value !== null ? moneyFormatter.format(Number(value)) : "Pendiente"}</span> },
        { key: "estado", header: "Estado", render: (value) => <Badge size="sm" color={statusColor(String(value))}>{humanize(String(value))}</Badge> },
    ];

    const metrics = [
        { label: "Borradores", value: summary.borradores, helper: "Pendientes de envío", icon: File07, tone: "text-brand-secondary" },
        { label: "Pendientes", value: summary.pendientes, helper: "Esperando revisión", icon: Clock, tone: "text-warning-primary" },
        { label: "Aprobadas", value: summary.aprobados, helper: moneyFormatter.format(summary.importeAprobado), icon: CheckCircle, tone: "text-success-primary" },
        { label: "Rechazadas", value: summary.rechazados, helper: `${summary.anulados} anulada(s)`, icon: AlertCircle, tone: "text-error-primary" },
    ];
    const creatableTypes = types.filter((item) => item.categoria !== "REFERIDO");

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-brand-secondary">Compensaciones</p><h1 className="mt-1 text-display-xs font-semibold text-primary">Evidencias</h1><p className="mt-1 text-sm text-tertiary">Centraliza calificaciones, llamadas, tarjetas de terceros y otros sustentos bonificables.</p></div><Button size="md" color="primary" iconLeading={Plus} isDisabled={creatableTypes.length === 0} onClick={() => setIsPopupOpen(true)}>Nueva evidencia</Button></div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric, index) => { const Icon = metric.icon; return <motion.article key={metric.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.035 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"><div className="flex items-start justify-between"><p className="text-xs font-medium text-tertiary">{metric.label}</p><Icon className={`size-5 ${metric.tone}`} /></div><p className={`mt-3 text-display-xs font-semibold tabular-nums ${metric.tone}`}>{metric.value}</p><p className="mt-1 text-xs text-tertiary">{metric.helper}</p></motion.article>; })}</div>

                {types.length === 0 && !isLoading && <div className="rounded-xl border border-warning bg-warning-secondary p-4"><p className="text-sm font-semibold text-warning-primary">Falta configurar el catálogo de evidencias</p><p className="mt-1 text-sm text-tertiary">Registra tipos activos y vincúlalos con un concepto de compensación antes de crear evidencias.</p></div>}

                <section className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"><div className="flex flex-wrap items-end gap-3"><div className="w-56"><Input label="Buscar" size="sm" placeholder="Persona, DNI o detalle" value={search} onChange={setSearch} /></div><div className="w-48"><Select label="Categoría" size="sm" items={[{ id: "", label: "Todas" }, ...["CALIFICACION", "LLAMADA", "TARJETA_TERCERO", "REFERIDO", "OTRO"].map((value) => ({ id: value, label: humanize(value) }))]} selectedKey={category} onSelectionChange={(key) => { const value = key !== null ? String(key) : ""; setCategory(value); setTypeId(0); }}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div><div className="w-52"><Select label="Tipo" size="sm" items={[{ id: 0, label: "Todos" }, ...types.filter((item) => !category || item.categoria === category).map((item) => ({ id: item.id, label: item.nombre }))]} selectedKey={typeId} onSelectionChange={(key) => setTypeId(key !== null ? Number(key) : 0)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div><div className="w-44"><Select label="Estado" size="sm" items={[{ id: "", label: "Todos" }, ...["BORRADOR", "PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"].map((value) => ({ id: value, label: humanize(value) }))]} selectedKey={status} onSelectionChange={(key) => setStatus(key !== null ? String(key) : "")}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select></div><div className="w-40"><Input label="Desde" size="sm" type="date" value={from} onChange={setFrom} /></div><div className="w-40"><Input label="Hasta" size="sm" type="date" value={to} onChange={setTo} /></div><Button size="sm" color="primary" onClick={applyFilters}>Consultar</Button><Button size="sm" color="secondary" onClick={clearFilters}>Limpiar</Button></div></section>

                <DataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} emptyMessage="No hay evidencias en el período" emptyDescription="Cambia los filtros o registra una nueva evidencia." renderActions={(row) => { const item = items.find((entry) => entry.id === Number(row.id)); return item ? <Button size="xs" color="tertiary" iconLeading={Eye} onClick={() => setSelected(item)}>Ver</Button> : null; }} />

                <EvidenciaPopup isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} onSave={() => { setIsPopupOpen(false); setRefreshKey((value) => value + 1); }} types={creatableTypes} collaborators={collaborators} />
                <EvidenciaDetailModal item={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); setRefreshKey((value) => value + 1); }} />
            </div>
        </AppLayout>
    );
};
