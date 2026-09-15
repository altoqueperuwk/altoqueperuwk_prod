import { useMemo, useState, type ReactNode } from "react";
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
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";
import { useMetricasBancarias, useMetricasBancariasCatalogo } from "./use-metricas-bancarias";
import type { MetricasConsulta, MetricasPeriodo, MetricasServicio } from "./metricas-bancarias.types";

const routeOptions = [
    { label: "Todos los bancos", value: "all" },
    { label: "BCP", value: "bcp" },
    { label: "BBVA", value: "bbva" },
    { label: "Scotiabank", value: "scotiabank" },
    { label: "BanBif", value: "banbif" },
    { label: "Interbank", value: "interbank" },
    { label: "SafetyPay", value: "safetypay" },
];

const periodOptions = [
    { label: "Últimos 6 meses", value: "6m" },
    { label: "Últimos 3 meses", value: "3m" },
    { label: "Este mes", value: "month" },
];

const serviceOptions = [
    { label: "Todos los Servicios", value: "all" },
    { label: "Efectivización", value: "efectivizacion" },
    { label: "Pago Deuda", value: "pago-deuda" },
    { label: "Movimientos", value: "movimientos" },
    { label: "Directo", value: "directo" },
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
const periodLabelFormatter = new Intl.DateTimeFormat("es-PE", { month: "short", timeZone: "UTC", year: "2-digit" });

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
    const months = period === "6m" ? 6 : period === "3m" ? 3 : 1;
    const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - months + 1, 1));
    return { fechaDesde: toIsoDate(start), fechaHasta: today, granularidad: period === "month" ? "DIA" as const : "MES" as const };
};

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
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-secondary" />)}
    </div>
);

export const MetricasBancariasPage = () => {
    const [period, setPeriod] = useState<MetricasPeriodo>("6m");
    const [route, setRoute] = useState("all");
    const [company, setCompany] = useState("all");
    const [account, setAccount] = useState("all");
    const [service, setService] = useState<MetricasServicio>("all");
    const { cuentas, error: catalogError } = useMetricasBancariasCatalogo();

    const dateRange = useMemo(() => getDateRange(period), [period]);
    const consulta = useMemo<MetricasConsulta>(() => ({
        ...dateRange,
        ruta: route === "all" ? null : route,
        idEmpresa: company === "all" ? null : Number(company),
        idCuenta: account === "all" ? null : Number(account),
        servicio: service,
    }), [account, company, dateRange, route, service]);
    const { summary, series, breakdown, distribution, isLoading, error, refresh } = useMetricasBancarias(consulta);

    const companyOptions = useMemo(() => {
        const filtered = cuentas.filter((item) => route === "all" || item.ruta === route);
        const unique = new Map(filtered.map((item) => [item.idEmpresa, item.empresa]));
        return [{ label: "Todas las empresas", value: "all" }, ...Array.from(unique, ([value, label]) => ({ label, value: String(value) })).sort((a, b) => a.label.localeCompare(b.label))];
    }, [cuentas, route]);

    const accountOptions = useMemo(() => {
        const filtered = cuentas
            .filter((item) => route === "all" || item.ruta === route)
            .filter((item) => company === "all" || item.idEmpresa === Number(company));
        const unique = new Map(filtered.map((item) => [item.idCuenta, item.cuenta]));
        return [{ label: "Todas las cuentas", value: "all" }, ...Array.from(unique, ([value, label]) => ({ label, value: String(value) })).sort((a, b) => a.label.localeCompare(b.label))];
    }, [company, cuentas, route]);

    const timeline = useMemo(() => {
        const values = new Map<string, { period: string; recaudacion: number; salidas: number; ganancias: number; gastos: number }>();
        for (const row of series) {
            const current = values.get(row.periodo) ?? { period: row.periodo, recaudacion: 0, salidas: 0, ganancias: 0, gastos: 0 };
            current.recaudacion += row.cajaRecaudacion;
            current.salidas += row.salidas;
            current.ganancias += row.ganancias;
            current.gastos += row.gastosOperacionales;
            values.set(row.periodo, current);
        }
        return Array.from(values.values()).sort((a, b) => a.period.localeCompare(b.period)).map((row) => ({
            ...row,
            label: dateRange.granularidad === "DIA"
                ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }).format(parseDate(row.period))
                : periodLabelFormatter.format(parseDate(row.period)),
        }));
    }, [dateRange.granularidad, series]);

    const periodDescription = `${dateFormatter.format(parseDate(dateRange.fechaDesde))} al ${dateFormatter.format(parseDate(dateRange.fechaHasta))}`;
    const values = summary?.actual;
    const variation = summary?.variacion;
    const kpis = values ? [
        { label: "Caja Recaudación", value: formatMoney(values.cajaRecaudacion), change: variation?.cajaRecaudacion, supportingText: "vs. periodo anterior", tone: "success" as const },
        { label: "Salidas", value: formatMoney(values.salidas), change: variation?.salidas, supportingText: "transferencias y movimientos", tone: "error" as const, invertChange: true },
        { label: "Ganancias", value: formatMoney(values.ganancias), change: variation?.ganancias, supportingText: "según reglas vigentes", tone: "success" as const },
        { label: "Gastos Operacionales", value: formatMoney(values.gastosOperacionales), change: variation?.gastosOperacionales, supportingText: "vs. periodo anterior", tone: "error" as const, invertChange: true },
        { label: "Operaciones", value: integerFormatter.format(values.operacionesRegistradas), change: variation?.operacionesRegistradas, supportingText: `${integerFormatter.format(values.operacionesPendientes)} pendientes` },
        { label: "Operaciones pagadas", value: integerFormatter.format(values.operacionesPagadas), change: variation?.operacionesPagadas, supportingText: `${values.tasaPago.toFixed(1)}% de tasa de pago`, tone: "success" as const },
        { label: "Ticket promedio", value: formatMoney(values.ticketPromedio), supportingText: "monto medio por operación" },
        { label: "Pendiente Transferencia", value: formatMoney(values.pendienteTransferencia), supportingText: "acumulado del periodo", tone: "warning" as const },
    ] : [];

    const showSafetyPay = (route === "all" || route === "safetypay") && Boolean(summary?.safetypay);
    const resetFilters = () => {
        setPeriod("6m");
        setRoute("all");
        setCompany("all");
        setAccount("all");
        setService("all");
    };
    const handleRouteChange = (value: string) => {
        setRoute(value);
        setCompany("all");
        setAccount("all");
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
                        <p className="mt-1 text-sm text-tertiary">Histórico consolidado de operaciones, caja y rentabilidad por banco.</p>
                    </div>
                    <Button color="secondary" size="sm" iconLeading={Download01} isDisabled>Descargar reporte</Button>
                </div>

                <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                    <div className="mb-4 flex items-center gap-2">
                        <BarChart03 className="size-5 text-fg-brand-primary" />
                        <div>
                            <p className="text-sm font-semibold text-primary">Vista analítica</p>
                            <p className="text-xs text-tertiary">Información consultada directamente del histórico operativo.</p>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_1fr_1.1fr_auto] xl:items-end">
                        <NativeSelect label="Periodo" value={period} onChange={(event) => setPeriod(event.target.value as MetricasPeriodo)} options={periodOptions} />
                        <NativeSelect label="Banco" value={route} onChange={(event) => handleRouteChange(event.target.value)} options={routeOptions} />
                        <NativeSelect label="Empresa" value={company} onChange={(event) => handleCompanyChange(event.target.value)} options={companyOptions} />
                        <NativeSelect label="Cuenta" value={account} onChange={(event) => setAccount(event.target.value)} options={accountOptions} />
                        <NativeSelect label="Servicio" value={service} onChange={(event) => setService(event.target.value as MetricasServicio)} options={serviceOptions} />
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

                {values && !isLoading && (
                    <section className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                            <p className="text-sm font-medium text-tertiary">Saldo Banco</p>
                            <p className="mt-2 text-display-xs font-semibold text-primary">{formatMoney(values.saldoBanco)}</p>
                            <p className="mt-1 text-xs text-tertiary">Saldo asociado a las cuentas seleccionadas</p>
                        </div>
                        <div className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                            <p className="text-sm font-medium text-tertiary">Ingresos de Movimientos</p>
                            <p className="mt-2 text-display-xs font-semibold text-success-primary">{formatMoney(values.ingresosMovimientos)}</p>
                            <p className="mt-1 text-xs text-tertiary">Separados de la recaudación comercial</p>
                        </div>
                        <div className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                            <p className="text-sm font-medium text-tertiary">Margen de ganancia</p>
                            <p className="mt-2 text-display-xs font-semibold text-brand-secondary">{percentageFormatter.format(values.margenGanancia)}%</p>
                            <p className="mt-1 text-xs text-tertiary">Ganancia neta sobre Caja Recaudación</p>
                        </div>
                    </section>
                )}

                <section className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Recaudación frente a salidas" description="Evolución de los flujos financieros seleccionados.">
                        {timeline.length ? (
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timeline} margin={{ left: 0, right: 8, top: 8 }}>
                                        <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={formatCompactMoney} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={70} />
                                        <Tooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} cursor={{ fill: "var(--color-bg-secondary)" }} />
                                        <Legend content={<ChartLegendContent />} />
                                        <Bar dataKey="recaudacion" name="Caja Recaudación" fill="var(--color-utility-green-500)" radius={[5, 5, 0, 0]} />
                                        <Bar dataKey="salidas" name="Salidas" fill="var(--color-utility-orange-500)" radius={[5, 5, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>

                    <Panel title="Ganancias y gastos" description="Comparativo de rentabilidad y costo operacional.">
                        {timeline.length ? (
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={timeline} margin={{ left: 0, right: 14, top: 8 }}>
                                        <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tickFormatter={formatCompactMoney} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} width={70} />
                                        <Tooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} />
                                        <Legend content={<ChartLegendContent />} />
                                        <Line type="monotone" dataKey="ganancias" name="Ganancias" stroke="var(--color-utility-brand-500)" strokeWidth={3} dot={false} />
                                        <Line type="monotone" dataKey="gastos" name="Gastos" stroke="var(--color-utility-red-500)" strokeWidth={3} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                    <Panel title="Distribución por servicio" description="Participación por cantidad de operaciones registradas.">
                        {distribution.length ? (
                            <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
                                <div className="h-72 min-w-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={distribution} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="82%" paddingAngle={3}>
                                                {distribution.map((item) => <Cell key={item.name} fill={item.color} />)}
                                            </Pie>
                                            <Tooltip content={<ChartTooltipContent isPieChart formatter={(value) => integerFormatter.format(Number(value))} />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-3">
                                    {distribution.map((item) => (
                                        <div key={item.name} className="flex items-center justify-between gap-5 text-sm">
                                            <span className="flex items-center gap-2 text-tertiary"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
                                            <span className="font-semibold tabular-nums text-primary">{integerFormatter.format(item.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <EmptyChart />}
                    </Panel>

                    <Panel title="Bancos con mayor recaudación" description="Ranking consolidado para el periodo seleccionado.">
                        {breakdown.length ? (
                            <div className="space-y-4">
                                {breakdown.slice(0, 6).map((row, index) => {
                                    const max = breakdown[0]?.cajaRecaudacion || 1;
                                    const width = Math.max(4, (row.cajaRecaudacion / max) * 100);
                                    return (
                                        <motion.div key={`${row.ruta}-${row.idEmpresa}-${row.idCuenta}`} layout transition={{ duration: 0.2 }}>
                                            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                                <div className="min-w-0"><span className="font-medium capitalize text-primary">{index + 1}. {row.ruta}</span><span className="ml-2 text-tertiary">{row.empresa}</span></div>
                                                <span className="shrink-0 font-semibold tabular-nums text-primary">{formatMoney(row.cajaRecaudacion)}</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-secondary"><motion.div initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.35, delay: index * 0.04 }} className="h-full rounded-full bg-brand-solid" /></div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : <EmptyChart />}
                    </Panel>
                </section>

                {showSafetyPay && (
                    <Panel title="SafetyPay · Empresas derivadas" description={`${integerFormatter.format(summary?.safetypay.totalTransferencia ?? 0)} transferencias pagadas, agrupadas por empresa y cuenta de destino.`}>
                        {summary?.safetypay.empresasDerivadas.length ? (
                            <div className="grid gap-3 lg:grid-cols-3">
                                {summary.safetypay.empresasDerivadas.map((item, index) => (
                                    <motion.div key={`${item.empresa}-${item.cuenta}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: index * 0.04 }} className="rounded-lg border border-secondary bg-secondary p-4">
                                        <p className="truncate text-sm font-semibold text-primary">{item.empresa}</p>
                                        <p className="mt-0.5 text-xs text-tertiary">{item.cuenta} · {integerFormatter.format(item.operaciones)} operaciones</p>
                                        <p className="mt-3 text-lg font-semibold text-success-primary">{formatMoney(item.transferencia)}</p>
                                    </motion.div>
                                ))}
                            </div>
                        ) : <p className="rounded-lg bg-secondary px-4 py-8 text-center text-sm text-tertiary">No hay transferencias derivadas de SafetyPay para este periodo.</p>}
                    </Panel>
                )}

                <Panel title="Detalle consolidado" description="Una fila por banco, empresa y cuenta, según los filtros seleccionados." className="mb-2">
                    <div className="overflow-x-auto rounded-lg border border-secondary">
                        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary"><tr>
                                <th className="px-4 py-3 font-semibold">Banco</th><th className="px-4 py-3 font-semibold">Empresa</th><th className="px-4 py-3 font-semibold">Cuenta</th>
                                <th className="px-4 py-3 text-right font-semibold">Operaciones</th><th className="px-4 py-3 text-right font-semibold">Pagadas</th><th className="px-4 py-3 text-right font-semibold">Recaudación</th>
                                <th className="px-4 py-3 text-right font-semibold">Salidas</th><th className="px-4 py-3 text-right font-semibold">Ganancias</th><th className="px-4 py-3 text-right font-semibold">Pendiente</th><th className="px-4 py-3 text-right font-semibold">Saldo Banco</th>
                            </tr></thead>
                            <tbody className="divide-y divide-secondary">
                                {breakdown.map((row) => (
                                    <motion.tr key={`${row.ruta}-${row.idEmpresa}-${row.idCuenta}`} layout transition={{ duration: 0.2 }} className="bg-primary hover:bg-primary_hover">
                                        <td className="px-4 py-3 font-semibold capitalize text-primary">{row.ruta}</td><td className="px-4 py-3 text-secondary">{row.empresa}</td><td className="px-4 py-3 text-secondary">{row.cuenta}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.pagadas)}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums text-success-primary">{formatMoney(row.cajaRecaudacion)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salidas)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{formatMoney(row.pendienteTransferencia)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{formatMoney(row.saldoBanco)}</td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                        {!breakdown.length && !isLoading && <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>}
                    </div>
                </Panel>
            </div>
        </AppLayout>
    );
};
