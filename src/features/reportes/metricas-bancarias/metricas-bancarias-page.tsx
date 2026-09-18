import { useMemo, useState, type ReactNode } from "react";
import { parseDate as parseCalendarDate, type DateValue } from "@internationalized/date";
import { BarChart03, Download01 } from "@untitledui/icons";
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
import { cx } from "@/utils/cx";
import { useMetricasBancarias, useMetricasBancariasCatalogo } from "./use-metricas-bancarias";
import { MetricasServiceNavigation } from "./metricas-service-navigation";
import type { MetricasConsulta, MetricasPeriodo } from "./metricas-bancarias.types";

const routeOptions = [
    { label: "Todos los bancos", value: "all" },
    { label: "BCP", value: "bcp" },
    { label: "BBVA", value: "bbva" },
    { label: "Scotiabank", value: "scotiabank" },
    { label: "BanBif", value: "banbif" },
    { label: "Interbank", value: "interbank" },
    { label: "SafetyPay", value: "safetypay" },
];

const routeLabels = new Map(routeOptions.map((item) => [item.value, item.label]));
const getRouteLabel = (route: string) => routeLabels.get(route) ?? route;

const periodOptions = [
    { label: "Últimos 7 días", value: "7d" },
    { label: "Este mes", value: "month" },
    { label: "Últimos 2 meses", value: "2m" },
    { label: "Últimos 3 meses", value: "3m" },
    { label: "Últimos 4 meses", value: "4m" },
    { label: "Últimos 5 meses", value: "5m" },
    { label: "Últimos 6 meses", value: "6m" },
];

const bankChartColors = [
    "var(--color-utility-brand-500)",
    "var(--color-utility-blue-500)",
    "var(--color-utility-green-500)",
    "var(--color-utility-orange-500)",
    "var(--color-utility-purple-500)",
    "var(--color-utility-pink-500)",
];

const moneyFormatter = new Intl.NumberFormat("es-PE", {
    currency: "PEN",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
});

const compactMoneyFormatter = new Intl.NumberFormat("es-PE", {
    currency: "PEN",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
});

const integerFormatter = new Intl.NumberFormat("es-PE");
const percentageFormatter = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const formatMoney = (value: number) => moneyFormatter.format(value).replace("PEN", "S/");
const formatCompactMoney = (value: number) => compactMoneyFormatter.format(value).replace("PEN", "S/");
const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const getLimaToday = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Lima",
        year: "numeric",
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
};

const getDateRange = (period: MetricasPeriodo) => {
    const today = getLimaToday();
    const current = parseDate(today);
    if (period === "7d") {
        const start = new Date(current);
        start.setUTCDate(start.getUTCDate() - 6);
        return { fechaDesde: toIsoDate(start), fechaHasta: today, granularidad: "DIA" as const };
    }
    const months = period === "month" ? 1 : Number(period.slice(0, -1));
    const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - months + 1, 1));
    return { fechaDesde: toIsoDate(start), fechaHasta: today, granularidad: "DIA" as const };
};

const isHiddenCompany = (name: string) => ["link pago", "pos"].includes(name.trim().toLocaleLowerCase("es-PE"));

interface MetricCardProps {
    label: string;
    value: string;
    change?: number | null;
    supportingText: string;
    tone?: "default" | "success" | "warning" | "error";
    invertChange?: boolean;
    index: number;
}

const MetricCard = ({ label, value, change, supportingText, tone = "default", invertChange = false, index }: MetricCardProps) => {
    const isPositive = (change ?? 0) >= 0;
    const isFavorable = invertChange ? !isPositive : isPositive;
    return (
        <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.025 }}
            className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-tertiary">{label}</p>
                {change !== null && change !== undefined && (
                    <Badge size="sm" color={isFavorable ? "success" : "error"}>
                        {isPositive ? "+" : ""}{change.toFixed(1)}%
                    </Badge>
                )}
            </div>
            <p className={cx(
                "mt-3 text-display-xs font-semibold tracking-tight",
                tone === "success" && "text-success-primary",
                tone === "warning" && "text-warning-primary",
                tone === "error" && "text-error-primary",
                tone === "default" && "text-primary",
            )}>
                {value}
            </p>
            <p className="mt-1 text-xs text-tertiary">{supportingText}</p>
        </motion.article>
    );
};

interface PanelProps {
    title: string;
    description: string;
    children: ReactNode;
    className?: string;
}

const Panel = ({ title, description, children, className }: PanelProps) => (
    <motion.section layout transition={{ duration: 0.2 }} className={cx("rounded-xl border border-secondary bg-primary p-5 shadow-xs", className)}>
        <div className="mb-5">
            <h2 className="text-md font-semibold text-primary">{title}</h2>
            <p className="mt-1 text-sm text-tertiary">{description}</p>
        </div>
        {children}
    </motion.section>
);

const EmptyChart = () => (
    <div className="flex h-72 items-center justify-center rounded-lg bg-secondary text-sm text-tertiary">
        No hay información para los filtros seleccionados.
    </div>
);

const LoadingState = () => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 9 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-secondary" />)}
    </div>
);

export const MetricasBancariasPage = () => {
    const [period, setPeriod] = useState<MetricasPeriodo>("7d");
    const [dateRange, setDateRange] = useState(() => getDateRange("7d"));
    const [company, setCompany] = useState("all");
    const [account, setAccount] = useState("all");
    const { cuentas, error: catalogError } = useMetricasBancariasCatalogo();

    const consulta = useMemo<MetricasConsulta>(() => ({
        ...dateRange,
        ruta: null,
        idEmpresa: company === "all" ? null : Number(company),
        idCuenta: null,
        idBanco: account === "all" ? null : Number(account),
        servicio: "efectivizacion",
    }), [account, company, dateRange]);
    const { summary, series, breakdown, isLoading, error, refresh } = useMetricasBancarias(consulta);

    const companyOptions = useMemo(() => {
        const filtered = cuentas
            .filter((item) => !isHiddenCompany(item.empresa));
        const unique = new Map(filtered.map((item) => [item.idEmpresa, item.empresa]));
        return [{ label: "Todas las empresas", value: "all" }, ...Array.from(unique, ([value, label]) => ({ label, value: String(value) })).sort((a, b) => a.label.localeCompare(b.label))];
    }, [cuentas]);

    const accountOptions = useMemo(() => {
        const filtered = cuentas
            .filter((item) => company === "all" || item.idEmpresa === Number(company))
            .filter((item) => !isHiddenCompany(item.empresa));
        const unique = new Map(filtered.map((item) => [item.idBanco, item.cuenta]));
        return [{ label: "Todas las cuentas", value: "all" }, ...Array.from(unique, ([value, label]) => ({ label, value: String(value) })).sort((a, b) => a.label.localeCompare(b.label))];
    }, [company, cuentas]);

    const timeline = useMemo(() => {
        const values = new Map<string, { period: string; recaudacion: number; salidas: number; ganancias: number; gastos: number; clientes: number; operaciones: number }>();
        const end = parseDate(dateRange.fechaHasta);
        for (const cursor = parseDate(dateRange.fechaDesde); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
            const day = toIsoDate(cursor);
            values.set(day, { period: day, recaudacion: 0, salidas: 0, ganancias: 0, gastos: 0, clientes: 0, operaciones: 0 });
        }
        for (const row of series) {
            const current = values.get(row.periodo) ?? { period: row.periodo, recaudacion: 0, salidas: 0, ganancias: 0, gastos: 0, clientes: 0, operaciones: 0 };
            current.recaudacion += row.cajaRecaudacion;
            current.salidas += row.salidas;
            current.ganancias += row.ganancias;
            current.gastos += row.gastosOperacionales;
            current.clientes += row.clientesNuevos;
            current.operaciones += row.operacionesRegistradas;
            values.set(row.periodo, current);
        }
        return Array.from(values.values()).sort((a, b) => a.period.localeCompare(b.period)).map((row) => ({
            ...row,
            label: new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }).format(parseDate(row.period)),
        }));
    }, [dateRange.fechaDesde, dateRange.fechaHasta, series]);
    const timelineTickInterval = Math.max(0, Math.ceil(timeline.length / 8) - 1);

    const sortedBreakdown = useMemo(() => breakdown.toSorted((a, b) => {
        const aHasFinancialActivity = a.cajaRecaudacion > 0 || a.salidas > 0 || a.ganancias > 0 || a.pendienteTransferencia > 0;
        const bHasFinancialActivity = b.cajaRecaudacion > 0 || b.salidas > 0 || b.ganancias > 0 || b.pendienteTransferencia > 0;

        return Number(bHasFinancialActivity) - Number(aHasFinancialActivity)
            || b.cajaRecaudacion - a.cajaRecaudacion
            || b.salidas - a.salidas
            || b.ganancias - a.ganancias
            || b.pendienteTransferencia - a.pendienteTransferencia
            || getRouteLabel(a.ruta).localeCompare(getRouteLabel(b.ruta), "es")
            || a.empresa.localeCompare(b.empresa, "es")
            || a.cuenta.localeCompare(b.cuenta, "es");
    }), [breakdown]);

    const visibleBreakdown = useMemo(() => sortedBreakdown
        .filter((row) => !isHiddenCompany(row.empresa))
        .filter((row) => company === "all" || row.idEmpresa === Number(company))
        .filter((row) => account === "all" || row.idBanco === Number(account)),
    [account, company, sortedBreakdown]);

    const bankDistribution = useMemo(() => {
        const totals = new Map<string, { key: string; name: string; value: number }>();
        for (const row of visibleBreakdown) {
            const key = `bank-${row.idBanco}`;
            const name = row.cuenta;
            const current = totals.get(key);
            totals.set(key, { key, name, value: (current?.value ?? 0) + row.cajaRecaudacion });
        }
        return Array.from(totals.values())
            .sort((a, b) => b.value - a.value)
            .slice(0, 6)
            .map((item, index) => ({ ...item, color: bankChartColors[index % bankChartColors.length] }));
    }, [visibleBreakdown]);
    const distributionDimension = company === "all" ? "banco" : "cuenta";

    const periodDescription = `${dateFormatter.format(parseDate(dateRange.fechaDesde))} al ${dateFormatter.format(parseDate(dateRange.fechaHasta))}`;
    const values = summary?.actual;
    const variation = summary?.variacion;
    const kpis = values ? [
        { label: "Caja Recaudación", value: formatMoney(values.cajaRecaudacion), change: variation?.cajaRecaudacion, supportingText: "vs. periodo anterior", tone: "success" as const },
        { label: "Salidas", value: formatMoney(values.salidas), change: variation?.salidas, supportingText: "transferencias de operaciones pagadas", tone: "error" as const, invertChange: true },
        { label: "Ganancias", value: formatMoney(values.ganancias), change: variation?.ganancias, supportingText: "según reglas vigentes", tone: "success" as const },
        { label: "Margen de ganancia", value: `${percentageFormatter.format(values.margenGanancia)}%`, supportingText: "ganancia neta sobre Caja Recaudación", tone: "success" as const },
        { label: "Gastos Operacionales", value: formatMoney(values.gastosOperacionales), change: variation?.gastosOperacionales, supportingText: "vs. periodo anterior", tone: "error" as const, invertChange: true },
        { label: "Operaciones", value: integerFormatter.format(values.operacionesRegistradas), change: variation?.operacionesRegistradas, supportingText: `${integerFormatter.format(values.operacionesPendientes)} pendientes` },
        { label: "Operaciones pagadas", value: integerFormatter.format(values.operacionesPagadas), change: variation?.operacionesPagadas, supportingText: `${values.tasaPago.toFixed(1)}% de tasa de pago`, tone: "success" as const },
        { label: "Clientes nuevos", value: integerFormatter.format(values.clientesNuevos), change: variation?.clientesNuevos, supportingText: "registrados y con operación en el periodo", tone: "success" as const },
        { label: "Ticket promedio", value: formatMoney(values.ticketPromedio), supportingText: "monto medio por operación" },
        { label: "Pendiente Transferencia", value: formatMoney(values.pendienteTransferencia), supportingText: "acumulado del periodo", tone: "warning" as const },
    ] : [];

    const resetFilters = () => {
        setPeriod("7d");
        setDateRange(getDateRange("7d"));
        setCompany("all");
        setAccount("all");
    };
    const handlePeriodChange = (value: MetricasPeriodo) => {
        setPeriod(value);
        setDateRange(getDateRange(value));
    };
    const handleDateChange = (field: "fechaDesde" | "fechaHasta", value: DateValue) => {
        const selectedDate = value.toString();
        setDateRange((current) => {
            let fechaDesde = field === "fechaDesde" ? selectedDate : current.fechaDesde;
            let fechaHasta = field === "fechaHasta" ? selectedDate : current.fechaHasta;

            if (fechaDesde > fechaHasta) {
                if (field === "fechaDesde") fechaHasta = fechaDesde;
                else fechaDesde = fechaHasta;
            }

            return { fechaDesde, fechaHasta, granularidad: "DIA" as const };
        });
    };
    const handleCompanyChange = (value: string) => {
        setCompany(value);
        setAccount("all");
    };
    const currentError = error ?? catalogError;

    return (
        <AppLayout>
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                        <h1 className="text-display-xs font-semibold text-primary">Métricas Bancarias</h1>
                        <p className="mt-1 text-sm text-tertiary">Histórico de recaudación de Efectivización por empresa y cuenta.</p>
                    </div>
                    <Button color="secondary" size="sm" iconLeading={Download01} isDisabled>Descargar reporte</Button>
                </div>

                <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                    <div className="mb-4 flex items-center gap-2">
                        <BarChart03 className="size-5 text-fg-brand-primary" />
                        <div>
                            <p className="text-sm font-semibold text-primary">Vista analítica</p>
                            <p className="text-xs text-tertiary">Solo considera operaciones comerciales de Efectivización.</p>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[auto_180px_160px_160px_minmax(180px,1fr)_minmax(180px,1fr)_auto] 2xl:items-end">
                        <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-4 2xl:col-span-1">
                            <span className="text-sm font-medium text-secondary">Servicio</span>
                            <MetricasServiceNavigation active="efectivizacion" className="pb-0" />
                        </div>
                        <NativeSelect label="Periodo" value={period} onChange={(event) => handlePeriodChange(event.target.value as MetricasPeriodo)} options={periodOptions} />
                        <div className="flex w-full flex-col gap-1.5 2xl:w-40">
                            <span className="text-sm font-medium text-secondary">Desde</span>
                            <BasicDatePicker
                                aria-label="Desde"
                                value={parseCalendarDate(dateRange.fechaDesde)}
                                maxValue={parseCalendarDate(getLimaToday())}
                                onChange={(value) => value && handleDateChange("fechaDesde", value)}
                                size="md"
                                buttonClassName="w-full justify-start"
                            />
                        </div>
                        <div className="flex w-full flex-col gap-1.5 2xl:w-40">
                            <span className="text-sm font-medium text-secondary">Hasta</span>
                            <BasicDatePicker
                                aria-label="Hasta"
                                value={parseCalendarDate(dateRange.fechaHasta)}
                                maxValue={parseCalendarDate(getLimaToday())}
                                onChange={(value) => value && handleDateChange("fechaHasta", value)}
                                size="md"
                                buttonClassName="w-full justify-start"
                            />
                        </div>
                        <NativeSelect label="Empresa" value={company} onChange={(event) => handleCompanyChange(event.target.value)} options={companyOptions} />
                        <NativeSelect label="Cuenta" value={account} onChange={(event) => setAccount(event.target.value)} options={accountOptions} />
                        <Button color="secondary" size="md" onClick={resetFilters}>Limpiar</Button>
                    </div>
                </motion.section>

                {currentError && (
                    <div role="alert" className="flex flex-col items-start justify-between gap-3 rounded-xl border border-error_subtle bg-error-primary p-4 sm:flex-row sm:items-center">
                        <div>
                            <p className="text-sm font-semibold text-error-primary">No se pudieron cargar las métricas.</p>
                            <p className="mt-1 text-xs text-error-primary">{currentError}</p>
                        </div>
                        <Button color="secondary" size="sm" onClick={refresh}>Reintentar</Button>
                    </div>
                )}

                <section>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-semibold text-primary">Resumen del periodo</h2>
                            <p className="text-sm text-tertiary">{periodDescription} · comparación con el periodo anterior equivalente.</p>
                        </div>
                        <Badge color="gray">America/Lima</Badge>
                    </div>
                    {isLoading ? <LoadingState /> : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {kpis.map((item, index) => <MetricCard key={item.label} {...item} index={index} />)}
                        </div>
                    )}
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Recaudación frente a salidas" description="Evolución diaria de los flujos financieros seleccionados.">
                        {series.length ? (
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timeline} margin={{ left: 0, right: 8, top: 8 }}>
                                        <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                                        <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={formatCompactMoney} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={70} />
                                        <Tooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} cursor={{ fill: "var(--color-bg-secondary)" }} />
                                        <Legend content={<ChartLegendContent />} />
                                        <Bar dataKey="recaudacion" name="Caja Recaudación" fill="var(--color-utility-green-500)" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="salidas" name="Salidas" fill="var(--color-utility-orange-500)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>

                    <Panel title="Ganancias y gastos" description="Variación diaria de rentabilidad y costo operacional.">
                        {series.length ? (
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timeline} margin={{ left: 0, right: 8, top: 8 }}>
                                        <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                                        <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={formatCompactMoney} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={70} />
                                        <Tooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} cursor={{ fill: "var(--color-bg-secondary)" }} />
                                        <Legend content={<ChartLegendContent />} />
                                        <Bar dataKey="ganancias" name="Ganancias" fill="var(--color-utility-brand-500)" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="gastos" name="Gastos" fill="var(--color-utility-red-500)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Clientes nuevos" description="Evolución diaria de clientes registrados con operaciones de Efectivización.">
                        {series.length ? (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={timeline} margin={{ left: 0, right: 14, top: 8 }}>
                                        <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                                        <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                                        <YAxis axisLine={false} allowDecimals={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={54} />
                                        <Tooltip content={<ChartTooltipContent formatter={(value) => integerFormatter.format(Number(value))} />} />
                                        <Line type="linear" dataKey="clientes" name="Clientes nuevos" stroke="var(--color-utility-green-500)" strokeWidth={3} dot={timeline.length <= 31 ? { r: 3 } : false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>

                    <Panel title="Cantidad de operaciones" description="Cantidad diaria de operaciones registradas de Efectivización.">
                        {series.length ? (
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={timeline} margin={{ left: 0, right: 14, top: 8 }}>
                                        <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                                        <XAxis dataKey="label" interval={timelineTickInterval} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                                        <YAxis axisLine={false} allowDecimals={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={54} />
                                        <Tooltip content={<ChartTooltipContent formatter={(value) => integerFormatter.format(Number(value))} />} />
                                        <Line type="linear" dataKey="operaciones" name="Operaciones" stroke="var(--color-utility-blue-500)" strokeWidth={3} dot={timeline.length <= 31 ? { r: 3 } : false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                    <Panel
                        title={`Distribución de recaudación por ${distributionDimension}`}
                        description={`Participación de las ${distributionDimension === "banco" ? "entidades bancarias" : "cuentas de la empresa"} en el periodo.`}
                    >
                        {bankDistribution.length ? (
                            <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
                                <div className="h-72 min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={bankDistribution} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="82%" paddingAngle={3}>
                                                {bankDistribution.map((item) => <Cell key={item.key} fill={item.color} />)}
                                            </Pie>
                                            <Tooltip content={<ChartTooltipContent isPieChart formatter={(value) => formatMoney(Number(value))} />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-3">
                                    {bankDistribution.map((item) => (
                                        <div key={item.key} className="flex items-center justify-between gap-5 text-sm">
                                            <span className="flex items-center gap-2 text-tertiary"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                                            <span className="font-semibold tabular-nums text-primary">{formatMoney(item.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>

                    <Panel title={`${distributionDimension === "banco" ? "Bancos" : "Cuentas"} con mayor recaudación`} description="Ranking consolidado para el periodo seleccionado.">
                        {bankDistribution.length ? (
                            <div className="space-y-4">
                                {bankDistribution.map((item, index) => {
                                    const max = bankDistribution[0]?.value || 1;
                                    const width = Math.max(4, (item.value / max) * 100);
                                    return (
                                        <motion.div key={item.key} layout transition={{ duration: 0.2 }}>
                                            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                                <span className="min-w-0 font-medium text-primary">{index + 1}. {item.name}</span>
                                                <span className="shrink-0 font-semibold tabular-nums text-primary">{formatMoney(item.value)}</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${width}%` }}
                                                    transition={{ duration: 0.35, delay: index * 0.04 }}
                                                    className="h-full rounded-full"
                                                    style={{ backgroundColor: item.color }}
                                                />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : <EmptyChart />}
                    </Panel>
                </section>

                {summary && (
                    <Panel title="Empresas receptoras de derivaciones" description={`${integerFormatter.format(summary.derivaciones.totalTransferencia)} derivaciones pagadas · Empresas receptoras que realizan la transferencia, ordenadas por monto.`}>
                        {summary?.derivaciones.empresasDerivadas.length ? (
                            <div className="grid gap-3 lg:grid-cols-3">
                                {summary.derivaciones.empresasDerivadas.map((item, index) => (
                                    <motion.div key={`${item.empresa}-${item.cuenta}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: index * 0.04 }} className="rounded-lg border border-secondary bg-secondary p-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate text-sm font-semibold text-primary">{index + 1}. {item.empresa}</p>
                                            {index === 0 && <Badge size="sm" color="success">Mayor monto transferido</Badge>}
                                        </div>
                                        <p className="mt-0.5 text-xs text-tertiary">{item.cuenta} · {integerFormatter.format(item.operaciones)} operaciones</p>
                                        <p className="mt-3 text-lg font-semibold text-success-primary">{formatMoney(item.transferencia)}</p>
                                    </motion.div>
                                ))}
                            </div>
                        ) : <p className="rounded-lg bg-secondary px-4 py-8 text-center text-sm text-tertiary">No hay operaciones derivadas para este periodo.</p>}
                    </Panel>
                )}

                <Panel title="Detalle consolidado" description="Una fila por banco, empresa y cuenta, según los filtros seleccionados." className="mb-2">
                    <div className="overflow-x-auto rounded-lg border border-secondary">
                        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary"><tr>
                                <th className="px-4 py-3 font-semibold">Banco</th><th className="px-4 py-3 font-semibold">Empresa</th><th className="px-4 py-3 font-semibold">Cuenta</th>
                                <th className="px-4 py-3 text-right font-semibold">Operaciones</th><th className="px-4 py-3 text-right font-semibold">Pagadas</th><th className="px-4 py-3 text-right font-semibold">Recaudación</th>
                                <th className="px-4 py-3 text-right font-semibold">Salidas</th><th className="px-4 py-3 text-right font-semibold">Ganancias</th><th className="px-4 py-3 text-right font-semibold">Pendiente</th>
                            </tr></thead>
                            <tbody className="divide-y divide-secondary">
                                {visibleBreakdown.map((row) => (
                                    <motion.tr key={`${row.ruta}-${row.idEmpresa}-${row.idCuenta}`} layout transition={{ duration: 0.2 }} className="bg-primary hover:bg-primary_hover">
                                        <td className="px-4 py-3 font-semibold text-primary">{getRouteLabel(row.ruta)}</td><td className="px-4 py-3 text-secondary">{row.empresa}</td><td className="px-4 py-3 text-secondary">{row.cuenta}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.pagadas)}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums text-success-primary">{formatMoney(row.cajaRecaudacion)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salidas)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{formatMoney(row.pendienteTransferencia)}</td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                        {!visibleBreakdown.length && !isLoading && <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>}
                    </div>
                </Panel>
            </div>
        </AppLayout>
    );
};
