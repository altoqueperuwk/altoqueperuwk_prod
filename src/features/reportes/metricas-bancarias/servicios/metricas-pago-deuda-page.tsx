import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { parseDate as parseCalendarDate, type DateValue } from "@internationalized/date";
import { BarChart03, ChevronDown, ChevronUp, Download01, File06, File07, Trash01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { BasicDatePicker } from "@/components/application/date-picker/basic-date-picker";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Tooltip as UiTooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { useAuth } from "@/providers/auth-provider";
import { cx } from "@/utils/cx";
import { MetricasServiceNavigation } from "../metricas-service-navigation";
import { exportMetricasBancarias, type MetricasExportFormat, type MetricasReportSection } from "../metricas-bancarias-export";
import { RecordatorioEnviarModal } from "@/features/recordatorios-operativos/recordatorio-enviar-modal";
import { formatMetricasDateRange } from "../metricas-date-range";
import type {
    MetricasPagoDeudaCliente,
    MetricasPagoDeudaComision,
    MetricasPagoDeudaComunidad,
    MetricasPagoDeudaDistribucion,
    MetricasPagoDeudaPendiente,
} from "./metricas-servicio.types";
import { useMetricasPagoDeuda } from "./use-metricas-servicio";

type Period = "today" | "yesterday" | "week" | "month";
type Direction = "asc" | "desc";
type SortState<T extends string> = { column: T; direction: Direction };

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

const bankOptions = [
    { id: 2, name: "BCP" },
    { id: 1, name: "BBVA" },
    { id: 4, name: "BanBif" },
    { id: 5, name: "Interbank" },
    { id: 3, name: "Scotiabank" },
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

const formatDay = (value: string) => {
    const date = parseDate(value);
    const weekday = new Intl.DateTimeFormat("es-PE", { weekday: "long", timeZone: "UTC" }).format(date);
    const day = new Intl.DateTimeFormat("es-PE", { day: "numeric", timeZone: "UTC" }).format(date);
    const month = ["Ene.", "Feb.", "Mar.", "Abr.", "May.", "Jun.", "Jul.", "Ago.", "Set.", "Oct.", "Nov.", "Dic."][date.getUTCMonth()];
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} de ${month}`;
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

const TabGroup = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
    <nav aria-label={label} role="tablist" className={cx("flex min-h-11 w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-secondary bg-primary p-1", className)}>{children}</nav>
);

const Tab = ({ active, children, onClick, title }: { active: boolean; children: ReactNode; onClick: () => void; title?: string }) => (
    <button type="button" role="tab" aria-selected={active} title={title} onClick={onClick} className={cx(
        "h-9 shrink-0 rounded-md px-3 text-sm font-semibold whitespace-nowrap transition duration-200",
        active ? "bg-brand-solid text-primary_on-brand shadow-xs" : "text-secondary hover:bg-primary_hover hover:text-primary",
    )}>{children}</button>
);

const Panel = ({ title, context, period, children }: { title: string; context?: string[]; period?: string; children: ReactNode }) => (
    <motion.section layout transition={{ duration: 0.2 }} className="atk-card rounded-xl border border-secondary bg-primary">
        <div className="atk-strip flex-wrap px-5">
            <h2 className="atk-strip-title">{title}</h2>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {context?.map((item) => <Badge key={item} size="sm" color="gray">{item}</Badge>)}
                <Badge size="sm" color="brand">Pago Deuda</Badge>
                {period && <Badge size="sm" color="blue">{period}</Badge>}
            </div>
        </div>
        <div className="p-5">{children}</div>
    </motion.section>
);

const MetricCard = ({ label, value, lines, tone = "default", compact = false, index, onClick }: {
    label: string;
    value: string;
    lines?: string[];
    tone?: "default" | "success" | "warning" | "error";
    compact?: boolean;
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
            "mt-2 break-words font-semibold tabular-nums",
            compact ? "text-[11px] leading-4" : "text-lg",
            tone === "success" && "text-success-primary",
            tone === "warning" && "text-warning-primary",
            tone === "error" && "text-error-primary",
            tone === "default" && "text-primary",
        )}>{value}</p>
        {lines?.length ? <div className="mt-2 space-y-1 text-[11px] text-tertiary">{lines.map((line) => <p key={line} className="truncate" title={line}>{line}</p>)}</div> : null}
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

export const MetricasPagoDeudaPage = () => {
    const { businessUser } = useAuth();
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const [period, setPeriod] = useState<Period>("week");
    const [dateRange, setDateRange] = useState(() => getDateRange("week"));
    const periodLabel = formatMetricasDateRange(dateRange.fechaDesde, dateRange.fechaHasta);
    const [branchId, setBranchId] = useState<number | null>(null);
    const [bankId, setBankId] = useState<number | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const pendingTableRef = useRef<HTMLDivElement>(null);
    const [commissionSort, setCommissionSort] = useState<SortState<keyof MetricasPagoDeudaComision & string>>({ column: "porcentaje", direction: "asc" });
    const [communitySort, setCommunitySort] = useState<SortState<keyof MetricasPagoDeudaComunidad & string>>({ column: "recaudacion", direction: "desc" });
    const [clientSort, setClientSort] = useState<SortState<keyof MetricasPagoDeudaCliente & string>>({ column: "operaciones", direction: "desc" });
    const [pendingSort, setPendingSort] = useState<SortState<keyof MetricasPagoDeudaPendiente & string>>({ column: "fecha", direction: "desc" });
    const [branchDistributionSort, setBranchDistributionSort] = useState<SortState<keyof MetricasPagoDeudaDistribucion & string>>({ column: "operaciones", direction: "desc" });
    const [bankDistributionSort, setBankDistributionSort] = useState<SortState<keyof MetricasPagoDeudaDistribucion & string>>({ column: "operaciones", direction: "desc" });
    const consulta = useMemo(() => userId ? ({ ...dateRange, idUsuarioConsulta: userId, idSucursal: branchId, idBancoCliente: bankId }) : null, [bankId, branchId, dateRange, userId]);
    const { data, isLoading, error, refresh } = useMetricasPagoDeuda(consulta);

    const activeBranch = branchId === null ? "Todas las sedes" : branchOptions.find((item) => item.id === branchId)?.name ?? "Sede seleccionada";
    const activeBank = bankId === null ? "Todos los bancos" : bankOptions.find((item) => item.id === bankId)?.name ?? "Banco seleccionado";
    const tableContext = [activeBranch, activeBank];
    const summary = data?.resumen;
    const bestDay = data?.serie.toSorted((a, b) => b.operaciones - a.operaciones || b.ganancias - a.ganancias)[0];
    const worstDay = data?.serie.toSorted((a, b) => a.operaciones - b.operaciones || a.ganancias - b.ganancias)[0];
    const bestCommunity = data?.comunidades.toSorted((a, b) => b.operaciones - a.operaciones || b.ganancias - a.ganancias)[0];
    const bestClient = data?.mejorCliente;
    const bestBranch = data?.mejorSede;
    const commissions = sortRows(data?.comisiones ?? [], commissionSort);
    const communities = sortRows(data?.comunidades ?? [], communitySort);
    const clients = sortRows(data?.clientes ?? [], clientSort);
    const pending = sortRows(data?.pendientes ?? [], pendingSort);
    const branchDistribution = sortRows(data?.distribucionSedes ?? [], branchDistributionSort);
    const bankDistribution = sortRows(data?.distribucionBancos ?? [], bankDistributionSort);

    const kpis = summary ? [
        { label: "Monto solicitado", value: formatMoney(summary.recaudacion), tone: "success" as const },
        { label: "Monto Transferido", value: formatMoney(summary.salida), tone: "error" as const },
        { label: "Comisiones", value: formatMoney(summary.comision), tone: "success" as const },
        { label: "Ganancia", value: formatMoney(summary.ganancias), tone: "success" as const },
        { label: "Solicitudes", value: integerFormatter.format(summary.operaciones) },
        { label: "Operaciones Pendientes", value: integerFormatter.format(summary.operacionesPendientes), lines: [formatMoney(summary.montoPendiente)], tone: "warning" as const, onClick: () => pendingTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        { label: "Clientes nuevos", value: integerFormatter.format(summary.clientesNuevos), tone: "success" as const },
        { label: "Mejor Día", value: bestDay ? formatDay(bestDay.periodo) : "-", lines: bestDay ? [`Operaciones: ${integerFormatter.format(bestDay.operaciones)}`, `Ganancia: ${formatMoney(bestDay.ganancias)}`] : ["Sin operaciones"], tone: "success" as const },
        { label: "Peor Día", value: worstDay ? formatDay(worstDay.periodo) : "-", lines: worstDay ? [`Operaciones: ${integerFormatter.format(worstDay.operaciones)}`, `Ganancia: ${formatMoney(worstDay.ganancias)}`] : ["Sin operaciones"], tone: "error" as const },
        { label: "Mejor Cliente", value: bestClient ? `${bestClient.nombreCompleto} - DNI: ${bestClient.dni}` : "-", lines: bestClient ? [`Operaciones: ${integerFormatter.format(bestClient.operaciones)}`, `Ganancia: ${formatMoney(bestClient.ganancias)}`] : ["Sin operaciones"], compact: true, tone: "success" as const },
        { label: "Mejor Comunidad", value: bestCommunity?.comunidad ?? "-", lines: bestCommunity ? [`Operaciones: ${integerFormatter.format(bestCommunity.operaciones)}`, `Ganancia: ${formatMoney(bestCommunity.ganancias)}`] : ["Sin operaciones"], tone: "success" as const },
        { label: "Mejor Sede", value: bestBranch?.sede ?? "-", lines: bestBranch ? [`Operaciones: ${integerFormatter.format(bestBranch.operaciones)}`, `Ganancia: ${formatMoney(bestBranch.ganancias)}`] : ["Sin operaciones"], tone: "success" as const },
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
    const reset = () => { setPeriod("week"); setDateRange(getDateRange("week")); setBranchId(null); setBankId(null); };
    const handleExport = async (format: MetricasExportFormat) => {
        if (!data || isExporting) return;
        setIsExporting(true);
        try {
            const distributionColumns = (firstHeader: string) => [
                { header: firstHeader, key: "nombre", width: 24 },
                { header: "Solicitudes", key: "operaciones", width: 14 },
                { header: "Atendidas", key: "atendidas", width: 14 },
                { header: "Pendientes", key: "pendientes", width: 14 },
                { header: "Monto Solicitado", key: "montoSolicitado", width: 19 },
                { header: "Monto Transferido", key: "montoTransferido", width: 19 },
                { header: "Ganancia", key: "ganancias", width: 17 },
                { header: "Clientes Nuevos", key: "clientesNuevos", width: 16 },
                { header: "Tasa Atención", key: "tasaAtencion", width: 15 },
            ];
            const mapDistribution = (rows: MetricasPagoDeudaDistribucion[]) => rows.map((row) => ({
                nombre: row.nombre,
                operaciones: row.operaciones,
                atendidas: row.atendidas,
                pendientes: row.pendientes,
                montoSolicitado: row.montoSolicitado,
                montoTransferido: row.montoTransferido,
                ganancias: row.ganancias,
                clientesNuevos: row.clientesNuevos,
                tasaAtencion: `${row.tasaAtencion.toFixed(2)}%`,
            }));
            const financialColumns = (firstHeader: string, firstKey: string) => [
                { header: firstHeader, key: firstKey, width: 22 },
                { header: "Solicitudes", key: "operaciones", width: 14 },
                { header: "Atendidas", key: "atendidas", width: 14 },
                { header: "Pendientes", key: "pendientes", width: 14 },
                { header: "Monto Solicitado", key: "recaudacion", width: 19 },
                { header: "Monto Transferido", key: "salida", width: 19 },
                { header: "Ganancia", key: "ganancias", width: 17 },
            ];
            const sections: MetricasReportSection[] = [
                { title: "Distribución por Sede", columns: distributionColumns("Sede"), rows: mapDistribution(data.distribucionSedes) },
                { title: "Distribución por Banco Solicitado", columns: distributionColumns("Banco Solicitado"), rows: mapDistribution(data.distribucionBancos) },
                {
                    title: "Distribución % Comisión",
                    columns: financialColumns("Comisión", "porcentaje"),
                    rows: data.comisiones.map((row) => ({
                        porcentaje: row.porcentaje / 100,
                        operaciones: row.operaciones,
                        atendidas: row.atendidas,
                        pendientes: row.pendientes,
                        recaudacion: row.recaudacion,
                        salida: row.salida,
                        ganancias: row.ganancias,
                    })),
                },
                {
                    title: "Distribución Comunidad",
                    columns: financialColumns("Comunidad", "comunidad"),
                    rows: data.comunidades.map((row) => ({
                        comunidad: row.comunidad,
                        operaciones: row.operaciones,
                        atendidas: row.atendidas,
                        pendientes: row.pendientes,
                        recaudacion: row.recaudacion,
                        salida: row.salida,
                        ganancias: row.ganancias,
                    })),
                },
                {
                    title: "Distribución Clientes con Más Solicitudes",
                    columns: [
                        { header: "DNI", key: "dni", width: 16 },
                        { header: "Nombre Completo", key: "nombre", width: 34 },
                        { header: "Comunidad", key: "comunidad", width: 20 },
                        ...financialColumns("Solicitudes", "operaciones"),
                    ],
                    rows: data.clientes.map((row) => ({
                        dni: row.dni,
                        nombre: row.nombreCompleto,
                        comunidad: row.comunidad,
                        operaciones: row.operaciones,
                        atendidas: row.atendidas,
                        pendientes: row.pendientes,
                        recaudacion: row.recaudacion,
                        salida: row.salida,
                        ganancias: row.ganancias,
                    })),
                },
                {
                    title: "Solicitudes Pendientes",
                    columns: [
                        { header: "DNI", key: "dni", width: 16 },
                        { header: "Cliente", key: "cliente", width: 34 },
                        { header: "Comunidad", key: "comunidad", width: 20 },
                        { header: "Banco", key: "banco", width: 18 },
                        { header: "Fecha", key: "fecha", width: 22 },
                        { header: "Monto Solicitado", key: "recaudacion", width: 19 },
                        { header: "Monto Transferido", key: "transferencia", width: 19 },
                        { header: "Ganancia", key: "ganancias", width: 17 },
                        { header: "Estado actual", key: "estado", width: 18 },
                    ],
                    rows: data.pendientes.map((row) => ({
                        dni: row.dni,
                        cliente: row.nombreCompleto,
                        comunidad: row.comunidad,
                        banco: row.banco,
                        fecha: row.fecha,
                        recaudacion: row.recaudacion,
                        transferencia: row.transferencia,
                        ganancias: row.ganancias,
                        estado: row.estado,
                    })),
                },
            ];
            await exportMetricasBancarias({
                servicio: "Pago Deuda",
                banco: activeBank ?? "Todos los bancos",
                empresa: activeBranch,
                fechaDesde: dateRange.fechaDesde,
                fechaHasta: dateRange.fechaHasta,
                kpis: kpis.map((item) => ({ indicador: item.label, valor: item.value, detalle: item.lines?.join(" | ") ?? "" })),
                sections,
                commissions: data.comisiones,
                communities: data.comunidades.map((row) => ({ ...row, idComunidad: row.idComunidad ?? 0 })),
                clients: data.clientes,
                pendingOperations: data.pendientes.map((row) => ({
                    ...row,
                    idCliente: null,
                    idComunidad: null,
                    ruta: row.banco.toLocaleLowerCase("es-PE"),
                    cuenta: row.banco,
                })),
            }, format);
        } finally {
            setIsExporting(false);
        }
    };

    return <AppLayout>
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <h1 className="text-display-xs font-semibold text-primary">Métricas Bancarias</h1>
                <Dropdown.Root>
                    <Button color="secondary" size="sm" iconLeading={Download01} iconTrailing={ChevronDown} isDisabled={!data || isLoading || isExporting}>{isExporting ? "Generando..." : "Descargar reporte"}</Button>
                    <Dropdown.Popover className="w-48">
                        <Dropdown.Menu>
                            <Dropdown.Item icon={File06} isDisabled={isExporting} onAction={() => void handleExport("xlsx")}>Excel</Dropdown.Item>
                            <Dropdown.Item icon={File07} isDisabled={isExporting} onAction={() => void handleExport("pdf")}>PDF</Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown.Root>
            </div>

            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-secondary bg-primary p-4 shadow-xs">
                <div className="mb-4 flex items-center gap-2"><BarChart03 className="size-5 text-fg-brand-primary" /><p className="text-sm font-semibold text-primary">Filtros</p></div>
                <div className="flex w-full flex-wrap items-center gap-2">
                    <MetricasServiceNavigation active="pago-deuda" />
                    <TabGroup label="Sedes">
                        <Tab active={branchId === null} onClick={() => { setBranchId(null); setBankId(null); }}>Todas</Tab>
                        {branchOptions.map((branch) => <Tab key={branch.id} active={branch.id === branchId} onClick={() => { setBranchId(branch.id); setBankId(null); }}>{branch.name}</Tab>)}
                    </TabGroup>
                    <TabGroup label="Bancos solicitados">
                        <Tab active={bankId === null} onClick={() => setBankId(null)}>Todos</Tab>
                        {bankOptions.map((bank) => <Tab key={bank.id} active={bank.id === bankId} onClick={() => setBankId(bank.id)}>{bank.name}</Tab>)}
                    </TabGroup>
                    <TabGroup label="Periodos">
                        {periodOptions.map((item) => <Tab key={item.value} active={period === item.value} onClick={() => handlePeriod(item.value)}>{item.label}</Tab>)}
                    </TabGroup>
                    <BasicDatePicker aria-label="Desde" value={parseCalendarDate(dateRange.fechaDesde)} maxValue={parseCalendarDate(getLimaToday())} onChange={(value) => value && handleDate("fechaDesde", value)} size="md" showYear={false} buttonClassName="h-11 w-fit justify-start" />
                    <BasicDatePicker aria-label="Hasta" value={parseCalendarDate(dateRange.fechaHasta)} maxValue={parseCalendarDate(getLimaToday())} onChange={(value) => value && handleDate("fechaHasta", value)} size="md" showYear={false} buttonClassName="h-11 w-fit justify-start" />
                    <UiTooltip title="Limpiar filtros" placement="top"><TooltipTrigger aria-label="Limpiar filtros" onPress={reset} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-secondary bg-primary text-fg-quaternary shadow-xs transition duration-200 hover:bg-primary_hover hover:text-fg-quaternary_hover"><Trash01 className="size-5" /></TooltipTrigger></UiTooltip>
                </div>
            </motion.section>

            {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error_subtle bg-error-primary p-4"><p className="text-sm font-semibold text-error-primary">{error}</p><Button size="sm" color="secondary" onClick={refresh}>Reintentar</Button></div>}

            <section>{isLoading && !data ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">{Array.from({ length: 12 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg bg-secondary" />)}</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">{kpis.map((item, index) => <MetricCard key={item.label} {...item} index={index} />)}</div>}</section>

            <Panel title="Distribución por Sede" context={tableContext} period={periodLabel}>
                <TableShell empty={!isLoading && !branchDistribution.length}><table className="w-full min-w-[1180px] border-collapse text-left text-sm"><thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                    {([[
                        "Sede", "nombre", "left"], ["Solicitudes", "operaciones", "right"], ["Atendidas", "atendidas", "right"], ["Pendientes", "pendientes", "right"], ["Monto Solicitado", "montoSolicitado", "right"], ["Monto Transferido", "montoTransferido", "right"], ["Ganancia", "ganancias", "right"], ["Clientes Nuevos", "clientesNuevos", "right"], ["Tasa Atención", "tasaAtencion", "right"]] as const).map(([label, column, align]) => <SortableHeader key={column} label={label} column={column} sort={branchDistributionSort} align={align} onSort={(value) => toggleSort(setBranchDistributionSort, value)} />)}
                </tr></thead><tbody className="divide-y divide-secondary">{branchDistribution.map((row) => <tr key={row.id ?? row.nombre} className="bg-primary hover:bg-primary_hover"><td className="px-4 py-3 font-semibold text-primary">{row.nombre}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.atendidas)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.pendientes)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.montoSolicitado)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.montoTransferido)}</td><td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.clientesNuevos)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{row.tasaAtencion.toFixed(2)}%</td></tr>)}</tbody></table></TableShell>
            </Panel>

            <Panel title="Distribución por Banco Solicitado" context={tableContext} period={periodLabel}>
                <TableShell empty={!isLoading && !bankDistribution.length}><table className="w-full min-w-[1180px] border-collapse text-left text-sm"><thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                    {([[
                        "Banco Solicitado", "nombre", "left"], ["Solicitudes", "operaciones", "right"], ["Atendidas", "atendidas", "right"], ["Pendientes", "pendientes", "right"], ["Monto Solicitado", "montoSolicitado", "right"], ["Monto Transferido", "montoTransferido", "right"], ["Ganancia", "ganancias", "right"], ["Clientes Nuevos", "clientesNuevos", "right"], ["Tasa Atención", "tasaAtencion", "right"]] as const).map(([label, column, align]) => <SortableHeader key={column} label={label} column={column} sort={bankDistributionSort} align={align} onSort={(value) => toggleSort(setBankDistributionSort, value)} />)}
                </tr></thead><tbody className="divide-y divide-secondary">{bankDistribution.map((row) => <tr key={row.id ?? row.nombre} className="bg-primary hover:bg-primary_hover"><td className="px-4 py-3 font-semibold text-primary">{row.nombre}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.atendidas)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.pendientes)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.montoSolicitado)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.montoTransferido)}</td><td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.clientesNuevos)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{row.tasaAtencion.toFixed(2)}%</td></tr>)}</tbody></table></TableShell>
            </Panel>

            <Panel title="Distribución % Comisión" context={tableContext} period={periodLabel}>
                <TableShell empty={!isLoading && !commissions.length}><table className="w-full min-w-[1180px] border-collapse text-left text-sm"><thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                    {([[
                        "Comisión", "porcentaje", "left"], ["Solicitudes", "operaciones", "right"], ["Atendidas", "atendidas", "right"], ["Pendientes", "pendientes", "right"], ["Monto Solicitado", "recaudacion", "right"], ["Monto Transferido", "salida", "right"], ["Ganancia", "ganancias", "right"], ["Clientes Nuevos", "clientesNuevos", "right"], ["Tasa Atención", "tasaAtencion", "right"]] as const).map(([label, column, align]) => <SortableHeader key={column} label={label} column={column} sort={commissionSort} align={align} onSort={(value) => toggleSort(setCommissionSort, value)} />)}
                </tr></thead><tbody className="divide-y divide-secondary">{commissions.map((row) => <tr key={row.porcentaje} className="bg-primary hover:bg-primary_hover"><td className="px-4 py-3 font-semibold text-primary">{row.porcentaje.toFixed(2)}%</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.atendidas)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.pendientes)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salida)}</td><td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.clientesNuevos)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{row.tasaAtencion.toFixed(2)}%</td></tr>)}</tbody></table></TableShell>
            </Panel>

            <Panel title="Distribución Comunidad" context={tableContext} period={periodLabel}>
                <TableShell empty={!isLoading && !communities.length}><table className="w-full min-w-[1280px] border-collapse text-left text-sm"><thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                    {([[
                        "Comunidad", "comunidad", "left"], ["Solicitudes", "operaciones", "right"], ["Atendidas", "atendidas", "right"], ["Pendientes", "pendientes", "right"], ["Monto Solicitado", "recaudacion", "right"], ["Monto Transferido", "salida", "right"], ["Ganancia", "ganancias", "right"], ["Clientes Nuevos", "clientesNuevos", "right"], ["Tasa Atención", "tasaAtencion", "right"]] as const).map(([label, column, align]) => <SortableHeader key={column} label={label} column={column} sort={communitySort} align={align} onSort={(value) => toggleSort(setCommunitySort, value)} />)}
                </tr></thead><tbody className="divide-y divide-secondary">{communities.map((row) => <tr key={`${row.idComunidad}-${row.comunidad}`} className="bg-primary hover:bg-primary_hover"><td className="px-4 py-3 font-semibold text-primary">{row.comunidad}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.atendidas)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.pendientes)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salida)}</td><td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.clientesNuevos)}</td><td className="px-4 py-3 text-right font-medium tabular-nums text-primary">{row.tasaAtencion.toFixed(2)}%</td></tr>)}</tbody></table></TableShell>
            </Panel>

            <Panel title="Distribución Clientes con Más Solicitudes" context={tableContext} period={periodLabel}>
                <TableShell empty={!isLoading && !clients.length}><table className="w-full min-w-[1220px] border-collapse text-left text-sm"><thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                    {([[
                        "DNI", "dni", "left"], ["Nombre Completo", "nombreCompleto", "left"], ["Comunidad", "comunidad", "left"], ["Solicitudes", "operaciones", "right"], ["Atendidas", "atendidas", "right"], ["Pendientes", "pendientes", "right"], ["Monto Solicitado", "recaudacion", "right"], ["Monto Transferido", "salida", "right"], ["Ganancia", "ganancias", "right"]] as const).map(([label, column, align]) => <SortableHeader key={column} label={label} column={column} sort={clientSort} align={align} onSort={(value) => toggleSort(setClientSort, value)} />)}
                </tr></thead><tbody className="divide-y divide-secondary">{clients.map((row) => <tr key={row.idCliente} className="bg-primary hover:bg-primary_hover"><td className="px-4 py-3 font-semibold text-primary">{row.dni}</td><td className="max-w-64 truncate px-4 py-3 font-medium text-primary" title={row.nombreCompleto}>{row.nombreCompleto}</td><td className="px-4 py-3 text-secondary">{row.comunidad}</td><td className="px-4 py-3 text-right tabular-nums text-secondary">{integerFormatter.format(row.operaciones)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{integerFormatter.format(row.atendidas)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{integerFormatter.format(row.pendientes)}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td><td className="px-4 py-3 text-right tabular-nums text-error-primary">{formatMoney(row.salida)}</td><td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td></tr>)}</tbody></table></TableShell>
            </Panel>

            <div ref={pendingTableRef} className="scroll-mt-6">
            <Panel title="Solicitudes Pendientes" context={tableContext} period={periodLabel}>
                <TableShell empty={!isLoading && !pending.length}><table className="w-full min-w-[1180px] border-collapse text-left text-sm"><thead className="bg-secondary text-xs uppercase text-tertiary"><tr>
                    {([[
                        "DNI", "dni", "left"], ["Cliente", "nombreCompleto", "left"], ["Comunidad", "comunidad", "left"], ["Banco", "banco", "left"], ["Fecha", "fecha", "left"], ["Monto Solicitado", "recaudacion", "right"], ["Monto Transferido", "transferencia", "right"], ["Ganancia", "ganancias", "right"], ["Estado actual", "estado", "left"]] as const).map(([label, column, align]) => <SortableHeader key={column} label={label} column={column} sort={pendingSort} align={align} onSort={(value) => toggleSort(setPendingSort, value)} />)}<th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr></thead><tbody className="divide-y divide-secondary">{pending.map((row) => <tr key={row.idOperacion} className="bg-primary hover:bg-primary_hover"><td className="px-4 py-3 text-secondary">{row.dni}</td><td className="max-w-64 truncate px-4 py-3 text-primary" title={row.nombreCompleto}>{row.nombreCompleto}</td><td className="px-4 py-3 text-secondary">{row.comunidad}</td><td className="px-4 py-3 text-secondary">{row.banco}</td><td className="px-4 py-3 whitespace-nowrap text-secondary">{row.fecha ? new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.fecha)) : "-"}</td><td className="px-4 py-3 text-right tabular-nums text-success-primary">{formatMoney(row.recaudacion)}</td><td className="px-4 py-3 text-right tabular-nums text-warning-primary">{formatMoney(row.transferencia)}</td><td className="px-4 py-3 text-right tabular-nums text-brand-secondary">{formatMoney(row.ganancias)}</td><td className="px-4 py-3 font-medium text-warning-primary">{row.estado}</td><td className="px-4 py-3 text-right"><RecordatorioEnviarModal idOperacion={row.idOperacion} /></td></tr>)}</tbody></table></TableShell>
            </Panel>
            </div>
        </div>
    </AppLayout>;
};
