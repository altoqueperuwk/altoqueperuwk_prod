import { useMemo, useState } from "react";
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
import {
    accountProfiles,
    demoMetricRows,
    demoMonths,
    familyFactors,
    familyOptions,
    periodOptions,
    routeOptions,
    safetyPayDerivedCompanies,
    type DemoFamily,
} from "./metricas-bancarias-demo-data";

const moneyFormatter = new Intl.NumberFormat("es-PE", {
    currency: "PEN",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency",
});

const compactMoneyFormatter = new Intl.NumberFormat("es-PE", {
    currency: "PEN",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
});

const integerFormatter = new Intl.NumberFormat("es-PE");
const percentageFormatter = new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
});

const formatMoney = (value: number) => moneyFormatter.format(value).replace("PEN", "S/");
const formatCompactMoney = (value: number) => compactMoneyFormatter.format(value).replace("PEN", "S/");

interface MetricCardProps {
    label: string;
    value: string;
    change: number;
    supportingText: string;
    tone?: "default" | "success" | "warning" | "error";
    invertChange?: boolean;
    index: number;
}

const MetricCard = ({ label, value, change, supportingText, tone = "default", invertChange = false, index }: MetricCardProps) => {
    const isPositive = change >= 0;
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
                <Badge size="sm" color={isFavorable ? "success" : "error"}>
                    {isPositive ? "+" : ""}{change.toFixed(1)}%
                </Badge>
            </div>
            <p
                className={cx(
                    "mt-3 text-display-xs font-semibold tracking-tight",
                    tone === "success" && "text-success-primary",
                    tone === "warning" && "text-warning-primary",
                    tone === "error" && "text-error-primary",
                    tone === "default" && "text-primary",
                )}
            >
                {value}
            </p>
            <p className="mt-1 text-xs text-tertiary">{supportingText}</p>
        </motion.article>
    );
};

interface PanelProps {
    title: string;
    description: string;
    children: React.ReactNode;
    className?: string;
}

const Panel = ({ title, description, children, className }: PanelProps) => (
    <motion.section
        layout
        transition={{ duration: 0.2 }}
        className={cx("rounded-xl border border-secondary bg-primary p-5 shadow-xs", className)}
    >
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

export const MetricasBancariasDemoPage = () => {
    const [period, setPeriod] = useState("6m");
    const [route, setRoute] = useState("all");
    const [company, setCompany] = useState("all");
    const [account, setAccount] = useState("all");
    const [family, setFamily] = useState<DemoFamily>("all");

    const companyOptions = useMemo(() => {
        const companies = accountProfiles
            .filter((item) => route === "all" || item.route === route)
            .map((item) => item.company);
        return [
            { label: "Todas las empresas", value: "all" },
            ...Array.from(new Set(companies)).sort().map((item) => ({ label: item, value: item })),
        ];
    }, [route]);

    const accountOptions = useMemo(() => {
        const accounts = accountProfiles
            .filter((item) => route === "all" || item.route === route)
            .filter((item) => company === "all" || item.company === company)
            .map((item) => item.account);
        return [
            { label: "Todas las cuentas", value: "all" },
            ...Array.from(new Set(accounts)).sort().map((item) => ({ label: item, value: item })),
        ];
    }, [company, route]);

    const visibleMonthIndexes = useMemo(() => {
        if (period === "month") return [demoMonths.length - 1];
        if (period === "3m") return [demoMonths.length - 3, demoMonths.length - 2, demoMonths.length - 1];
        return demoMonths.map((_, index) => index);
    }, [period]);

    const filteredRows = useMemo(
        () => demoMetricRows.filter((row) =>
            visibleMonthIndexes.includes(row.monthIndex) &&
            (route === "all" || row.route === route) &&
            (company === "all" || row.company === company) &&
            (account === "all" || row.account === account),
        ),
        [account, company, route, visibleMonthIndexes],
    );

    const factor = familyFactors[family];
    const latestMonthIndex = Math.max(...visibleMonthIndexes);
    const latestRows = filteredRows.filter((row) => row.monthIndex === latestMonthIndex);
    const sum = (selector: (row: (typeof filteredRows)[number]) => number) => filteredRows.reduce((total, row) => total + selector(row), 0);
    const latestSum = (selector: (row: (typeof latestRows)[number]) => number) => latestRows.reduce((total, row) => total + selector(row), 0);

    const summary = useMemo(() => {
        const operations = Math.round(sum((row) => row.operations) * factor.operations);
        const paid = Math.min(operations, Math.round(sum((row) => row.paid) * factor.operations));
        const revenue = sum((row) => row.revenue) * factor.revenue;
        return {
            revenue,
            outputs: sum((row) => row.outputs) * factor.outputs,
            gains: sum((row) => row.gains) * factor.gains,
            expenses: sum((row) => row.expenses) * factor.expenses,
            income: sum((row) => row.income) * factor.income,
            balance: latestSum((row) => row.balance),
            pendingAmount: latestSum((row) => row.pendingAmount) * Math.max(factor.outputs, factor.operations),
            operations,
            paid,
            pending: operations - paid,
            paymentRate: operations ? (paid / operations) * 100 : 0,
            averageTicket: operations ? revenue / operations : 0,
        };
    }, [factor, filteredRows, latestRows]);

    const timeline = useMemo(() => visibleMonthIndexes.map((monthIndex) => {
        const rows = filteredRows.filter((row) => row.monthIndex === monthIndex);
        const monthSum = (selector: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + selector(row), 0);
        return {
            month: demoMonths[monthIndex],
            recaudacion: Math.round(monthSum((row) => row.revenue) * factor.revenue),
            salidas: Math.round(monthSum((row) => row.outputs) * factor.outputs),
            ganancias: Math.round(monthSum((row) => row.gains) * factor.gains),
            gastos: Math.round(monthSum((row) => row.expenses) * factor.expenses),
        };
    }), [factor, filteredRows, visibleMonthIndexes]);

    const consolidated = useMemo(() => {
        const ids = Array.from(new Set(filteredRows.map((row) => row.id)));
        return ids.map((id) => {
            const rows = filteredRows.filter((row) => row.id === id);
            const latest = rows.toSorted((a, b) => b.monthIndex - a.monthIndex)[0];
            const rowSum = (selector: (row: (typeof rows)[number]) => number) => rows.reduce((total, row) => total + selector(row), 0);
            const operations = Math.round(rowSum((row) => row.operations) * factor.operations);
            const paid = Math.min(operations, Math.round(rowSum((row) => row.paid) * factor.operations));
            return {
                id,
                bank: latest.bank,
                company: latest.company,
                account: latest.account,
                operations,
                paid,
                pending: operations - paid,
                revenue: rowSum((row) => row.revenue) * factor.revenue,
                outputs: rowSum((row) => row.outputs) * factor.outputs,
                gains: rowSum((row) => row.gains) * factor.gains,
                pendingAmount: latest.pendingAmount * Math.max(factor.outputs, factor.operations),
                balance: latest.balance,
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }, [factor, filteredRows]);

    const distribution = useMemo(() => {
        const total = Math.max(1, summary.operations);
        const allFamilies = [
            { name: "Efectivización", value: Math.round(total * 0.62), color: "var(--color-utility-brand-500)" },
            { name: "Pago Deuda", value: Math.round(total * 0.24), color: "var(--color-utility-blue-500)" },
            { name: "Movimientos", value: Math.round(total * 0.09), color: "var(--color-utility-green-500)" },
            { name: "Directo", value: Math.max(0, total - Math.round(total * 0.95)), color: "var(--color-utility-orange-500)" },
        ];
        if (family === "all") return allFamilies;

        const selectedName = familyOptions.find((item) => item.value === family)?.label ?? family;
        const selected = allFamilies.find((item) => item.name === selectedName);
        return [{ name: selectedName, value: total, color: selected?.color ?? "var(--color-utility-brand-500)" }];
    }, [family, summary.operations]);

    const resetFilters = () => {
        setPeriod("6m");
        setRoute("all");
        setCompany("all");
        setAccount("all");
        setFamily("all");
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

    const periodDescription = period === "month"
        ? "Agosto de 2026"
        : period === "3m"
            ? "Junio a agosto de 2026"
            : "Marzo a agosto de 2026";

    const kpis = [
        { label: "Caja Recaudación", value: formatMoney(summary.revenue), change: 8.4, supportingText: "vs. periodo anterior", tone: "success" as const },
        { label: "Salidas", value: formatMoney(summary.outputs), change: 7.1, supportingText: "transferencias y movimientos", tone: "error" as const, invertChange: true },
        { label: "Ganancias", value: formatMoney(summary.gains), change: 10.6, supportingText: "según reglas vigentes", tone: "success" as const },
        { label: "Gastos Operacionales", value: formatMoney(summary.expenses), change: -3.2, supportingText: "vs. periodo anterior", tone: "error" as const, invertChange: true },
        { label: "Operaciones", value: integerFormatter.format(summary.operations), change: 6.8, supportingText: `${integerFormatter.format(summary.pending)} pendientes` },
        { label: "Operaciones pagadas", value: integerFormatter.format(summary.paid), change: 9.2, supportingText: `${summary.paymentRate.toFixed(1)}% de tasa de pago`, tone: "success" as const },
        { label: "Ticket promedio", value: formatMoney(summary.averageTicket), change: 1.5, supportingText: "monto medio por operación" },
        { label: "Pendiente Transferencia", value: formatMoney(summary.pendingAmount), change: -5.7, supportingText: "saldo al último corte", tone: "warning" as const, invertChange: true },
    ];

    const showSafetyPay = route === "all" || route === "safetypay";

    return (
        <AppLayout>
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-display-xs font-semibold text-primary">Métricas Bancarias</h1>
                            <Badge color="brand">Demo</Badge>
                        </div>
                        <p className="mt-1 text-sm text-tertiary">
                            Histórico consolidado de operaciones, caja y rentabilidad por banco.
                        </p>
                    </div>
                    <Button color="secondary" size="sm" iconLeading={Download01} isDisabled>
                        Descargar reporte
                    </Button>
                </div>

                <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"
                >
                    <div className="mb-4 flex items-center gap-2">
                        <BarChart03 className="size-5 text-fg-brand-primary" />
                        <div>
                            <p className="text-sm font-semibold text-primary">Vista analítica</p>
                            <p className="text-xs text-tertiary">Datos simulados para validar diseño e interacción.</p>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_1fr_1.1fr_auto] xl:items-end">
                        <NativeSelect label="Periodo" value={period} onChange={(event) => setPeriod(event.target.value)} options={periodOptions} />
                        <NativeSelect label="Banco" value={route} onChange={(event) => handleRouteChange(event.target.value)} options={routeOptions} />
                        <NativeSelect label="Empresa" value={company} onChange={(event) => handleCompanyChange(event.target.value)} options={companyOptions} />
                        <NativeSelect label="Cuenta" value={account} onChange={(event) => setAccount(event.target.value)} options={accountOptions} />
                        <NativeSelect label="Servicio" value={family} onChange={(event) => setFamily(event.target.value as DemoFamily)} options={familyOptions} />
                        <Button color="secondary" size="md" onClick={resetFilters}>Limpiar</Button>
                    </div>
                </motion.section>

                <section>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-semibold text-primary">Resumen del periodo</h2>
                            <p className="text-sm text-tertiary">{periodDescription} · comparación simulada con el periodo anterior.</p>
                        </div>
                        <Badge color="gray">America/Lima</Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {kpis.map((item, index) => <MetricCard key={item.label} {...item} index={index} />)}
                    </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                        <p className="text-sm font-medium text-tertiary">Saldo Banco</p>
                        <p className="mt-2 text-display-xs font-semibold text-primary">{formatMoney(summary.balance)}</p>
                        <p className="mt-1 text-xs text-tertiary">Último saldo por cada cuenta seleccionada</p>
                    </div>
                    <div className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                        <p className="text-sm font-medium text-tertiary">Ingresos de Movimientos</p>
                        <p className="mt-2 text-display-xs font-semibold text-success-primary">{formatMoney(summary.income)}</p>
                        <p className="mt-1 text-xs text-tertiary">Separados de la recaudación comercial</p>
                    </div>
                    <div className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                        <p className="text-sm font-medium text-tertiary">Margen de ganancia</p>
                        <p className="mt-2 text-display-xs font-semibold text-brand-secondary">
                            {percentageFormatter.format(summary.revenue > 0 ? summary.gains / summary.revenue * 100 : 0)}%
                        </p>
                        <p className="mt-1 text-xs text-tertiary">Ganancia neta sobre Caja Recaudación</p>
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Recaudación frente a salidas" description="Evolución mensual de los flujos financieros seleccionados.">
                        {timeline.length ? (
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={timeline} margin={{ left: 0, right: 8, top: 8 }}>
                                        <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" strokeDasharray="4 4" />
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
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
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
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
                    <Panel title="Distribución por servicio" description="Participación estimada por cantidad de operaciones.">
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
                                        <span className="flex items-center gap-2 text-tertiary">
                                            <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                            {item.name}
                                        </span>
                                        <span className="font-semibold tabular-nums text-primary">{integerFormatter.format(item.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Panel>

                    <Panel title="Bancos con mayor recaudación" description="Ranking consolidado para el periodo seleccionado.">
                        <div className="space-y-4">
                            {consolidated.slice(0, 6).map((row, index) => {
                                const max = consolidated[0]?.revenue || 1;
                                const width = Math.max(4, (row.revenue / max) * 100);
                                return (
                                    <motion.div key={row.id} layout transition={{ duration: 0.2 }}>
                                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                            <div className="min-w-0">
                                                <span className="font-medium text-primary">{index + 1}. {row.bank}</span>
                                                <span className="ml-2 text-tertiary">{row.company}</span>
                                            </div>
                                            <span className="shrink-0 font-semibold tabular-nums text-primary">{formatMoney(row.revenue)}</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${width}%` }}
                                                transition={{ duration: 0.35, delay: index * 0.04 }}
                                                className="h-full rounded-full bg-brand-solid"
                                            />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </Panel>
                </section>

                {showSafetyPay && (
                    <Panel title="SafetyPay · Empresas derivadas" description="Transferencias simuladas agrupadas por empresa y cuenta de destino.">
                        <div className="grid gap-3 lg:grid-cols-3">
                            {safetyPayDerivedCompanies.map((item, index) => (
                                <motion.div
                                    key={`${item.company}-${item.account}`}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.2, delay: index * 0.04 }}
                                    className="rounded-lg border border-secondary bg-secondary p-4"
                                >
                                    <p className="truncate text-sm font-semibold text-primary">{item.company}</p>
                                    <p className="mt-0.5 text-xs text-tertiary">{item.account} · {item.operations} operaciones</p>
                                    <p className="mt-3 text-lg font-semibold text-success-primary">{formatMoney(item.transfer)}</p>
                                </motion.div>
                            ))}
                        </div>
                    </Panel>
                )}

                <Panel title="Detalle consolidado" description="Una fila por banco, empresa y cuenta. Los montos corresponden a datos de demostración." className="mb-2">
                    <div className="overflow-x-auto rounded-lg border border-secondary">
                        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Banco</th>
                                    <th className="px-4 py-3 font-semibold">Empresa</th>
                                    <th className="px-4 py-3 font-semibold">Cuenta</th>
                                    <th className="px-4 py-3 text-right font-semibold">Operaciones</th>
                                    <th className="px-4 py-3 text-right font-semibold">Pagadas</th>
                                    <th className="px-4 py-3 text-right font-semibold">Recaudación</th>
                                    <th className="px-4 py-3 text-right font-semibold">Salidas</th>
                                    <th className="px-4 py-3 text-right font-semibold">Ganancias</th>
                                    <th className="px-4 py-3 text-right font-semibold">Pendiente</th>
                                    <th className="px-4 py-3 text-right font-semibold">Saldo Banco</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-secondary">
                                {consolidated.map((row) => (
                                    <motion.tr key={row.id} layout transition={{ duration: 0.2 }} className="bg-primary hover:bg-primary_hover">
                                        <td className="px-4 py-3 font-semibold text-primary">{row.bank}</td>
                                        <td className="px-4 py-3 text-secondary">{row.company}</td>
                                        <td className="px-4 py-3 text-secondary">{row.account}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operations)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.paid)}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums text-success-primary">{formatMoney(row.revenue)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.outputs)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.gains)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-warning-primary">{formatMoney(row.pendingAmount)}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{formatMoney(row.balance)}</td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                        {!consolidated.length && <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>}
                    </div>
                </Panel>
            </div>
        </AppLayout>
    );
};
