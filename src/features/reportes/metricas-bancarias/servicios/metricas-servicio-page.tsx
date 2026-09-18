import { useMemo, useState, type ReactNode } from "react";
import { parseDate as parseCalendarDate, type DateValue } from "@internationalized/date";
import { BarChart03 } from "@untitledui/icons";
import { motion } from "motion/react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { AppLayout } from "@/components/application/app-layout";
import { ChartLegendContent, ChartTooltipContent } from "@/components/application/charts/charts-base";
import { BasicDatePicker } from "@/components/application/date-picker/basic-date-picker";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { cx } from "@/utils/cx";
import { MetricasServiceNavigation } from "../metricas-service-navigation";
import type { MetricasPeriodo } from "../metricas-bancarias.types";
import type { MetricasServicioOperativo } from "./metricas-servicio.types";
import { useMetricasServicio } from "./use-metricas-servicio";

const periodOptions = [
    { label: "Últimos 7 días", value: "7d" },
    { label: "Este mes", value: "month" },
    { label: "Últimos 2 meses", value: "2m" },
    { label: "Últimos 3 meses", value: "3m" },
    { label: "Últimos 4 meses", value: "4m" },
    { label: "Últimos 5 meses", value: "5m" },
    { label: "Últimos 6 meses", value: "6m" },
];

const serviceMeta: Record<MetricasServicioOperativo, { title: string; description: string; distribution: string }> = {
    "pago-deuda": {
        title: "Pago Deuda",
        description: "Solicitudes, montos, comisiones y cumplimiento del Paso 4 por sede.",
        distribution: "Banco solicitado",
    },
    pos: {
        title: "POS",
        description: "Operaciones asistidas, transferencias y rentabilidad del servicio POS.",
        distribution: "Entidad tarjeta",
    },
    linkpago: {
        title: "Link Pago",
        description: "Operaciones, transferencias y rentabilidad del servicio Link Pago.",
        distribution: "Entidad tarjeta",
    },
};

const chartColors = [
    "var(--color-utility-brand-500)",
    "var(--color-utility-blue-500)",
    "var(--color-utility-green-500)",
    "var(--color-utility-orange-500)",
    "var(--color-utility-purple-500)",
    "var(--color-utility-pink-500)",
];

const moneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactMoneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", notation: "compact", maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat("es-PE");
const dateFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const formatMoney = (value: number) => moneyFormatter.format(value).replace("PEN", "S/");
const formatCompactMoney = (value: number) => compactMoneyFormatter.format(value).replace("PEN", "S/");
const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const getLimaToday = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
};

const getDateRange = (period: MetricasPeriodo) => {
    const today = getLimaToday();
    const current = parseDate(today);
    if (period === "7d") {
        const start = new Date(current);
        start.setUTCDate(start.getUTCDate() - 6);
        return { fechaDesde: toIsoDate(start), fechaHasta: today };
    }
    const months = period === "month" ? 1 : Number(period.slice(0, -1));
    const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - months + 1, 1));
    return { fechaDesde: toIsoDate(start), fechaHasta: today };
};

const option = (label: string, value: number | string | null) => ({ label, value: value == null ? "null" : String(value) });

const uniqueOptions = (items: Array<{ label: string; value: number | string | null }>, allLabel: string) => {
    const values = new Map(items.filter((item) => item.value != null && String(item.value) !== "null").map((item) => [String(item.value), option(item.label, item.value)]));
    return [{ label: allLabel, value: "all" }, ...Array.from(values.values()).sort((a, b) => a.label.localeCompare(b.label, "es"))];
};

const Panel = ({ title, description, children, className }: { title: string; description: string; children: ReactNode; className?: string }) => (
    <motion.section layout transition={{ duration: 0.2 }} className={cx("rounded-xl border border-secondary bg-primary p-5 shadow-xs", className)}>
        <div className="mb-5">
            <h2 className="text-md font-semibold text-primary">{title}</h2>
            <p className="mt-1 text-sm text-tertiary">{description}</p>
        </div>
        {children}
    </motion.section>
);

const MetricCard = ({ label, value, supportingText, tone = "default", index }: { label: string; value: string; supportingText: string; tone?: "default" | "success" | "warning" | "error"; index: number }) => (
    <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.025 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
        <p className="text-sm font-medium text-tertiary">{label}</p>
        <p className={cx(
            "mt-3 text-display-xs font-semibold tracking-tight",
            tone === "success" && "text-success-primary",
            tone === "warning" && "text-warning-primary",
            tone === "error" && "text-error-primary",
            tone === "default" && "text-primary",
        )}>{value}</p>
        <p className="mt-1 text-xs text-tertiary">{supportingText}</p>
    </motion.article>
);

const EmptyChart = () => <div className="flex h-72 items-center justify-center rounded-lg bg-secondary text-sm text-tertiary">No hay información para los filtros seleccionados.</div>;
const LoadingState = () => <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-secondary" />)}</div>;

export const MetricasServicioPage = ({ servicio }: { servicio: MetricasServicioOperativo }) => {
    const { businessUser } = useAuth();
    const [period, setPeriod] = useState<MetricasPeriodo>("7d");
    const [dateRange, setDateRange] = useState(() => getDateRange("7d"));
    const [sucursal, setSucursal] = useState("all");
    const [estado, setEstado] = useState("all");
    const [entidad, setEntidad] = useState("all");
    const [destino, setDestino] = useState("all");
    const [pos, setPos] = useState("all");
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const meta = serviceMeta[servicio];

    const consulta = useMemo(() => userId ? ({
        servicio,
        ...dateRange,
        idUsuarioConsulta: userId,
        idSucursal: sucursal === "all" ? null : Number(sucursal),
        idEstado: estado === "all" ? null : Number(estado),
        idBancoCliente: entidad === "all" ? null : Number(entidad),
        idBancoDestino: destino === "all" ? null : Number(destino),
        idPos: pos === "all" ? null : Number(pos),
    }) : null, [dateRange, destino, entidad, estado, pos, servicio, sucursal, userId]);
    const { data, isLoading, error, refresh } = useMetricasServicio(consulta);

    const timeline = useMemo(() => (data?.series ?? []).map((row) => ({
        ...row,
        label: new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }).format(parseDate(row.periodo)),
        completadas: servicio === "pago-deuda" ? row.paso4 : row.pagadas,
    })), [data?.series, servicio]);
    const timelineTickInterval = Math.max(0, Math.ceil(timeline.length / 8) - 1);

    const sedeOptions = useMemo(() => uniqueOptions((data?.filterOptions.sedes ?? []).map((row) => ({ label: row.sede, value: row.idSucursal })), "Todas las sedes"), [data?.filterOptions.sedes]);
    const estadoOptions = useMemo(() => uniqueOptions((data?.filterOptions.distribution ?? []).filter((row) => row.dimension === "estado").map((row) => ({ label: row.nombre, value: row.clave })), "Todos los estados"), [data?.filterOptions.distribution]);
    const entidadOptions = useMemo(() => uniqueOptions((data?.filterOptions.distribution ?? []).filter((row) => row.dimension === "entidad-tarjeta").map((row) => ({ label: row.nombre, value: row.clave })), servicio === "pago-deuda" ? "Todos los bancos" : "Todas las entidades"), [data?.filterOptions.distribution, servicio]);
    const destinoOptions = useMemo(() => uniqueOptions((data?.filterOptions.distribution ?? []).filter((row) => row.dimension === "banco-destino").map((row) => ({ label: row.nombre, value: row.clave })), "Todos los destinos"), [data?.filterOptions.distribution]);
    const posOptions = useMemo(() => uniqueOptions((data?.filterOptions.distribution ?? []).filter((row) => row.dimension === "pos").map((row) => ({ label: row.nombre, value: row.clave })), "Todos los POS"), [data?.filterOptions.distribution]);

    const distribution = useMemo(() => (data?.distribution ?? [])
        .filter((row) => row.dimension === "entidad-tarjeta")
        .sort((a, b) => b.operaciones - a.operaciones)
        .slice(0, 6)
        .map((row, index) => ({ ...row, color: chartColors[index % chartColors.length] })), [data?.distribution]);
    const breakdown = useMemo(() => (data?.breakdown ?? []).toSorted((a, b) => b.montoProcesado - a.montoProcesado || b.operaciones - a.operaciones), [data?.breakdown]);

    const values = data?.summary.actual;
    const funnel = data?.summary.embudo;
    const kpis = values ? servicio === "pago-deuda" ? [
        { label: "Solicitudes", value: integerFormatter.format(values.operaciones), supportingText: `${integerFormatter.format(values.pendientes)} pendientes` },
        { label: "Solicitudes pagadas", value: integerFormatter.format(values.pagadas), supportingText: "estado Pagado", tone: "success" as const },
        { label: "Monto solicitado", value: formatMoney(values.montoProcesado), supportingText: "registrado por los clientes" },
        { label: "Monto atendido", value: formatMoney(values.montoAtendido), supportingText: "devuelto o asociado al flujo", tone: "success" as const },
        { label: "Comisiones", value: formatMoney(values.comisiones), supportingText: "solo solicitudes pagadas", tone: "success" as const },
        { label: "Paso 4", value: integerFormatter.format(funnel?.paso4 ?? 0), supportingText: "comisiones registradas", tone: "success" as const },
        { label: "Tasa de éxito", value: `${values.tasaExito.toFixed(2)}%`, supportingText: "Paso 4 sobre solicitudes", tone: "success" as const },
        { label: "Clientes nuevos", value: integerFormatter.format(values.clientesNuevos), supportingText: "registrados en el periodo" },
        { label: "Ticket promedio", value: formatMoney(values.ticketPromedio), supportingText: "monto medio solicitado" },
    ] : [
        { label: "Operaciones", value: integerFormatter.format(values.operaciones), supportingText: `${integerFormatter.format(values.pendientes)} pendientes` },
        { label: "Operaciones pagadas", value: integerFormatter.format(values.pagadas), supportingText: `${values.tasaExito.toFixed(2)}% de tasa de pago`, tone: "success" as const },
        { label: "Monto procesado", value: formatMoney(values.montoProcesado), supportingText: "depósitos registrados" },
        { label: "Salidas", value: formatMoney(values.salidas), supportingText: "transferencias pagadas", tone: "error" as const },
        { label: "Comisiones", value: formatMoney(values.comisiones), supportingText: "cobrado al cliente", tone: "success" as const },
        { label: "Gastos bancarios", value: formatMoney(values.gastos), supportingText: "ingreso y salida", tone: "error" as const },
        { label: "Ganancia", value: formatMoney(values.ganancias), supportingText: "comisiones menos gastos", tone: "success" as const },
        { label: "Clientes nuevos", value: integerFormatter.format(values.clientesNuevos), supportingText: "registrados en el periodo" },
        { label: "Ticket promedio", value: formatMoney(values.ticketPromedio), supportingText: "monto medio por operación" },
    ] : [];

    const handlePeriodChange = (value: MetricasPeriodo) => {
        setPeriod(value);
        setDateRange(getDateRange(value));
    };
    const handleDateChange = (field: "fechaDesde" | "fechaHasta", value: DateValue) => {
        const selected = value.toString();
        setDateRange((current) => {
            let fechaDesde = field === "fechaDesde" ? selected : current.fechaDesde;
            let fechaHasta = field === "fechaHasta" ? selected : current.fechaHasta;
            if (fechaDesde > fechaHasta) {
                if (field === "fechaDesde") fechaHasta = fechaDesde;
                else fechaDesde = fechaHasta;
            }
            return { fechaDesde, fechaHasta };
        });
    };
    const resetFilters = () => {
        setPeriod("7d");
        setDateRange(getDateRange("7d"));
        setSucursal("all");
        setEstado("all");
        setEntidad("all");
        setDestino("all");
        setPos("all");
    };

    const periodDescription = `${dateFormatter.format(parseDate(dateRange.fechaDesde))} al ${dateFormatter.format(parseDate(dateRange.fechaHasta))}`;

    return (
        <AppLayout>
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
                <div>
                    <h1 className="text-display-xs font-semibold text-primary">Métricas Bancarias</h1>
                    <p className="mt-1 text-sm text-tertiary">Vista analítica de {meta.title} por periodo y sede.</p>
                </div>

                <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                    <div className="mb-4 flex items-center gap-2">
                        <BarChart03 className="size-5 text-fg-brand-primary" />
                        <div>
                            <p className="text-sm font-semibold text-primary">Vista analítica · {meta.title}</p>
                            <p className="text-xs text-tertiary">{meta.description}</p>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[auto_160px_160px_160px_repeat(3,minmax(145px,1fr))_auto] 2xl:items-end">
                        <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-4 2xl:col-span-1">
                            <span className="text-sm font-medium text-secondary">Servicio</span>
                            <MetricasServiceNavigation active={servicio} className="pb-0" />
                        </div>
                        <NativeSelect label="Periodo" value={period} onChange={(event) => handlePeriodChange(event.target.value as MetricasPeriodo)} options={periodOptions} />
                        <div className="flex w-full flex-col gap-1.5 2xl:w-40">
                            <span className="text-sm font-medium text-secondary">Desde</span>
                            <BasicDatePicker aria-label="Desde" value={parseCalendarDate(dateRange.fechaDesde)} maxValue={parseCalendarDate(getLimaToday())} onChange={(value) => value && handleDateChange("fechaDesde", value)} size="md" buttonClassName="w-full justify-start" />
                        </div>
                        <div className="flex w-full flex-col gap-1.5 2xl:w-40">
                            <span className="text-sm font-medium text-secondary">Hasta</span>
                            <BasicDatePicker aria-label="Hasta" value={parseCalendarDate(dateRange.fechaHasta)} maxValue={parseCalendarDate(getLimaToday())} onChange={(value) => value && handleDateChange("fechaHasta", value)} size="md" buttonClassName="w-full justify-start" />
                        </div>
                        <NativeSelect label="Sede" value={sucursal} onChange={(event) => setSucursal(event.target.value)} options={sedeOptions} />
                        <NativeSelect label="Estado" value={estado} onChange={(event) => setEstado(event.target.value)} options={estadoOptions} />
                        <NativeSelect label={servicio === "pago-deuda" ? "Banco solicitado" : "Entidad tarjeta"} value={entidad} onChange={(event) => setEntidad(event.target.value)} options={entidadOptions} />
                        {servicio === "pos" && <NativeSelect label="Banco transferencia" value={destino} onChange={(event) => setDestino(event.target.value)} options={destinoOptions} />}
                        {servicio === "pos" && <NativeSelect label="POS" value={pos} onChange={(event) => setPos(event.target.value)} options={posOptions} />}
                        <Button color="secondary" size="md" onClick={resetFilters}>Limpiar</Button>
                    </div>
                </motion.section>

                {error && (
                    <div role="alert" className="flex flex-col items-start justify-between gap-3 rounded-xl border border-error_subtle bg-error-primary p-4 sm:flex-row sm:items-center">
                        <div><p className="text-sm font-semibold text-error-primary">No se pudieron cargar las métricas.</p><p className="mt-1 text-xs text-error-primary">{error}</p></div>
                        <Button color="secondary" size="sm" onClick={refresh}>Reintentar</Button>
                    </div>
                )}

                <section>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div><h2 className="text-lg font-semibold text-primary">Resumen del periodo</h2><p className="text-sm text-tertiary">{periodDescription}</p></div>
                        <Badge color="gray">America/Lima</Badge>
                    </div>
                    {isLoading ? <LoadingState /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map((item, index) => <MetricCard key={item.label} {...item} index={index} />)}</div>}
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Evolución de operaciones" description={`Cantidad diaria de ${servicio === "pago-deuda" ? "solicitudes y operaciones con Paso 4" : "operaciones registradas y pagadas"}.`}>
                        {timeline.length ? <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeline} margin={{ top: 8, right: 8 }}>
                            <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                            <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={54} />
                            <Tooltip content={<ChartTooltipContent formatter={(value) => integerFormatter.format(Number(value))} />} cursor={{ fill: "var(--color-bg-secondary)" }} />
                            <Legend content={<ChartLegendContent />} />
                            <Bar dataKey="operaciones" name={servicio === "pago-deuda" ? "Solicitudes" : "Operaciones"} fill="var(--color-utility-blue-500)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="completadas" name={servicio === "pago-deuda" ? "Paso 4" : "Pagadas"} fill="var(--color-utility-green-500)" radius={[4, 4, 0, 0]} />
                        </BarChart></ResponsiveContainer></div> : <EmptyChart />}
                    </Panel>

                    <Panel title={servicio === "pago-deuda" ? "Monto solicitado frente a atendido" : "Monto procesado frente a salidas"} description="Evolución diaria de los importes del servicio.">
                        {timeline.length ? <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeline} margin={{ top: 8, right: 8 }}>
                            <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                            <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tickFormatter={formatCompactMoney} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={70} />
                            <Tooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} cursor={{ fill: "var(--color-bg-secondary)" }} />
                            <Legend content={<ChartLegendContent />} />
                            <Bar dataKey="montoProcesado" name={servicio === "pago-deuda" ? "Monto solicitado" : "Monto procesado"} fill="var(--color-utility-brand-500)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey={servicio === "pago-deuda" ? "montoAtendido" : "salidas"} name={servicio === "pago-deuda" ? "Monto atendido" : "Salidas"} fill="var(--color-utility-orange-500)" radius={[4, 4, 0, 0]} />
                        </BarChart></ResponsiveContainer></div> : <EmptyChart />}
                    </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Rentabilidad diaria" description={servicio === "pago-deuda" ? "Comisiones registradas por fecha de solicitud." : "Comisiones, gastos y ganancia de operaciones pagadas."}>
                        {timeline.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={timeline} margin={{ top: 8, right: 8 }}>
                            <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                            <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tickFormatter={formatCompactMoney} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={70} />
                            <Tooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} cursor={{ fill: "var(--color-bg-secondary)" }} />
                            <Legend content={<ChartLegendContent />} />
                            <Bar dataKey="comisiones" name="Comisiones" fill="var(--color-utility-green-500)" radius={[4, 4, 0, 0]} />
                            {servicio !== "pago-deuda" && <Bar dataKey="gastos" name="Gastos" fill="var(--color-utility-red-500)" radius={[4, 4, 0, 0]} />}
                            {servicio !== "pago-deuda" && <Bar dataKey="ganancias" name="Ganancias" fill="var(--color-utility-brand-500)" radius={[4, 4, 0, 0]} />}
                        </BarChart></ResponsiveContainer></div> : <EmptyChart />}
                    </Panel>

                    <Panel title="Clientes nuevos" description="Clientes únicos registrados en el periodo y vinculados al servicio.">
                        {timeline.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={timeline} margin={{ top: 8, right: 14 }}>
                            <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                            <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={54} />
                            <Tooltip content={<ChartTooltipContent formatter={(value) => integerFormatter.format(Number(value))} />} />
                            <Line type="linear" dataKey="clientesNuevos" name="Clientes nuevos" stroke="var(--color-utility-green-500)" strokeWidth={3} dot={timeline.length <= 31 ? { r: 3 } : false} />
                        </LineChart></ResponsiveContainer></div> : <EmptyChart />}
                    </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Sedes con mayor volumen" description="Ranking por monto procesado en el periodo.">
                        {data?.sedes.length ? <div className="space-y-4">{data.sedes.slice(0, 8).map((row, index) => {
                            const max = data.sedes[0]?.montoProcesado || 1;
                            return <div key={`${row.idSucursal}-${row.sede}`}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-medium text-primary">{index + 1}. {row.sede}</span><span className="font-semibold tabular-nums text-primary">{formatMoney(row.montoProcesado)}</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(4, row.montoProcesado / max * 100)}%` }} transition={{ duration: 0.35, delay: index * 0.04 }} className="h-full rounded-full bg-brand-solid" /></div></div>;
                        })}</div> : <EmptyChart />}
                    </Panel>

                    <Panel title="Sedes con mayor éxito" description={servicio === "pago-deuda" ? "Porcentaje de solicitudes que completaron el Paso 4." : "Porcentaje de operaciones que alcanzaron estado Pagado."}>
                        {data?.sedes.length ? <div className="grid gap-3 sm:grid-cols-2">{data.sedes.toSorted((a, b) => b.tasaExito - a.tasaExito || b.operaciones - a.operaciones).slice(0, 6).map((row, index) => <div key={`${row.idSucursal}-${row.sede}`} className="rounded-lg border border-secondary bg-secondary p-4"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-primary">{index + 1}. {row.sede}</p>{index === 0 && <Badge size="sm" color="success">Mayor éxito</Badge>}</div><p className="mt-3 text-display-xs font-semibold text-success-primary">{row.tasaExito.toFixed(2)}%</p><p className="mt-1 text-xs text-tertiary">{integerFormatter.format(servicio === "pago-deuda" ? row.paso4 : row.pagadas)} de {integerFormatter.format(row.operaciones)} operaciones</p></div>)}</div> : <EmptyChart />}
                    </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                    <Panel title={`Distribución por ${meta.distribution.toLowerCase()}`} description="Participación por cantidad de operaciones registradas.">
                        {distribution.length ? <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribution} dataKey="operaciones" nameKey="nombre" innerRadius="54%" outerRadius="82%" paddingAngle={3}>{distribution.map((item) => <Cell key={item.clave} fill={item.color} />)}</Pie><Tooltip content={<ChartTooltipContent isPieChart formatter={(value) => integerFormatter.format(Number(value))} />} /></PieChart></ResponsiveContainer></div><div className="space-y-3">{distribution.map((item) => <div key={item.clave} className="flex items-center justify-between gap-5 text-sm"><span className="flex items-center gap-2 text-tertiary"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.nombre}</span><span className="font-semibold tabular-nums text-primary">{integerFormatter.format(item.operaciones)}</span></div>)}</div></div> : <EmptyChart />}
                    </Panel>

                    <Panel title={servicio === "pago-deuda" ? "Avance del flujo Pago Deuda" : "Estado de operaciones"} description={servicio === "pago-deuda" ? "Cantidad de solicitudes que alcanzó cada etapa." : "Distribución de la bandeja por estado operativo."}>
                        {servicio === "pago-deuda" && funnel ? <div className="space-y-4">{[
                            { label: "1. Solicitudes", value: funnel.solicitudes },
                            { label: "2. Procesadas", value: funnel.procesadas },
                            { label: "3. Atendidas", value: funnel.atendidas },
                            { label: "4. Comisión registrada", value: funnel.paso4 },
                        ].map((item, index) => <div key={item.label}><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium text-primary">{item.label}</span><span className="font-semibold text-primary">{integerFormatter.format(item.value)}</span></div><div className="h-3 overflow-hidden rounded-full bg-secondary"><motion.div initial={{ width: 0 }} animate={{ width: `${funnel.solicitudes ? Math.max(item.value ? 4 : 0, item.value / funnel.solicitudes * 100) : 0}%` }} transition={{ duration: 0.35, delay: index * 0.05 }} className="h-full rounded-full bg-brand-solid" /></div></div>)}</div> : servicio !== "pago-deuda" ? <div className="grid gap-3 sm:grid-cols-2">{(data?.distribution ?? []).filter((row) => row.dimension === "estado").map((row) => <div key={row.clave} className="rounded-lg border border-secondary bg-secondary p-4"><p className="text-sm font-semibold text-primary">{row.nombre}</p><p className="mt-3 text-display-xs font-semibold text-brand-secondary">{integerFormatter.format(row.operaciones)}</p><p className="text-xs text-tertiary">operaciones</p></div>)}</div> : <EmptyChart />}
                    </Panel>
                </section>

                <Panel title="Detalle consolidado" description="Una fila por sede y dimensiones propias del servicio." className="mb-2">
                    <div className="overflow-x-auto rounded-lg border border-secondary">
                        <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary"><tr>
                                <th className="px-4 py-3 font-semibold">Sede</th>
                                <th className="px-4 py-3 font-semibold">{servicio === "pago-deuda" ? "Banco solicitado" : "Entidad tarjeta"}</th>
                                {servicio === "pos" && <th className="px-4 py-3 font-semibold">Banco transferencia</th>}
                                {servicio === "pos" && <th className="px-4 py-3 font-semibold">POS</th>}
                                <th className="px-4 py-3 text-right font-semibold">Operaciones</th><th className="px-4 py-3 text-right font-semibold">Pagadas</th>
                                {servicio === "pago-deuda" && <th className="px-4 py-3 text-right font-semibold">Paso 4</th>}
                                <th className="px-4 py-3 text-right font-semibold">Monto</th><th className="px-4 py-3 text-right font-semibold">{servicio === "pago-deuda" ? "Atendido" : "Salidas"}</th><th className="px-4 py-3 text-right font-semibold">Comisiones</th>
                                {servicio !== "pago-deuda" && <th className="px-4 py-3 text-right font-semibold">Gastos</th>}
                                {servicio !== "pago-deuda" && <th className="px-4 py-3 text-right font-semibold">Ganancia</th>}
                                <th className="px-4 py-3 text-right font-semibold">Éxito</th>
                            </tr></thead>
                            <tbody className="divide-y divide-secondary">{breakdown.map((row, index) => <motion.tr key={`${row.idSucursal}-${row.idBancoCliente}-${row.idBancoDestino}-${row.idPos}-${row.idEmpresaSalida}-${row.idCuentaSalida}-${index}`} layout transition={{ duration: 0.2 }} className="bg-primary hover:bg-primary_hover">
                                <td className="px-4 py-3 font-semibold text-primary">{row.sede}</td><td className="px-4 py-3 text-secondary">{row.entidadTarjeta}</td>
                                {servicio === "pos" && <td className="px-4 py-3 text-secondary">{row.bancoDestino}</td>}
                                {servicio === "pos" && <td className="px-4 py-3 text-secondary">{row.pos}</td>}
                                <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.pagadas)}</td>
                                {servicio === "pago-deuda" && <td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.paso4)}</td>}
                                <td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{formatMoney(row.montoProcesado)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(servicio === "pago-deuda" ? row.montoAtendido : row.salidas)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.comisiones)}</td>
                                {servicio !== "pago-deuda" && <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.gastos)}</td>}
                                {servicio !== "pago-deuda" && <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td>}
                                <td className="px-4 py-3 text-right font-medium tabular-nums text-success-primary">{row.tasaExito.toFixed(2)}%</td>
                            </motion.tr>)}</tbody>
                        </table>
                        {!breakdown.length && !isLoading && <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>}
                    </div>
                </Panel>
            </div>
        </AppLayout>
    );
};
