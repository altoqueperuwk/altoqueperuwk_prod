import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Coins01, Eye, RefreshCw01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { useToast } from "@/providers/toast-provider";
import { LiquidacionDetailModal } from "./liquidacion-detail-modal";
import { liquidacionesService } from "./liquidaciones.service";
import type { Liquidacion, PeriodoCompensacion } from "./liquidaciones.types";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const dateTime = new Intl.DateTimeFormat("es-PE", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "America/Lima", year: "numeric" });
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const currentMonth = () => { const parts = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date()); return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`; };
const statusColor = (value: string): "success" | "warning" | "error" | "brand" | "gray" => ["APROBADA", "PAGADA"].includes(value) ? "success" : ["CALCULADA", "OBSERVADA", "PAGO_PARCIAL"].includes(value) ? "warning" : ["ANULADA", "REEMPLAZADA"].includes(value) ? "error" : "brand";

export const LiquidacionesPage = () => {
    const { addToast } = useToast();
    const [periods, setPeriods] = useState<PeriodoCompensacion[]>([]);
    const [periodId, setPeriodId] = useState(0);
    const [openMonth, setOpenMonth] = useState(currentMonth);
    const [items, setItems] = useState<Liquidacion[]>([]);
    const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [filters, setFilters] = useState({ search: "", status: "" });
    const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20); const [totalPages, setTotalPages] = useState(1); const [isLoading, setIsLoading] = useState(true); const [isCalculating, setIsCalculating] = useState(false); const [isOpening, setIsOpening] = useState(false); const [selected, setSelected] = useState<Liquidacion | null>(null); const [refreshKey, setRefreshKey] = useState(0);
    const selectedPeriod = periods.find((period) => period.id === periodId) ?? null;

    const loadPeriods = useCallback(async () => { try { const rows = await liquidacionesService.getPeriods(); setPeriods(rows); setPeriodId((current) => current || rows[0]?.id || 0); } catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible cargar los períodos"); } }, [addToast]);
    useEffect(() => { void loadPeriods(); }, [loadPeriods, refreshKey]);
    const loadData = useCallback(async () => { if (!periodId) { setItems([]); setIsLoading(false); return; } setIsLoading(true); try { const result = await liquidacionesService.getList({ periodId, ...filters, page, pageSize }); setItems(result.items); setTotalPages(Math.max(1, result.totalPages)); } catch (error) { setItems([]); setTotalPages(1); addToast("error", error instanceof Error ? error.message : "No fue posible cargar las liquidaciones"); } finally { setIsLoading(false); } }, [addToast, filters, page, pageSize, periodId, refreshKey]);
    useEffect(() => { void loadData(); }, [loadData]);

    const openPeriod = async () => { if (!openMonth) return; setIsOpening(true); try { await liquidacionesService.openPeriod(openMonth); addToast("success", "Período disponible para liquidación"); setRefreshKey((value) => value + 1); } catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible abrir el período"); } finally { setIsOpening(false); } };
    const calculateBatch = async () => { if (!periodId) return; setIsCalculating(true); try { const result = await liquidacionesService.calculateBatch(periodId); const processed = Number(result.procesados ?? 0); const errors = Number(result.errores ?? 0); addToast(errors > 0 ? "info" : "success", `${processed} liquidación(es) calculada(s)${errors > 0 ? ` · ${errors} con bloqueo` : ""}`); setRefreshKey((value) => value + 1); } catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible calcular el período"); } finally { setIsCalculating(false); } };
    const rows = useMemo<Record<string, unknown>[]>(() => items.map((item) => ({ id: item.id, persona: item.colaboradorNombre, documento: item.colaboradorDocumento, calculo: item.numeroCalculo, sueldo: item.totalSueldo, variables: item.totalBonos + item.totalComisiones, descuentos: item.totalDescuentos, total: item.totalPagar, pagado: item.totalPagado, estado: item.estado, fecha: item.fechaCalculo })), [items]);
    const columns: ColumnDef[] = [
        { key: "persona", header: "Colaborador", render: (value, row) => <div><p className="font-medium text-primary">{String(value)}</p><p className="mt-0.5 text-xs text-tertiary">{String(row.documento)} · cálculo #{String(row.calculo)}</p></div> },
        { key: "sueldo", header: "Sueldo", render: (value) => money.format(Number(value)) },
        { key: "variables", header: "Bonos y comisiones", render: (value) => <span className="text-success-primary">{money.format(Number(value))}</span> },
        { key: "descuentos", header: "Descuentos", render: (value) => <span className="text-error-primary">{money.format(Number(value))}</span> },
        { key: "total", header: "Total", render: (value) => <span className="font-semibold text-primary">{money.format(Number(value))}</span> },
        { key: "pagado", header: "Pagado", render: (value, row) => <span className={Number(value) >= Number(row.total) ? "font-semibold text-success-primary" : "text-secondary"}>{money.format(Number(value))}</span> },
        { key: "estado", header: "Estado", render: (value) => <Badge size="sm" color={statusColor(String(value))}>{humanize(String(value))}</Badge> },
        { key: "fecha", header: "Calculado", render: (value) => value ? dateTime.format(new Date(String(value))) : "—" },
    ];
    const metrics = [
        { label: "Liquidaciones", value: selectedPeriod?.totalLiquidaciones ?? items.length, helper: `${selectedPeriod?.liquidacionesPendientes ?? 0} pendiente(s)`, icon: CheckCircle, tone: "text-brand-secondary" },
        { label: "Total a pagar", value: money.format(selectedPeriod?.totalPagar ?? items.reduce((sum, item) => sum + item.totalPagar, 0)), helper: selectedPeriod?.nombre ?? "Sin período", icon: Coins01, tone: "text-success-primary" },
        { label: "Total pagado", value: money.format(selectedPeriod?.totalPagado ?? items.reduce((sum, item) => sum + item.totalPagado, 0)), helper: "Pagos registrados", icon: CheckCircle, tone: "text-success-primary" },
        { label: "Bloqueos previos", value: (selectedPeriod?.solicitudesAsistenciaPendientes ?? 0) + (selectedPeriod?.eventosPendientes ?? 0), helper: `${selectedPeriod?.solicitudesAsistenciaPendientes ?? 0} asistencia · ${selectedPeriod?.eventosPendientes ?? 0} eventos`, icon: AlertCircle, tone: "text-warning-primary" },
    ];

    return <AppLayout><div className="flex flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><p className="text-sm font-medium text-brand-secondary">Compensaciones</p><h1 className="mt-1 text-display-xs font-semibold text-primary">Liquidaciones</h1><p className="mt-1 text-sm text-tertiary">Calcula, revisa, aprueba y registra los pagos mensuales del personal.</p></div><div className="flex flex-wrap items-end gap-2"><div className="w-44"><Input label="Mes a abrir" size="sm" type="month" value={openMonth} onChange={setOpenMonth} /></div><Button size="sm" color="secondary" isLoading={isOpening} onClick={() => void openPeriod()}>Abrir período</Button><Button size="sm" color="primary" iconLeading={RefreshCw01} isDisabled={!periodId} isLoading={isCalculating} onClick={() => void calculateBatch()}>Calcular período</Button></div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric, index) => { const Icon = metric.icon; return <motion.article key={metric.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.035 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"><div className="flex items-start justify-between"><p className="text-xs font-medium text-tertiary">{metric.label}</p><Icon className={`size-5 ${metric.tone}`} /></div><p className={`mt-3 text-display-xs font-semibold tabular-nums ${metric.tone}`}>{metric.value}</p><p className="mt-1 text-xs text-tertiary">{metric.helper}</p></motion.article>; })}</div>
        <section className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"><div className="flex flex-wrap items-end gap-3"><div className="w-60"><Select label="Período" size="sm" items={periods.map((period) => ({ id: period.id, label: `${period.nombre} · ${humanize(period.estado)}` }))} selectedKey={periodId} onSelectionChange={(key) => { setPeriodId(key ? Number(key) : 0); setPage(1); }}>{(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}</Select></div><div className="w-56"><Input label="Buscar" size="sm" placeholder="Nombre o DNI" value={search} onChange={setSearch} /></div><div className="w-48"><Select label="Estado" size="sm" items={[{ id: "", label: "Todos" }, ...["CALCULADA", "OBSERVADA", "APROBADA", "PAGO_PARCIAL", "PAGADA", "ANULADA", "REEMPLAZADA"].map((value) => ({ id: value, label: humanize(value) }))]} selectedKey={status} onSelectionChange={(key) => setStatus(key !== null ? String(key) : "")}>{(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}</Select></div><Button size="sm" color="primary" onClick={() => { setPage(1); setFilters({ search, status }); }}>Consultar</Button></div></section>
        {!periodId && !isLoading && <div className="rounded-xl border border-warning bg-warning-secondary p-4"><p className="text-sm font-semibold text-warning-primary">No existe un período de compensaciones</p><p className="mt-1 text-sm text-tertiary">Selecciona un mes y usa “Abrir período” para comenzar la liquidación.</p></div>}
        <DataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} emptyMessage="No hay liquidaciones calculadas" emptyDescription="Calcula el período o modifica los filtros." renderActions={(row) => { const item = items.find((entry) => entry.id === Number(row.id)); return item ? <Button size="xs" color="tertiary" iconLeading={Eye} onClick={() => setSelected(item)}>Detalle</Button> : null; }} />
        <LiquidacionDetailModal item={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); setRefreshKey((value) => value + 1); }} />
    </div></AppLayout>;
};
