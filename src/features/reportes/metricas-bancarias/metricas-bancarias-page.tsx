import { useMemo, useRef, useState, type ReactNode } from "react";
import { parseDate as parseCalendarDate, type DateValue } from "@internationalized/date";
import { BarChart03, ChevronDown, ChevronUp, Download01, Trash01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { BasicDatePicker } from "@/components/application/date-picker/basic-date-picker";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Tooltip as UiTooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";
import {
    useMetricasBancarias,
    useMetricasBancariasClientes,
    useMetricasBancariasComisiones,
    useMetricasBancariasComunidades,
    useMetricasBancariasMejorCliente,
    useMetricasBancariasPendientes,
    useMetricasBancariasSerie,
} from "./use-metricas-bancarias";
import { exportMetricasBancarias } from "./metricas-bancarias-export";
import { MetricasServiceNavigation } from "./metricas-service-navigation";
import type { MetricasCliente, MetricasComision, MetricasComunidad, MetricasConsulta, MetricasDesglose, MetricasOperacionPendiente } from "./metricas-bancarias.types";
import { RecordatorioEnviarModal } from "@/features/recordatorios-operativos/recordatorio-enviar-modal";

const routeOptions = [
    { label: "Todos los bancos", value: "all" },
    { label: "BCP", value: "bcp" },
    { label: "BBVA", value: "bbva" },
    { label: "Scotiabank", value: "scotiabank" },
    { label: "BanBif", value: "banbif" },
    { label: "Interbank", value: "interbank" },
    { label: "SafetyPay", value: "safetypay" },
];

const bankDisplayOrder = ["bcp", "bbva", "banbif", "interbank", "safetypay", "scotiabank"];

const routeLabels = new Map(routeOptions.map((item) => [item.value, item.label]));
const getRouteLabel = (route: string) => routeLabels.get(route) ?? route;

type MetricasBancariasPeriodo = "today" | "yesterday" | "week" | "month";

const periodOptions: Array<{ label: string; value: MetricasBancariasPeriodo }> = [
    { label: "Hoy", value: "today" },
    { label: "Ayer", value: "yesterday" },
    { label: "Semana", value: "week" },
    { label: "Mes", value: "month" },
];

const moneyFormatter = new Intl.NumberFormat("es-PE", {
    currency: "PEN",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
});

const integerFormatter = new Intl.NumberFormat("es-PE");

const formatMoney = (value: number) => moneyFormatter.format(value).replace("PEN", "S/");
const formatDayParts = (value: string) => {
    const date = parseDate(value);
    const day = new Intl.DateTimeFormat("es-PE", { day: "numeric", timeZone: "UTC" }).format(date);
    const weekday = new Intl.DateTimeFormat("es-PE", { weekday: "long", timeZone: "UTC" }).format(date);
    const month = ["Ene.", "Feb.", "Mar.", "Abr.", "May.", "Jun.", "Jul.", "Ago.", "Set.", "Oct.", "Nov.", "Dic."][date.getUTCMonth()];
    return {
        label: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} de ${month}`,
    };
};
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

const getDateRange = (period: MetricasBancariasPeriodo) => {
    const today = getLimaToday();
    const current = parseDate(today);
    if (period === "today") return { fechaDesde: today, fechaHasta: today, granularidad: "DIA" as const };
    if (period === "yesterday") {
        const yesterday = new Date(current);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const date = toIsoDate(yesterday);
        return { fechaDesde: date, fechaHasta: date, granularidad: "DIA" as const };
    }
    if (period === "week") {
        const start = new Date(current);
        const daysSinceMonday = (start.getUTCDay() + 6) % 7;
        start.setUTCDate(start.getUTCDate() - daysSinceMonday);
        return { fechaDesde: toIsoDate(start), fechaHasta: today, granularidad: "DIA" as const };
    }
    const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
    return { fechaDesde: toIsoDate(start), fechaHasta: today, granularidad: "DIA" as const };
};

const isHiddenCompany = (name: string) => ["link pago", "pos"].includes(name.trim().toLocaleLowerCase("es-PE"));

interface MetricCardProps {
    label: string;
    value: string;
    change?: number | null;
    supportingText?: string;
    supportingTextSize?: "default" | "sm";
    supportingTextTone?: "default" | "blue";
    supportingLines?: string[];
    valueSize?: "default" | "sm" | "xs";
    wrapValue?: boolean;
    tone?: "default" | "success" | "warning" | "error";
    invertChange?: boolean;
    index: number;
    onClick?: () => void;
}

const MetricCard = ({ label, value, change, supportingText, supportingTextSize = "default", supportingTextTone = "default", supportingLines, valueSize = "default", wrapValue = false, tone = "default", invertChange = false, index, onClick }: MetricCardProps) => {
    const isPositive = (change ?? 0) >= 0;
    const isFavorable = invertChange ? !isPositive : isPositive;
    return (
        <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.025 }}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={(event) => {
                if (onClick && (event.key === "Enter" || event.key === " ")) onClick();
            }}
            className={cx("min-w-0 rounded-lg border border-secondary bg-primary p-3 shadow-xs", onClick && "cursor-pointer transition duration-200 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand")}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-tertiary">{label}</p>
                {change !== null && change !== undefined && (
                    <Badge size="sm" color={isFavorable ? "success" : "error"}>
                        {isPositive ? "+" : ""}{change.toFixed(1)}%
                    </Badge>
                )}
            </div>
            <p className={cx(
                "mt-2 font-semibold tabular-nums",
                valueSize === "xs" ? "text-[11px] leading-4" : valueSize === "sm" ? "text-sm leading-5" : "text-lg",
                wrapValue ? "break-words whitespace-normal" : "truncate",
                tone === "success" && "text-success-primary",
                tone === "warning" && "text-warning-primary",
                tone === "error" && "text-error-primary",
                tone === "default" && "text-primary",
            )}>
                {value}
            </p>
            {supportingText && (
                <p
                    className={cx(
                        "mt-1 truncate",
                        supportingTextSize === "sm" ? "text-sm" : "text-[11px]",
                        supportingTextTone === "blue" ? "font-semibold text-utility-blue-700" : "text-tertiary",
                    )}
                    title={supportingText}
                >
                    {supportingText}
                </p>
            )}
            {supportingLines && (
                <div className="mt-2 space-y-1 text-[11px] text-tertiary">
                    {supportingLines.map((line) => <p key={line} className="truncate" title={line}>{line}</p>)}
                </div>
            )}
        </motion.article>
    );
};

interface PanelProps {
    title: string;
    children: ReactNode;
    className?: string;
    company?: string;
    service?: string;
}

const Panel = ({ title, children, className, company, service }: PanelProps) => (
    <motion.section layout transition={{ duration: 0.2 }} className={cx("rounded-xl border border-secondary bg-primary p-5 shadow-xs", className)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {company && <Badge size="sm" color="gray">{company}</Badge>}
                {service && <Badge size="sm" color="brand">{service}</Badge>}
            </div>
        </div>
        {children}
    </motion.section>
);

const LoadingState = () => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 9 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-secondary" />)}
    </div>
);

type CommunitySortKey = keyof MetricasComunidad;
type ClientSortKey = keyof MetricasCliente;
type CommissionSortKey = keyof MetricasComision;
type PendingSortKey = keyof MetricasOperacionPendiente;
type SortDirection = "asc" | "desc";

const SortableHeader = <T extends string,>({ label, column, activeColumn, direction, align = "left", onSort }: {
    label: string;
    column: T;
    activeColumn: T;
    direction: SortDirection;
    align?: "left" | "right";
    onSort: (column: T) => void;
}) => {
    const isActive = activeColumn === column;
    const SortIcon = direction === "asc" ? ChevronUp : ChevronDown;
    return (
        <th className={cx("px-4 py-3 font-semibold", align === "right" && "text-right")} aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}>
            <button type="button" className={cx("inline-flex w-full min-w-0 items-center gap-1.5 hover:text-primary", align === "right" && "justify-end")} onClick={() => onSort(column)}>
                <span>{label}</span>
                <SortIcon className={cx("size-3.5 shrink-0", !isActive && "opacity-30")} aria-hidden="true" />
            </button>
        </th>
    );
};

export const MetricasBancariasPage = () => {
    const [period, setPeriod] = useState<MetricasBancariasPeriodo | null>("week");
    const [dateRange, setDateRange] = useState(() => getDateRange("week"));
    const [selectedBankRoute, setSelectedBankRoute] = useState<string | null>(null);
    const [selectedCompanyByBank, setSelectedCompanyByBank] = useState<Record<string, number>>({});
    const [communitySort, setCommunitySort] = useState<{ column: CommunitySortKey; direction: SortDirection }>({ column: "recaudacion", direction: "desc" });
    const [clientSort, setClientSort] = useState<{ column: ClientSortKey; direction: SortDirection }>({ column: "operaciones", direction: "desc" });
    const [commissionSort, setCommissionSort] = useState<{ column: CommissionSortKey; direction: SortDirection }>({ column: "porcentaje", direction: "asc" });
    const [pendingSort, setPendingSort] = useState<{ column: PendingSortKey; direction: SortDirection }>({ column: "fecha", direction: "desc" });
    const [isExporting, setIsExporting] = useState(false);
    const pendingTableRef = useRef<HTMLDivElement>(null);

    const consulta = useMemo<MetricasConsulta>(() => ({
        ...dateRange,
        ruta: null,
        idEmpresa: null,
        idCuenta: null,
        idBanco: null,
        servicio: "efectivizacion",
    }), [dateRange]);
    const { breakdown, isLoading, error, refresh } = useMetricasBancarias(consulta);

    const visibleBreakdown = useMemo(() => breakdown
        .filter((row) => !isHiddenCompany(row.empresa)), [breakdown]);

    const breakdownByBank = useMemo(() => {
        const grouped = new Map<string, MetricasDesglose[]>();
        for (const row of visibleBreakdown) {
            const route = row.ruta.toLowerCase();
            grouped.set(route, [...(grouped.get(route) ?? []), row]);
        }

        return Array.from(grouped, ([route, rows]) => {
            const companies = new Map<number, {
                idEmpresa: number;
                empresa: string;
                cuentas: string[];
                cajaRecaudacion: number;
                salidas: number;
                ganancias: number;
                gastosOperacionales: number;
                operaciones: number;
                pendientes: number;
                pendienteTransferencia: number;
                clientesNuevos: number;
            }>();

            for (const row of rows) {
                const current = companies.get(row.idEmpresa) ?? {
                    idEmpresa: row.idEmpresa,
                    empresa: row.empresa,
                    cuentas: [],
                    cajaRecaudacion: 0,
                    salidas: 0,
                    ganancias: 0,
                    gastosOperacionales: 0,
                    operaciones: 0,
                    pendientes: 0,
                    pendienteTransferencia: 0,
                    clientesNuevos: 0,
                };
                if (!current.cuentas.includes(row.cuenta)) current.cuentas.push(row.cuenta);
                current.cajaRecaudacion += row.cajaRecaudacion;
                current.salidas += row.salidas;
                current.ganancias += row.ganancias;
                current.gastosOperacionales += row.gastosOperacionales;
                current.operaciones += row.operaciones;
                current.pendientes += row.pendientes;
                current.pendienteTransferencia += row.pendienteTransferencia;
                current.clientesNuevos += row.clientesNuevos;
                companies.set(row.idEmpresa, current);
            }

            return {
                route,
                companies: Array.from(companies.values()).toSorted((a, b) => a.empresa.localeCompare(b.empresa, "es", { sensitivity: "base" })),
            };
        }).sort((a, b) => {
            const aIndex = bankDisplayOrder.indexOf(a.route);
            const bIndex = bankDisplayOrder.indexOf(b.route);
            return (aIndex === -1 ? bankDisplayOrder.length : aIndex)
                - (bIndex === -1 ? bankDisplayOrder.length : bIndex)
                || a.route.localeCompare(b.route);
        });
    }, [visibleBreakdown]);

    const activeBankRoute = selectedBankRoute ?? bankDisplayOrder[0];
    const selectedBank = breakdownByBank.find((bank) => bank.route === activeBankRoute);
    const selectedCompanyId = selectedBank ? selectedCompanyByBank[selectedBank.route] : undefined;
    const selectedCompany = selectedBank?.companies.find((company) => company.idEmpresa === selectedCompanyId) ?? selectedBank?.companies[0];
    const selectedCompanyKpis = selectedCompany ? [
        { label: "Caja Recaudación", value: formatMoney(selectedCompany.cajaRecaudacion), supportingText: "recaudado en el periodo", tone: "success" as const },
        { label: "Salidas", value: formatMoney(selectedCompany.salidas), supportingText: "transferencias pagadas", tone: "error" as const },
        { label: "Ganancias", value: formatMoney(selectedCompany.ganancias), supportingText: "comisión del servicio menos gastos bancarios", tone: "success" as const },
        { label: "Gastos Operacionales", value: formatMoney(selectedCompany.gastosOperacionales), supportingText: "acumulado del periodo", tone: "error" as const },
        { label: "Operaciones", value: integerFormatter.format(selectedCompany.operaciones) },
        { label: "Operaciones Pendientes", value: integerFormatter.format(selectedCompany.pendientes), supportingText: formatMoney(selectedCompany.pendienteTransferencia), tone: "warning" as const, onClick: () => pendingTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Clientes nuevos", value: integerFormatter.format(selectedCompany.clientesNuevos), supportingText: "registrados en el periodo", tone: "success" as const },
    ] : [];

    const communityConsulta = useMemo<MetricasConsulta>(() => ({
        ...consulta,
        ruta: activeBankRoute,
        idEmpresa: selectedCompany?.idEmpresa ?? null,
        idCuenta: null,
        idBanco: null,
    }), [consulta, activeBankRoute, selectedCompany?.idEmpresa]);
    const { communities, isLoading: communitiesLoading, error: communitiesError } = useMetricasBancariasComunidades(communityConsulta);
    const { clients, isLoading: clientsLoading, error: clientsError } = useMetricasBancariasClientes(communityConsulta);
    const { commissions, isLoading: commissionsLoading, error: commissionsError } = useMetricasBancariasComisiones(communityConsulta);
    const { pendingOperations, isLoading: pendingLoading, error: pendingError } = useMetricasBancariasPendientes(communityConsulta);
    const { series, isLoading: seriesLoading, error: seriesError } = useMetricasBancariasSerie(communityConsulta);
    const { bestClient, isLoading: bestClientLoading, error: bestClientError } = useMetricasBancariasMejorCliente(communityConsulta);
    const sortedCommunities = useMemo(() => communities.toSorted((a, b) => {
        const left = a[communitySort.column];
        const right = b[communitySort.column];
        const comparison = typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""), "es", { numeric: true, sensitivity: "base" });
        return communitySort.direction === "asc" ? comparison : -comparison;
    }), [communities, communitySort]);
    const sortedClients = useMemo(() => clients.toSorted((a, b) => {
        const left = a[clientSort.column];
        const right = b[clientSort.column];
        const comparison = typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""), "es", { numeric: true, sensitivity: "base" });
        return clientSort.direction === "asc" ? comparison : -comparison;
    }), [clients, clientSort]);
    const sortedCommissions = useMemo(() => commissions.toSorted((a, b) => {
        const comparison = a[commissionSort.column] - b[commissionSort.column];
        return commissionSort.direction === "asc" ? comparison : -comparison;
    }), [commissions, commissionSort]);
    const sortedPendingOperations = useMemo(() => pendingOperations.toSorted((a, b) => {
        const left = a[pendingSort.column];
        const right = b[pendingSort.column];
        const comparison = typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""), "es", { numeric: true, sensitivity: "base" });
        return pendingSort.direction === "asc" ? comparison : -comparison;
    }), [pendingOperations, pendingSort]);
    const dailyPerformance = useMemo(() => {
        const values = new Map<string, { periodo: string; operaciones: number; ganancias: number }>();
        for (const row of series) {
            if (!row.periodo || row.ruta === "__clientes__") continue;
            const current = values.get(row.periodo) ?? { periodo: row.periodo, operaciones: 0, ganancias: 0 };
            current.operaciones += row.operacionesRegistradas;
            current.ganancias += row.ganancias;
            values.set(row.periodo, current);
        }
        return Array.from(values.values()).filter((row) => row.operaciones > 0);
    }, [series]);
    const bestDay = useMemo(() => dailyPerformance.toSorted((a, b) => b.operaciones - a.operaciones || b.ganancias - a.ganancias)[0], [dailyPerformance]);
    const worstDay = useMemo(() => dailyPerformance.toSorted((a, b) => a.operaciones - b.operaciones || a.ganancias - b.ganancias)[0], [dailyPerformance]);
    const bestCommunity = useMemo(() => communities.toSorted((a, b) => b.operaciones - a.operaciones || b.ganancias - a.ganancias)[0], [communities]);
    const insightKpis = [
        {
            label: "Mejor Día",
            value: bestDay ? formatDayParts(bestDay.periodo).label : "-",
            supportingLines: bestDay ? [
                `Operaciones: ${integerFormatter.format(bestDay.operaciones)}`,
                `Ganancia: ${formatMoney(bestDay.ganancias)}`,
            ] : ["Sin operaciones"],
            wrapValue: true,
            tone: "success" as const,
        },
        {
            label: "Peor Día",
            value: worstDay ? formatDayParts(worstDay.periodo).label : "-",
            supportingLines: worstDay ? [
                `Operaciones: ${integerFormatter.format(worstDay.operaciones)}`,
                `Ganancia: ${formatMoney(worstDay.ganancias)}`,
            ] : ["Sin operaciones"],
            wrapValue: true,
            tone: "error" as const,
        },
        {
            label: "Mejor Cliente",
            value: bestClient ? `${bestClient.nombreCompleto} - DNI: ${bestClient.dni}` : "-",
            supportingLines: bestClient ? [
                `Operaciones: ${integerFormatter.format(bestClient.operaciones)}`,
                `Ganancia: ${formatMoney(bestClient.ganancias)}`,
            ] : ["Sin operaciones"],
            valueSize: "xs" as const,
            wrapValue: true,
            tone: "success" as const,
        },
        {
            label: "Mejor Comunidad",
            value: bestCommunity?.comunidad ?? "-",
            supportingLines: bestCommunity ? [
                `Operaciones: ${integerFormatter.format(bestCommunity.operaciones)}`,
                `Ganancia: ${formatMoney(bestCommunity.ganancias)}`,
            ] : ["Sin operaciones"],
            tone: "success" as const,
        },
    ];
    const resetFilters = () => {
        setPeriod("week");
        setDateRange(getDateRange("week"));
        setSelectedBankRoute(null);
        setSelectedCompanyByBank({});
    };

    const handleCommunitySort = (column: CommunitySortKey) => {
        setCommunitySort((current) => ({
            column,
            direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
        }));
    };
    const handleClientSort = (column: ClientSortKey) => {
        setClientSort((current) => ({
            column,
            direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
        }));
    };
    const handleCommissionSort = (column: CommissionSortKey) => {
        setCommissionSort((current) => ({
            column,
            direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
        }));
    };
    const handlePendingSort = (column: PendingSortKey) => {
        setPendingSort((current) => ({
            column,
            direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
        }));
    };
    const handleCompanyChange = (idEmpresa: number) => {
        setSelectedCompanyByBank((current) => ({ ...current, [activeBankRoute]: idEmpresa }));
    };
    const handleBankChange = (route: string) => {
        setSelectedBankRoute(route);
    };
    const handlePeriodChange = (value: MetricasBancariasPeriodo) => {
        setPeriod(value);
        setDateRange(getDateRange(value));
    };
    const handleDateChange = (field: "fechaDesde" | "fechaHasta", value: DateValue) => {
        const selectedDate = value.toString();
        setPeriod(null);
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
    const handleExport = async () => {
        if (!selectedCompany || isExporting) return;
        setIsExporting(true);
        try {
            await exportMetricasBancarias({
                banco: getRouteLabel(activeBankRoute),
                empresa: selectedCompany.empresa,
                fechaDesde: dateRange.fechaDesde,
                fechaHasta: dateRange.fechaHasta,
                kpis: [...selectedCompanyKpis, ...insightKpis].map((item) => ({ indicador: item.label, valor: item.value })),
                commissions,
                communities,
                clients,
                pendingOperations,
            });
        } finally {
            setIsExporting(false);
        }
    };
    const currentError = error ?? seriesError ?? bestClientError;
    const renderCompanyTabs = () => (
        <nav aria-label={`Empresas de ${getRouteLabel(activeBankRoute)}`} role="tablist" className="flex min-h-11 w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-secondary bg-primary p-1">
            {selectedBank?.companies.map((company) => {
                const isSelected = company.idEmpresa === selectedCompany?.idEmpresa;
                return (
                    <button
                        key={company.idEmpresa}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        title={company.empresa}
                        onClick={() => handleCompanyChange(company.idEmpresa)}
                        className={cx(
                            "h-9 shrink-0 rounded-md px-3 text-sm font-semibold whitespace-nowrap transition duration-200",
                            isSelected
                                ? "bg-brand-solid text-primary_on-brand shadow-xs"
                                : "text-secondary hover:bg-primary_hover hover:text-primary",
                        )}
                    >
                        {company.empresa}
                    </button>
                );
            }) ?? <span className="px-3 text-sm text-tertiary">Sin empresas para el periodo seleccionado</span>}
        </nav>
    );

    return (
        <AppLayout>
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                        <h1 className="text-display-xs font-semibold text-primary">Métricas Bancarias</h1>
                    </div>
                    <Button color="secondary" size="sm" iconLeading={Download01} isDisabled={!selectedCompany || isExporting || communitiesLoading || clientsLoading || commissionsLoading || pendingLoading || seriesLoading || bestClientLoading} onClick={() => void handleExport()}>
                        {isExporting ? "Generando..." : "Descargar reporte"}
                    </Button>
                </div>

                <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                    <div className="mb-4 flex items-center gap-2">
                        <BarChart03 className="size-5 text-fg-brand-primary" />
                        <p className="text-sm font-semibold text-primary">Filtros</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 pb-1">
                        <MetricasServiceNavigation active="efectivizacion" />
                        <nav aria-label="Bancos" role="tablist" className="flex h-11 shrink-0 gap-1 rounded-lg border border-secondary bg-primary p-1">
                            {bankDisplayOrder.map((route) => {
                                const isSelected = route === activeBankRoute;
                                return (
                                    <button
                                        key={route}
                                        type="button"
                                        role="tab"
                                        aria-selected={isSelected}
                                        onClick={() => handleBankChange(route)}
                                        className={cx(
                                            "h-full shrink-0 rounded-md px-3 text-sm font-semibold transition duration-200",
                                            isSelected
                                                ? "bg-brand-solid text-primary_on-brand shadow-xs"
                                                : "text-secondary hover:bg-primary_hover hover:text-primary",
                                        )}
                                    >
                                        {getRouteLabel(route)}
                                    </button>
                                );
                            })}
                        </nav>
                        <nav aria-label="Periodos predefinidos" role="tablist" className="flex h-11 shrink-0 gap-1 rounded-lg border border-secondary bg-primary p-1">
                            {periodOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="tab"
                                    aria-selected={period === option.value}
                                    className={cx(
                                        "h-full shrink-0 rounded-md px-4 text-sm font-semibold whitespace-nowrap transition duration-200",
                                        period === option.value
                                            ? "bg-brand-solid text-primary_on-brand shadow-xs"
                                            : "text-secondary hover:bg-primary_hover hover:text-primary",
                                    )}
                                    onClick={() => handlePeriodChange(option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </nav>
                        <div className="w-fit max-w-full shrink-0">
                            <BasicDatePicker
                                aria-label="Desde"
                                value={parseCalendarDate(dateRange.fechaDesde)}
                                maxValue={parseCalendarDate(getLimaToday())}
                                onChange={(value) => value && handleDateChange("fechaDesde", value)}
                                size="md"
                                showYear={false}
                                buttonClassName="h-11 w-fit justify-start"
                            />
                        </div>
                        <div className="w-fit max-w-full shrink-0">
                            <BasicDatePicker
                                aria-label="Hasta"
                                value={parseCalendarDate(dateRange.fechaHasta)}
                                maxValue={parseCalendarDate(getLimaToday())}
                                onChange={(value) => value && handleDateChange("fechaHasta", value)}
                                size="md"
                                showYear={false}
                                buttonClassName="h-11 w-fit justify-start"
                            />
                        </div>
                        <UiTooltip title="Limpiar filtros" placement="top">
                            <TooltipTrigger
                                aria-label="Limpiar filtros"
                                onPress={resetFilters}
                                className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-secondary bg-primary text-fg-quaternary shadow-xs transition duration-200 hover:bg-primary_hover hover:text-fg-quaternary_hover"
                            >
                                <Trash01 className="size-5" />
                            </TooltipTrigger>
                        </UiTooltip>
                        {renderCompanyTabs()}
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
                    {isLoading || seriesLoading || clientsLoading || communitiesLoading || bestClientLoading ? <LoadingState /> : selectedCompany ? (
                        <div>
                            <p className="mb-2 truncate text-xs text-tertiary" title={selectedCompany.cuentas.join(", ")}>{selectedCompany.cuentas.join(" · ")}</p>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
                                {[...selectedCompanyKpis, ...insightKpis].map((item, index) => <MetricCard key={item.label} {...item} index={index} />)}
                            </div>
                        </div>
                    ) : (
                        <p className="rounded-lg bg-secondary px-4 py-8 text-center text-sm text-tertiary">No hay empresas con operaciones para este periodo.</p>
                    )}
                </section>

                <Panel title="Distribución % Comisión" company={selectedCompany?.empresa} service="Efectivización" className="mb-2">
                    <div className="overflow-x-auto rounded-lg border border-secondary">
                        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary"><tr>
                                <SortableHeader label="Comisión" column="porcentaje" activeColumn={commissionSort.column} direction={commissionSort.direction} onSort={handleCommissionSort} />
                                <SortableHeader label="Operaciones" column="operaciones" activeColumn={commissionSort.column} direction={commissionSort.direction} align="right" onSort={handleCommissionSort} />
                                <SortableHeader label="Recaudación" column="recaudacion" activeColumn={commissionSort.column} direction={commissionSort.direction} align="right" onSort={handleCommissionSort} />
                                <SortableHeader label="Comisión generada" column="comision" activeColumn={commissionSort.column} direction={commissionSort.direction} align="right" onSort={handleCommissionSort} />
                                <SortableHeader label="Gasto Operacional" column="gastosOperacionales" activeColumn={commissionSort.column} direction={commissionSort.direction} align="right" onSort={handleCommissionSort} />
                                <SortableHeader label="Ganancia" column="ganancias" activeColumn={commissionSort.column} direction={commissionSort.direction} align="right" onSort={handleCommissionSort} />
                                <SortableHeader label="Salida" column="salida" activeColumn={commissionSort.column} direction={commissionSort.direction} align="right" onSort={handleCommissionSort} />
                            </tr></thead>
                            <tbody className="divide-y divide-secondary">
                                {sortedCommissions.map((row) => (
                                    <tr key={row.porcentaje} className="bg-primary hover:bg-primary_hover">
                                        <td className="px-4 py-3 font-semibold text-primary">{row.porcentaje.toFixed(2)}%</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.comision)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.gastosOperacionales)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salida)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {commissionsError ? (
                            <p className="px-4 py-10 text-center text-sm text-error-primary">{commissionsError}</p>
                        ) : !commissions.length && !commissionsLoading ? (
                            <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>
                        ) : null}
                    </div>
                </Panel>

                <Panel title="Distribución Comunidad" company={selectedCompany?.empresa} service="Efectivización" className="mb-2">
                    <div className="overflow-x-auto rounded-lg border border-secondary">
                        <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary"><tr>
                                <SortableHeader label="Comunidad" column="comunidad" activeColumn={communitySort.column} direction={communitySort.direction} onSort={handleCommunitySort} />
                                <SortableHeader label="Operaciones" column="operaciones" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                                <SortableHeader label="Recaudación" column="recaudacion" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                                <SortableHeader label="Comisión" column="comision" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                                <SortableHeader label="Gasto Operacional" column="gastosOperacionales" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                                <SortableHeader label="Ganancia" column="ganancias" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                                <SortableHeader label="Salida" column="salida" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                                <SortableHeader label="Clientes Nuevos" column="clientesNuevos" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                                <SortableHeader label="Operaciones Pendientes" column="operacionesPendientes" activeColumn={communitySort.column} direction={communitySort.direction} align="right" onSort={handleCommunitySort} />
                            </tr></thead>
                            <tbody className="divide-y divide-secondary">
                                {sortedCommunities.map((row) => (
                                    <motion.tr key={`${row.idComunidad}-${row.comunidad}`} layout transition={{ duration: 0.2 }} className="bg-primary hover:bg-primary_hover">
                                        <td className="px-4 py-3 font-semibold text-primary">{row.comunidad}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.comision)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.gastosOperacionales)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salida)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.clientesNuevos)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.operacionesPendientes)}</td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                        {communitiesError ? (
                            <p className="px-4 py-10 text-center text-sm text-error-primary">{communitiesError}</p>
                        ) : !sortedCommunities.length && !communitiesLoading ? (
                            <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>
                        ) : null}
                    </div>
                </Panel>

                <Panel title="Distribución Clientes con Más Operaciones" company={selectedCompany?.empresa} service="Efectivización" className="mb-2">
                    <div className="overflow-x-auto rounded-lg border border-secondary">
                        <table className="w-full min-w-[1380px] border-collapse text-left text-sm">
                            <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary"><tr>
                                <SortableHeader label="DNI" column="dni" activeColumn={clientSort.column} direction={clientSort.direction} onSort={handleClientSort} />
                                <SortableHeader label="Nombre Completo" column="nombreCompleto" activeColumn={clientSort.column} direction={clientSort.direction} onSort={handleClientSort} />
                                <SortableHeader label="Comunidad" column="comunidad" activeColumn={clientSort.column} direction={clientSort.direction} onSort={handleClientSort} />
                                <SortableHeader label="Operaciones" column="operaciones" activeColumn={clientSort.column} direction={clientSort.direction} align="right" onSort={handleClientSort} />
                                <SortableHeader label="Pendientes" column="operacionesPendientes" activeColumn={clientSort.column} direction={clientSort.direction} align="right" onSort={handleClientSort} />
                                <SortableHeader label="Recaudación" column="recaudacion" activeColumn={clientSort.column} direction={clientSort.direction} align="right" onSort={handleClientSort} />
                                <SortableHeader label="Comisión" column="comision" activeColumn={clientSort.column} direction={clientSort.direction} align="right" onSort={handleClientSort} />
                                <SortableHeader label="Gasto Operacional" column="gastosOperacionales" activeColumn={clientSort.column} direction={clientSort.direction} align="right" onSort={handleClientSort} />
                                <SortableHeader label="Ganancia" column="ganancias" activeColumn={clientSort.column} direction={clientSort.direction} align="right" onSort={handleClientSort} />
                                <SortableHeader label="Salida" column="salida" activeColumn={clientSort.column} direction={clientSort.direction} align="right" onSort={handleClientSort} />
                            </tr></thead>
                            <tbody className="divide-y divide-secondary">
                                {sortedClients.map((row) => (
                                    <motion.tr key={row.idCliente} layout transition={{ duration: 0.2 }} className="bg-primary hover:bg-primary_hover">
                                        <td className="px-4 py-3 font-semibold tabular-nums text-primary">{row.dni}</td>
                                        <td className="max-w-64 truncate px-4 py-3 font-medium text-primary" title={row.nombreCompleto}>{row.nombreCompleto}</td>
                                        <td className="px-4 py-3 text-secondary">{row.comunidad}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.operacionesPendientes)}</td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.comision)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.gastosOperacionales)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salida)}</td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                        {clientsError ? (
                            <p className="px-4 py-10 text-center text-sm text-error-primary">{clientsError}</p>
                        ) : !sortedClients.length && !clientsLoading ? (
                            <p className="px-4 py-10 text-center text-sm text-tertiary">No hay resultados para mostrar.</p>
                        ) : null}
                    </div>
                </Panel>

                <div ref={pendingTableRef} className="scroll-mt-6">
                    <Panel title="Operaciones Pendientes" company={selectedCompany?.empresa} service="Efectivización" className="mb-2">
                        <div className="overflow-x-auto rounded-lg border border-secondary">
                            <table className="w-full min-w-[1380px] border-collapse text-left text-sm">
                                <thead className="bg-secondary text-xs uppercase tracking-wide text-tertiary"><tr>
                                    <SortableHeader label="Código" column="codigoOperacion" activeColumn={pendingSort.column} direction={pendingSort.direction} onSort={handlePendingSort} />
                                    <SortableHeader label="DNI" column="dni" activeColumn={pendingSort.column} direction={pendingSort.direction} onSort={handlePendingSort} />
                                    <SortableHeader label="Cliente" column="nombreCompleto" activeColumn={pendingSort.column} direction={pendingSort.direction} onSort={handlePendingSort} />
                                    <SortableHeader label="Comunidad" column="comunidad" activeColumn={pendingSort.column} direction={pendingSort.direction} onSort={handlePendingSort} />
                                    <SortableHeader label="Cuenta" column="cuenta" activeColumn={pendingSort.column} direction={pendingSort.direction} onSort={handlePendingSort} />
                                    <SortableHeader label="Fecha" column="fecha" activeColumn={pendingSort.column} direction={pendingSort.direction} onSort={handlePendingSort} />
                                    <SortableHeader label="Recaudación" column="recaudacion" activeColumn={pendingSort.column} direction={pendingSort.direction} align="right" onSort={handlePendingSort} />
                                    <SortableHeader label="Transferencia" column="transferencia" activeColumn={pendingSort.column} direction={pendingSort.direction} align="right" onSort={handlePendingSort} />
                                    <SortableHeader label="Estado actual" column="estado" activeColumn={pendingSort.column} direction={pendingSort.direction} onSort={handlePendingSort} />
                                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                                </tr></thead>
                                <tbody className="divide-y divide-secondary">
                                    {sortedPendingOperations.map((row) => (
                                        <tr key={row.idOperacion} className="bg-primary hover:bg-primary_hover">
                                            <td className="px-4 py-3 font-semibold text-primary">{row.codigoOperacion}</td>
                                            <td className="px-4 py-3 tabular-nums text-secondary">{row.dni}</td>
                                            <td className="max-w-64 truncate px-4 py-3 text-primary" title={row.nombreCompleto}>{row.nombreCompleto}</td>
                                            <td className="px-4 py-3 text-secondary">{row.comunidad}</td>
                                            <td className="px-4 py-3 text-secondary">{row.cuenta}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-secondary">{row.fecha ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.fecha)) : "-"}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-warning-primary">{formatMoney(row.transferencia)}</td>
                                            <td className="px-4 py-3 font-medium text-warning-primary">{row.estado}</td>
                                            <td className="px-4 py-3 text-right"><RecordatorioEnviarModal idOperacion={row.idOperacion} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {pendingError ? (
                                <p className="px-4 py-10 text-center text-sm text-error-primary">{pendingError}</p>
                            ) : !sortedPendingOperations.length && !pendingLoading ? (
                                <p className="px-4 py-10 text-center text-sm text-tertiary">No hay operaciones pendientes para mostrar.</p>
                            ) : null}
                        </div>
                    </Panel>
                </div>

            </div>
        </AppLayout>
    );
};
