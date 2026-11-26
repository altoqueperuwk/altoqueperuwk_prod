import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { parseDate as parseCalendarDate, type DateValue } from "@internationalized/date";
import { BarChart03, ChevronDown, ChevronUp, Trash01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { BasicDatePicker } from "@/components/application/date-picker/basic-date-picker";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Tooltip as UiTooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { useAuth } from "@/providers/auth-provider";
import { cx } from "@/utils/cx";
import { MetricasServiceNavigation } from "../metricas-service-navigation";
import type { MetricasServicioDesglose, MetricasServicioOperativo } from "./metricas-servicio.types";
import { useMetricasServicio } from "./use-metricas-servicio";
import { formatMetricasDateRange } from "../metricas-date-range";

type AnalyticsService = Extract<MetricasServicioOperativo, "pos" | "linkpago">;
type Period = "today" | "yesterday" | "week" | "month";
type Direction = "asc" | "desc";
type SortState<T extends string> = { column: T; direction: Direction };

interface DetailRow {
    key: string;
    label: string;
    operaciones: number;
    pagadas: number;
    pendientes: number;
    montoProcesado: number;
    salidas: number;
    ganancias: number;
    clientesNuevos: number;
    tasaExito: number;
}

const periodOptions: Array<{ label: string; value: Period }> = [
    { label: "Hoy", value: "today" },
    { label: "Ayer", value: "yesterday" },
    { label: "Semana", value: "week" },
    { label: "Mes", value: "month" },
];

const branchOptions = [
    { id: 1, name: "Sede Lince" },
    { id: 2, name: "Sede Norte" },
    { id: 3, name: "Sede Sur" },
    { id: 4, name: "Sede Miraflores" },
];

const moneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat("es-PE");
const formatMoney = (value: number) => moneyFormatter.format(value).replace("PEN", "S/");
const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const getLimaToday = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
};

const getDateRange = (period: Period) => {
    const today = getLimaToday();
    const current = parseDate(today);
    if (period === "today") return { fechaDesde: today, fechaHasta: today };
    if (period === "yesterday") {
        current.setUTCDate(current.getUTCDate() - 1);
        const date = toIsoDate(current);
        return { fechaDesde: date, fechaHasta: date };
    }
    if (period === "week") {
        current.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
        return { fechaDesde: toIsoDate(current), fechaHasta: today };
    }
    return { fechaDesde: toIsoDate(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1))), fechaHasta: today };
};

const sortRows = <T, K extends keyof T>(rows: T[], sort: SortState<K & string>) => rows.toSorted((a, b) => {
    const left = a[sort.column];
    const right = b[sort.column];
    const comparison = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left ?? "").localeCompare(String(right ?? ""), "es", { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
});

const toggleSort = <T extends string>(setter: Dispatch<SetStateAction<SortState<T>>>, column: T) => setter((current) => ({
    column,
    direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
}));

const TabGroup = ({ label, children }: { label: string; children: ReactNode }) => (
    <nav aria-label={label} role="tablist" className="flex min-h-11 w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-secondary bg-primary p-1">{children}</nav>
);

const Tab = ({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) => (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cx(
        "h-9 shrink-0 rounded-md px-3 text-sm font-semibold whitespace-nowrap transition duration-200",
        active ? "bg-brand-solid text-primary_on-brand shadow-xs" : "text-secondary hover:bg-primary_hover hover:text-primary",
    )}>{children}</button>
);

const Panel = ({ title, context, period, children }: { title: string; context: string[]; period?: string; children: ReactNode }) => (
    <motion.section layout transition={{ duration: 0.2 }} className="atk-card rounded-xl border border-secondary bg-primary">
        <div className="atk-strip flex-wrap px-5">
            <h2 className="atk-strip-title">{title}</h2>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {context.map((item) => <Badge key={item} size="sm" color="gray">{item}</Badge>)}
                {period && <Badge size="sm" color="blue">{period}</Badge>}
            </div>
        </div>
        <div className="p-5">{children}</div>
    </motion.section>
);

const MetricCard = ({ label, value, tone = "default", index, onClick }: {
    label: string;
    value: string;
    tone?: "default" | "success" | "warning" | "error";
    index: number;
    onClick?: () => void;
}) => (
    <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: index * 0.025 }}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(event) => { if (onClick && (event.key === "Enter" || event.key === " ")) onClick(); }}
        className={cx("atk-card atk-kpi min-w-0 rounded-lg border border-secondary bg-primary pb-3", onClick && "cursor-pointer transition duration-200 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand")}
    >
        <div className="atk-strip atk-strip-sm">
            <p className="atk-strip-title">{label}</p>
        </div>
        <div className="px-3">
        <p className={cx(
            "mt-2 break-words text-lg font-semibold tabular-nums",
            tone === "success" && "text-success-primary",
            tone === "warning" && "text-warning-primary",
            tone === "error" && "text-error-primary",
            tone === "default" && "text-primary",
        )}>{value}</p>
        </div>
    </motion.article>
);

const SortableHeader = <T extends string>({ label, column, sort, align = "left", onSort }: {
    label: string;
    column: T;
    sort: SortState<T>;
    align?: "left" | "right";
    onSort: (column: T) => void;
}) => {
    const active = sort.column === column;
    const Icon = sort.direction === "asc" ? ChevronUp : ChevronDown;
    return <th className={cx("px-4 py-3 font-semibold", align === "right" && "text-right")} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => onSort(column)} className={cx("inline-flex w-full items-center gap-1.5 hover:text-primary", align === "right" && "justify-end")}>
            {label}<Icon className={cx("size-3.5", !active && "opacity-30")} />
        </button>
    </th>;
};

const TableShell = ({ children, empty }: { children: ReactNode; empty: boolean }) => (
    <div className="overflow-x-auto rounded-lg border border-secondary">
        {children}
        {empty && <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>}
    </div>
);

const DistributionTable = ({ title, dimension, rows, context, period, isLoading }: {
    title: string;
    dimension: string;
    rows: DetailRow[];
    context: string[];
    period: string;
    isLoading: boolean;
}) => {
    const [sort, setSort] = useState<SortState<keyof DetailRow & string>>({ column: "montoProcesado", direction: "desc" });
    const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
    return <Panel title={title} context={context} period={period}>
        <TableShell empty={!isLoading && !sorted.length}>
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                <thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                    {([[dimension, "label", "left"], ["Operaciones", "operaciones", "right"], ["Pagadas", "pagadas", "right"], ["Pendientes", "pendientes", "right"], ["Monto Depositado", "montoProcesado", "right"], ["Monto Transferido", "salidas", "right"], ["Ganancia", "ganancias", "right"], ["Clientes Nuevos", "clientesNuevos", "right"], ["Tasa Éxito", "tasaExito", "right"]] as const).map(([label, column, align]) => (
                        <SortableHeader key={column} label={label} column={column} sort={sort} align={align} onSort={(value) => toggleSort(setSort, value)} />
                    ))}
                </tr></thead>
                <tbody className="divide-y divide-secondary">{sorted.map((row) => <tr key={row.key} className="bg-primary hover:bg-primary_hover">
                    <td className="px-4 py-3 font-semibold text-primary">{row.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.pagadas)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.pendientes)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.montoProcesado)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salidas)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.clientesNuevos)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{row.tasaExito.toFixed(2)}%</td>
                </tr>)}</tbody>
            </table>
        </TableShell>
    </Panel>;
};

export const MetricasOperacionesPage = ({ servicio }: { servicio: AnalyticsService }) => {
    const { businessUser } = useAuth();
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const [period, setPeriod] = useState<Period>("week");
    const [dateRange, setDateRange] = useState(() => getDateRange("week"));
    const periodLabel = formatMetricasDateRange(dateRange.fechaDesde, dateRange.fechaHasta);
    const [branchId, setBranchId] = useState<number | null>(null);
    const [entityId, setEntityId] = useState<number | null>(null);
    const [posId, setPosId] = useState<number | null>(null);
    const [pendingSort, setPendingSort] = useState<SortState<keyof MetricasServicioDesglose & string>>({ column: "pendientes", direction: "desc" });
    const pendingTableRef = useRef<HTMLDivElement>(null);

    const consulta = useMemo(() => userId ? ({
        servicio,
        ...dateRange,
        idUsuarioConsulta: userId,
        idSucursal: branchId,
        idEstado: null,
        idBancoCliente: entityId,
        idBancoDestino: null,
        idPos: servicio === "pos" ? posId : null,
    }) : null, [branchId, dateRange, entityId, posId, servicio, userId]);
    const { data, isLoading, error, refresh } = useMetricasServicio(consulta);

    const entityOptions = useMemo(() => (data?.filterOptions.entidades ?? []).map((row) => ({ id: row.id, name: row.nombre })), [data?.filterOptions.entidades]);
    const posOptions = useMemo(() => (data?.filterOptions.pos ?? []).map((row) => ({ id: row.id, name: row.nombre })), [data?.filterOptions.pos]);

    const activeBranch = branchId === null ? "Todas las sedes" : branchOptions.find((item) => item.id === branchId)?.name ?? "Sede";
    const activeEntity = entityId === null ? "Todas las entidades" : entityOptions.find((item) => item.id === entityId)?.name ?? "Entidad";
    const activePos = posId === null ? "Todos los POS" : posOptions.find((item) => item.id === posId)?.name ?? "POS";
    const context = [activeBranch, activeEntity, ...(servicio === "pos" ? [activePos] : []), servicio === "pos" ? "POS" : "Link Pago"];

    const branchRows = useMemo<DetailRow[]>(() => (data?.sedes ?? []).map((row) => ({
        key: String(row.idSucursal ?? row.sede), label: row.sede, operaciones: row.operaciones, pagadas: row.pagadas,
        pendientes: Math.max(row.operaciones - row.pagadas, 0), montoProcesado: row.montoProcesado, salidas: row.salidas,
        ganancias: row.ganancias, clientesNuevos: row.clientesNuevos, tasaExito: row.tasaExito,
    })), [data?.sedes]);
    const distributionRows = (dimension: string) => (data?.distribution ?? [])
        .filter((row) => row.dimension === dimension && row.periodo === null)
        .map<DetailRow>((row) => ({
            key: `${dimension}-${row.clave}`, label: row.nombre, operaciones: row.operaciones, pagadas: row.pagadas,
            pendientes: row.pendientes, montoProcesado: row.montoProcesado, salidas: row.salidas,
            ganancias: row.ganancias, clientesNuevos: row.clientesNuevos, tasaExito: row.tasaExito,
        }));
    const entityRows = useMemo(() => distributionRows("entidad-tarjeta"), [data?.distribution]);
    const posRows = useMemo(() => distributionRows("pos"), [data?.distribution]);
    const destinationRows = useMemo(() => distributionRows("banco-destino"), [data?.distribution]);
    const pendingRows = useMemo(() => sortRows((data?.breakdown ?? []).filter((row) => row.pendientes > 0), pendingSort), [data?.breakdown, pendingSort]);

    const values = data?.summary.actual;
    const kpis = values ? [
        { label: "Operaciones", value: integerFormatter.format(values.operaciones) },
        { label: "Pagadas", value: integerFormatter.format(values.pagadas), tone: "success" as const },
        { label: "Operaciones Pendientes", value: integerFormatter.format(values.pendientes), tone: "warning" as const, onClick: () => pendingTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Monto Depositado", value: formatMoney(values.montoProcesado), tone: "success" as const },
        { label: "Monto Transferido", value: formatMoney(values.salidas), tone: "error" as const },
        { label: "Comisión", value: formatMoney(values.comisiones), tone: "success" as const },
        { label: "Gastos Bancarios", value: formatMoney(values.gastos), tone: "error" as const },
        { label: "Ganancia", value: formatMoney(values.ganancias), tone: "success" as const },
        { label: "Clientes Nuevos", value: integerFormatter.format(values.clientesNuevos) },
        { label: "Tasa de Éxito", value: `${values.tasaExito.toFixed(2)}%` },
    ] : [];

    const handlePeriod = (value: Period) => { setPeriod(value); setDateRange(getDateRange(value)); };
    const handleDate = (field: "fechaDesde" | "fechaHasta", value: DateValue) => {
        setPeriod("yesterday");
        setDateRange((current) => {
            const selected = value.toString();
            let fechaDesde = field === "fechaDesde" ? selected : current.fechaDesde;
            let fechaHasta = field === "fechaHasta" ? selected : current.fechaHasta;
            if (fechaDesde > fechaHasta) field === "fechaDesde" ? fechaHasta = fechaDesde : fechaDesde = fechaHasta;
            return { fechaDesde, fechaHasta };
        });
    };
    const reset = () => {
        setPeriod("week");
        setDateRange(getDateRange("week"));
        setBranchId(null);
        setEntityId(null);
        setPosId(null);
    };

    return <AppLayout>
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
            <h1 className="text-display-xs font-semibold text-primary">Métricas Bancarias</h1>

            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                <div className="mb-4 flex items-center gap-2"><BarChart03 className="size-5 text-fg-brand-primary" /><p className="text-sm font-semibold text-primary">Filtros</p></div>
                <div className="flex w-full flex-wrap items-center gap-2">
                    <MetricasServiceNavigation active={servicio} />
                    <TabGroup label="Sucursales">
                        <Tab active={branchId === null} onClick={() => { setBranchId(null); setEntityId(null); setPosId(null); }}>Todas</Tab>
                        {branchOptions.map((branch) => <Tab key={branch.id} active={branch.id === branchId} onClick={() => { setBranchId(branch.id); setEntityId(null); setPosId(null); }}>{branch.name}</Tab>)}
                    </TabGroup>
                    <TabGroup label="Entidades">
                        <Tab active={entityId === null} onClick={() => { setEntityId(null); setPosId(null); }}>Todas</Tab>
                        {entityOptions.map((entity) => <Tab key={entity.id} active={entity.id === entityId} onClick={() => { setEntityId(entity.id); setPosId(null); }}>{entity.name}</Tab>)}
                    </TabGroup>
                    {servicio === "pos" && <TabGroup label="POS">
                        <Tab active={posId === null} onClick={() => setPosId(null)}>Todos</Tab>
                        {posOptions.map((pos) => <Tab key={pos.id} active={pos.id === posId} onClick={() => setPosId(pos.id)}>{pos.name}</Tab>)}
                    </TabGroup>}
                    <TabGroup label="Periodos">
                        {periodOptions.map((item) => <Tab key={item.value} active={period === item.value} onClick={() => handlePeriod(item.value)}>{item.label}</Tab>)}
                    </TabGroup>
                    <BasicDatePicker aria-label="Desde" value={parseCalendarDate(dateRange.fechaDesde)} maxValue={parseCalendarDate(getLimaToday())} onChange={(value) => value && handleDate("fechaDesde", value)} size="md" showYear={false} buttonClassName="h-11 w-fit justify-start" />
                    <BasicDatePicker aria-label="Hasta" value={parseCalendarDate(dateRange.fechaHasta)} maxValue={parseCalendarDate(getLimaToday())} onChange={(value) => value && handleDate("fechaHasta", value)} size="md" showYear={false} buttonClassName="h-11 w-fit justify-start" />
                    <UiTooltip title="Limpiar filtros" placement="top"><TooltipTrigger aria-label="Limpiar filtros" onPress={reset} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-secondary bg-primary text-fg-quaternary shadow-xs transition duration-200 hover:bg-primary_hover hover:text-fg-quaternary_hover"><Trash01 className="size-5" /></TooltipTrigger></UiTooltip>
                </div>
            </motion.section>

            {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error_subtle bg-error-primary p-4"><p className="text-sm font-semibold text-error-primary">{error}</p><Button size="sm" color="secondary" onClick={refresh}>Reintentar</Button></div>}

            <section>{isLoading && !data ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-secondary" />)}</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{kpis.map((item, index) => <MetricCard key={item.label} {...item} index={index} />)}</div>}</section>

            <DistributionTable title="Distribución por Sucursal" dimension="Sucursal" rows={branchRows} context={context} period={periodLabel} isLoading={isLoading} />
            <DistributionTable title="Distribución por Entidad" dimension="Entidad" rows={entityRows} context={context} period={periodLabel} isLoading={isLoading} />
            {servicio === "pos" && <DistributionTable title="Distribución por POS" dimension="POS" rows={posRows} context={context} period={periodLabel} isLoading={isLoading} />}
            {servicio === "pos" && <DistributionTable title="Distribución por Banco de Transferencia" dimension="Banco" rows={destinationRows} context={context} period={periodLabel} isLoading={isLoading} />}

            <div ref={pendingTableRef} className="scroll-mt-6">
                <Panel title="Operaciones Pendientes" context={context} period={periodLabel}>
                    <TableShell empty={!isLoading && !pendingRows.length}>
                        <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                                <SortableHeader label="Sucursal" column="sede" sort={pendingSort} onSort={(value) => toggleSort(setPendingSort, value)} />
                                <SortableHeader label="Entidad" column="entidadTarjeta" sort={pendingSort} onSort={(value) => toggleSort(setPendingSort, value)} />
                                {servicio === "pos" && <SortableHeader label="Banco Transferencia" column="bancoDestino" sort={pendingSort} onSort={(value) => toggleSort(setPendingSort, value)} />}
                                {servicio === "pos" && <SortableHeader label="POS" column="pos" sort={pendingSort} onSort={(value) => toggleSort(setPendingSort, value)} />}
                                <SortableHeader label="Operaciones" column="operaciones" sort={pendingSort} align="right" onSort={(value) => toggleSort(setPendingSort, value)} />
                                <SortableHeader label="Pagadas" column="pagadas" sort={pendingSort} align="right" onSort={(value) => toggleSort(setPendingSort, value)} />
                                <SortableHeader label="Pendientes" column="pendientes" sort={pendingSort} align="right" onSort={(value) => toggleSort(setPendingSort, value)} />
                                <SortableHeader label="Monto Depositado" column="montoProcesado" sort={pendingSort} align="right" onSort={(value) => toggleSort(setPendingSort, value)} />
                                <SortableHeader label="Monto Transferido" column="salidas" sort={pendingSort} align="right" onSort={(value) => toggleSort(setPendingSort, value)} />
                                <SortableHeader label="Ganancia" column="ganancias" sort={pendingSort} align="right" onSort={(value) => toggleSort(setPendingSort, value)} />
                            </tr></thead>
                            <tbody className="divide-y divide-secondary">{pendingRows.map((row, index) => <tr key={`${row.idSucursal}-${row.idBancoCliente}-${row.idBancoDestino}-${row.idPos}-${index}`} className="bg-primary hover:bg-primary_hover">
                                <td className="px-4 py-3 font-semibold text-primary">{row.sede}</td><td className="px-4 py-3 text-secondary">{row.entidadTarjeta}</td>
                                {servicio === "pos" && <td className="px-4 py-3 text-secondary">{row.bancoDestino}</td>}
                                {servicio === "pos" && <td className="px-4 py-3 text-secondary">{row.pos}</td>}
                                <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.pagadas)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.pendientes)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.montoProcesado)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salidas)}</td>
                                <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td>
                            </tr>)}</tbody>
                        </table>
                    </TableShell>
                </Panel>
            </div>
        </div>
    </AppLayout>;
};
