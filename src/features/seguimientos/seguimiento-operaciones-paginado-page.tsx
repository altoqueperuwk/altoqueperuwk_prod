import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Tabs } from "@/components/application/tabs/tabs";
import { Badge, BadgeWithIcon } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Activity, Bank, Clock, Coins01, CreditCard01, Hourglass01, LayersThree01 } from "@untitledui/icons";
import { formatInteger } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { bancariaRouteKeys, getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { seguimientosService, type SeguimientoPaginado } from "./seguimientos.service";
import {
    SeguimientoKpiGrid,
    SeguimientoOperationTable,
    SeguimientoPagoDeudaTable,
    SeguimientoUnifiedTable,
} from "./components/seguimiento-operation-table";

const tabs = ["Efectivizacion", "Derivados", "POS", "Pago Deuda"] as const;
type SeguimientoTab = (typeof tabs)[number];
const operationTabs = tabs.slice(0, 3);
const flowFilters = ["Todos", "Efectivizacion", "POS", "Pago Deuda"] as const;
const timeFilters = [
    { value: "Todos", label: "Todos" },
    { value: "MENOR_1_HORA", label: "En Tiempo" },
    { value: "ENTRE_1_Y_2_HORAS", label: "Atencion Proxima" },
    { value: "MAYOR_IGUAL_2_HORAS", label: "Requiere Atencion" },
] as const;
const emptyResult: SeguimientoPaginado = { rows: [], total: 0, total_paginas: 0, tiempo_menor_una_hora: 0, tiempo_entre_una_y_dos_horas: 0, tiempo_mayor_igual_dos_horas: 0, total_pendientes: 0 };
const emptyResults = (): Results => ({ Efectivizacion: emptyResult, Derivados: emptyResult, POS: emptyResult, "Pago Deuda": emptyResult });
const bankItems = bancariaRouteKeys.map((route) => ({ id: route, label: getRutaLabel(route) }));
type Results = Record<SeguimientoTab, SeguimientoPaginado>;
type FlowFilter = (typeof flowFilters)[number];
type FlowCounts = Record<FlowFilter, number>;

const bankVisuals: Record<OperacionRutaBancaria | "todos", { icon: typeof Bank; tone: string }> = {
    todos: { icon: LayersThree01, tone: "text-fg-brand-secondary" },
    bcp: { icon: Bank, tone: "text-utility-blue-600" },
    bbva: { icon: Bank, tone: "text-utility-indigo-600" },
    scotiabank: { icon: Bank, tone: "text-utility-red-600" },
    banbif: { icon: Bank, tone: "text-utility-yellow-600" },
    interbank: { icon: Bank, tone: "text-utility-green-600" },
    safetypay: { icon: Bank, tone: "text-utility-purple-600" },
};

const flowVisuals: Record<(typeof flowFilters)[number], { icon: typeof Activity; description: string }> = {
    Todos: { icon: LayersThree01, description: "Todos los flujos" },
    Efectivizacion: { icon: CreditCard01, description: "Conversión de fondos" },
    POS: { icon: Activity, description: "Operaciones en punto de venta" },
    "Pago Deuda": { icon: Coins01, description: "Cancelación de deudas" },
};

const AttentionMetric = ({ label, value, color, icon: Icon }: { label: string; value: string; color: "success" | "warning" | "error"; icon: typeof Clock }) => (
    <div className="min-w-0 rounded-lg border border-secondary bg-primary p-3 shadow-xs">
        <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-tertiary">{label}</p>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-tertiary">
                <Icon className="size-4" />
            </span>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
            <p className="text-2xl font-semibold tabular-nums text-primary">{value}</p>
            <span className="text-xs text-tertiary">operaciones</span>
        </div>
        <Badge className="mt-3" type="pill-color" size="sm" color={color}>{color === "success" ? "En tiempo" : color === "warning" ? "Atención próxima" : "Requiere atención"}</Badge>
    </div>
);

const MinimalKpiCard = ({ label, value, color, badge }: { label: string; value: string; color: "brand" | "success" | "warning" | "error"; badge: string }) => (
    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-secondary bg-primary p-4 shadow-xs">
        <p className="text-xs font-medium text-tertiary">{label}</p>
        <p className="mt-3 text-2xl font-semibold tabular-nums text-primary">{value}</p>
        <Badge className="mt-3 self-start" type="pill-color" size="sm" color={color}>{badge}</Badge>
    </div>
);

export const SeguimientoOperacionesPaginadoPage = () => {
    const [selectedBank, setSelectedBank] = useState<OperacionRutaBancaria | "todos">("todos");
    const [selectedFlow, setSelectedFlow] = useState<(typeof flowFilters)[number]>("Todos");
    const [timeFilter, setTimeFilter] = useState("Todos");
    const [dni, setDni] = useState("");
    const [codigo, setCodigo] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [result, setResult] = useState<SeguimientoPaginado>(emptyResult);
    const [flowCounts, setFlowCounts] = useState<FlowCounts>({ Todos: 0, Efectivizacion: 0, POS: 0, "Pago Deuda": 0 });
    const [now, setNow] = useState(() => Date.now());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const request = {
                ruta: selectedBank === "todos" ? null : selectedBank,
                dni,
                codigo,
                filtroTiempo: timeFilter,
            };
            const currentRequest = seguimientosService.getOperacionesUnificadoPaginado({
                ...request,
                flujo: selectedFlow === "Todos" ? null : selectedFlow,
                page,
                pageSize,
            });
            const flowRequests = flowFilters.slice(1).map((flow) => flow === selectedFlow
                ? currentRequest
                : seguimientosService.getOperacionesUnificadoPaginado({ ...request, flujo: flow, page: 1, pageSize: 1 }));
            const [next, ...flowResults] = await Promise.all([currentRequest, ...flowRequests]);
            setResult(next ?? emptyResult);
            const nextFlowCounts = flowFilters.slice(1).reduce<FlowCounts>((counts, flow, index) => {
                counts[flow] = flowResults[index]?.total_pendientes ?? 0;
                return counts;
            }, { Todos: 0, Efectivizacion: 0, POS: 0, "Pago Deuda": 0 });
            nextFlowCounts.Todos = flowFilters.slice(1).reduce((total, flow) => total + nextFlowCounts[flow], 0);
            setFlowCounts(nextFlowCounts);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "No se pudo cargar Seguimiento Operaciones.");
        } finally {
            setIsLoading(false);
        }
    }, [codigo, dni, page, pageSize, selectedBank, selectedFlow, timeFilter]);

    useEffect(() => {
        void load();
        const refresh = window.setInterval(() => void load(), 60000);
        return () => window.clearInterval(refresh);
    }, [load]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const resetPage = () => setPage(1);
    const changePageSize = (size: number) => { setPageSize(size); resetPage(); };
    const bankMeta = bankVisuals[selectedBank];
    const SelectedBankIcon = bankMeta.icon;
    const FlowIcon = flowVisuals[selectedFlow].icon;
    const pagination = { page, totalPages: Math.max(1, result.total_paginas), pageSize, onPageChange: setPage, onPageSizeChange: changePageSize };

    return <AppLayout>
        <div className="flex flex-col gap-5">
            <div className="grid items-stretch gap-3 xl:grid-cols-[220px_220px_minmax(0,1fr)]">
                <section className="rounded-lg border border-secondary bg-primary p-3 shadow-xs">
                    <div className="grid grid-cols-2 gap-1.5">
                        <Button size="sm" color={selectedBank === "todos" ? "primary" : "secondary"} onClick={() => { setSelectedBank("todos"); resetPage(); }}>Todos</Button>
                        {bancariaRouteKeys.map((route) => <Button key={route} size="sm" color={selectedBank === route ? "primary" : "secondary"} onClick={() => { setSelectedBank(route); resetPage(); }}>{getRutaLabel(route)}</Button>)}
                    </div>
                </section>

                <section className="rounded-lg border border-secondary bg-primary p-3 shadow-xs">
                    <div className="grid gap-1.5">
                        {flowFilters.map((flow) => (
                            <Button key={flow} size="sm" className="w-full" color={selectedFlow === flow ? "primary" : "secondary"} onClick={() => { setSelectedFlow(flow); resetPage(); }}>
                                <span className="relative flex w-full items-center justify-center pr-8">
                                    <span className="whitespace-nowrap">{flow}</span>
                                    <span className="absolute right-0 -my-px size-max rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-primary ring-inset shadow-xs-skeuomorphic tabular-nums">
                                        {isLoading ? "-" : formatInteger(flowCounts[flow])}
                                    </span>
                                </span>
                            </Button>
                        ))}
                    </div>
                </section>

                <section className="rounded-lg border border-secondary bg-primary p-3 shadow-xs">
                    <div className="grid h-full gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <MinimalKpiCard label="Operaciones Pendientes" value={isLoading ? "-" : formatInteger(result.total_pendientes)} color="brand" badge="En cola" />
                        <MinimalKpiCard label="Menos de 1 hora" value={formatInteger(result.tiempo_menor_una_hora)} color="success" badge="En tiempo" />
                        <MinimalKpiCard label="Menos de 2 horas" value={formatInteger(result.tiempo_entre_una_y_dos_horas)} color="warning" badge="Atención próxima" />
                        <MinimalKpiCard label="Más de 2 horas" value={formatInteger(result.tiempo_mayor_igual_dos_horas)} color="error" badge="Requiere atención" />
                    </div>
                </section>
            </div>

            <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
                <div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3 sm:px-5">
                    <Input size="sm" aria-label="DNI" className="w-full sm:w-44" placeholder="DNI" value={dni} onChange={(value) => { setDni(value); resetPage(); }} />
                    <Input size="sm" aria-label="Código de operación" className="w-full sm:w-48" placeholder="Código de operación" value={codigo} onChange={(value) => { setCodigo(value); resetPage(); }} />
                    <div className="flex flex-wrap gap-1 rounded-lg bg-primary p-1">
                        {timeFilters.map((filter) => <Button key={filter.value} size="sm" color={timeFilter === filter.value ? "primary" : "secondary"} onClick={() => { setTimeFilter(filter.value); resetPage(); }}>{filter.label}</Button>)}
                    </div>
                </div>
                {error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}
                <SeguimientoUnifiedTable data={result.rows} isLoading={isLoading} now={now} pagination={pagination} />
            </section>
        </div>
    </AppLayout>;
};

const LegacyRedesignedSeguimientoPage = () => {
    const [selectedBank, setSelectedBank] = useState<OperacionRutaBancaria | "todos">("todos");
    const [selectedFlow, setSelectedFlow] = useState<(typeof flowFilters)[number]>("Todos");
    const [timeFilter, setTimeFilter] = useState("Todos");
    const [dni, setDni] = useState("");
    const [codigo, setCodigo] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [result, setResult] = useState<SeguimientoPaginado>(emptyResult);
    const [now, setNow] = useState(() => Date.now());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const next = await seguimientosService.getOperacionesUnificadoPaginado({
                ruta: selectedBank === "todos" ? null : selectedBank,
                flujo: selectedFlow === "Todos" ? null : selectedFlow,
                dni,
                codigo,
                filtroTiempo: timeFilter,
                page,
                pageSize,
            });
            setResult(next ?? emptyResult);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "No se pudo cargar Seguimiento Operaciones.");
        } finally {
            setIsLoading(false);
        }
    }, [codigo, dni, page, pageSize, selectedBank, selectedFlow, timeFilter]);

    useEffect(() => {
        void load();
        const refresh = window.setInterval(() => void load(), 60000);
        return () => window.clearInterval(refresh);
    }, [load]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const resetPage = () => setPage(1);
    const changePageSize = (size: number) => { setPageSize(size); resetPage(); };
    const bankMeta = bankVisuals[selectedBank];
    const SelectedBankIcon = bankMeta.icon;
    const FlowIcon = flowVisuals[selectedFlow].icon;
    const pagination = { page, totalPages: Math.max(1, result.total_paginas), pageSize, onPageChange: setPage, onPageSizeChange: changePageSize };

    return <AppLayout>
        <div className="flex flex-col gap-5">
            <div>
                <p className="text-sm font-semibold text-brand-secondary">Control operativo</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">Seguimiento Operaciones</h1>
                <p className="mt-1 max-w-2xl text-sm text-tertiary">Una vista compacta para priorizar las operaciones que requieren atención.</p>
            </div>

            <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
                <div className="border-b border-secondary px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-full bg-brand-primary text-white"><Bank className="size-4" /></span>
                        <div>
                            <h2 className="text-sm font-semibold text-primary">Bancos</h2>
                            <p className="text-xs text-tertiary">Selecciona un banco para concentrar la consulta.</p>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                        <Button
                            size="sm"
                            color={selectedBank === "todos" ? "primary" : "secondary"}
                            className="shrink-0"
                            onClick={() => { setSelectedBank("todos"); resetPage(); }}
                        >
                            <LayersThree01 className="size-4" />
                            Todos
                            <Badge type="pill-color" size="sm" color="gray">{formatInteger(result.total)}</Badge>
                        </Button>
                        {bancariaRouteKeys.map((route) => {
                            const Icon = bankVisuals[route].icon;
                            return <Button key={route} size="sm" color={selectedBank === route ? "primary" : "secondary"} className="shrink-0" onClick={() => { setSelectedBank(route); resetPage(); }}>
                                <span className={`flex size-5 items-center justify-center rounded-full bg-secondary ${bankVisuals[route].tone}`}><Icon className="size-3.5" /></span>
                                {getRutaLabel(route)}
                            </Button>;
                        })}
                    </div>
                </div>

                <div className="px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-full bg-brand-primary text-white"><Activity className="size-4" /></span>
                        <div>
                            <h2 className="text-sm font-semibold text-primary">Flujos</h2>
                            <p className="text-xs text-tertiary">Filtra la operación por flujo de negocio.</p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        {flowFilters.map((flow) => {
                            const Icon = flowVisuals[flow].icon;
                            return <Button key={flow} size="sm" color={selectedFlow === flow ? "primary" : "secondary"} className="h-auto min-h-12 justify-start text-left" onClick={() => { setSelectedFlow(flow); resetPage(); }}>
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary"><Icon className="size-4" /></span>
                                <span className="flex min-w-0 flex-col items-start">
                                    <span className="truncate font-semibold">{flow}</span>
                                    <span className="truncate text-xs opacity-75">{flowVisuals[flow].description}</span>
                                </span>
                            </Button>;
                        })}
                    </div>
                </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,2.2fr)]">
                <section className="rounded-lg border border-secondary bg-primary p-5 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Resumen</p>
                            <h2 className="mt-1 text-sm font-semibold text-primary">Operaciones pendientes</h2>
                        </div>
                        <span className="flex size-9 items-center justify-center rounded-full bg-brand-secondary text-brand-secondary"><Hourglass01 className="size-5" /></span>
                    </div>
                    <p className="mt-6 text-4xl font-semibold tabular-nums text-primary">{isLoading ? "-" : formatInteger(result.total_pendientes)}</p>
                    <p className="mt-1 text-sm text-tertiary">en cola de atención</p>
                    <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: result.total_pendientes ? "100%" : "0%" }} />
                    </div>
                </section>

                <section className="rounded-lg border border-secondary bg-primary p-5 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Atención</p>
                            <h2 className="mt-1 text-sm font-semibold text-primary">Tiempo de atención</h2>
                        </div>
                        <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-tertiary"><Clock className="size-5" /></span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <AttentionMetric label="Menos de 1 hora" value={formatInteger(result.tiempo_menor_una_hora)} color="success" icon={Clock} />
                        <AttentionMetric label="De 1 a menos de 2 horas" value={formatInteger(result.tiempo_entre_una_y_dos_horas)} color="warning" icon={Clock} />
                        <AttentionMetric label="2 horas o más" value={formatInteger(result.tiempo_mayor_igual_dos_horas)} color="error" icon={Clock} />
                    </div>
                </section>
            </div>

            <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary ${bankMeta.tone}`}><SelectedBankIcon className="size-4" /></span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-primary">{selectedBank === "todos" ? "Todas las operaciones" : getRutaLabel(selectedBank)}</p>
                            <p className="truncate text-xs text-tertiary">{selectedFlow === "Todos" ? "Todos los flujos" : `${selectedFlow} · solo pendientes`}</p>
                        </div>
                    </div>
                    <BadgeWithIcon type="pill-color" size="sm" color="gray" iconLeading={FlowIcon}>{formatInteger(result.total)} operaciones</BadgeWithIcon>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3 sm:px-5">
                    <Input aria-label="DNI" className="w-full sm:w-44" placeholder="DNI" value={dni} onChange={(value) => { setDni(value); resetPage(); }} />
                    <Input aria-label="Código de operación" className="w-full sm:w-48" placeholder="Código de operación" value={codigo} onChange={(value) => { setCodigo(value); resetPage(); }} />
                    <div className="flex flex-wrap gap-1.5">
                        {timeFilters.map((filter) => <Button key={filter.value} size="sm" color={timeFilter === filter.value ? "primary" : "tertiary"} onClick={() => { setTimeFilter(filter.value); resetPage(); }}>{filter.label}</Button>)}
                    </div>
                </div>
                {error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}
                <SeguimientoUnifiedTable data={result.rows} isLoading={isLoading} now={now} pagination={pagination} />
            </section>
        </div>
    </AppLayout>;
};

const LegacyVisualSeguimientoPage = () => {
    const [selectedBank, setSelectedBank] = useState<OperacionRutaBancaria | "todos">("todos");
    const [selectedFlow, setSelectedFlow] = useState<(typeof flowFilters)[number]>("Todos");
    const [timeFilter, setTimeFilter] = useState("Todos");
    const [dni, setDni] = useState("");
    const [codigo, setCodigo] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [result, setResult] = useState<SeguimientoPaginado>(emptyResult);
    const [now, setNow] = useState(() => Date.now());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const next = await seguimientosService.getOperacionesUnificadoPaginado({
                ruta: selectedBank === "todos" ? null : selectedBank,
                flujo: selectedFlow === "Todos" ? null : selectedFlow,
                dni,
                codigo,
                filtroTiempo: timeFilter,
                page,
                pageSize,
            });
            setResult(next ?? emptyResult);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "No se pudo cargar Seguimiento Operaciones.");
        } finally {
            setIsLoading(false);
        }
    }, [codigo, dni, page, pageSize, selectedBank, selectedFlow, timeFilter]);

    useEffect(() => {
        void load();
        const refresh = window.setInterval(() => void load(), 60000);
        return () => window.clearInterval(refresh);
    }, [load]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const resetPage = () => setPage(1);
    const changePageSize = (size: number) => { setPageSize(size); resetPage(); };
    const pagination = { page, totalPages: Math.max(1, result.total_paginas), pageSize, onPageChange: setPage, onPageSizeChange: changePageSize };

    return <AppLayout>
        <div className="flex flex-col gap-4">
            <div>
                <h1 className="text-xl font-semibold text-primary">Seguimiento Operaciones</h1>
                <p className="mt-1 text-sm text-tertiary">Consulta global de operaciones y tiempos de atención.</p>
            </div>
            <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
                <div className="border-b border-secondary p-3">
                    <div className="flex flex-wrap gap-2" aria-label="Filtrar por banco">
                        <Button size="sm" color={selectedBank === "todos" ? "primary" : "tertiary"} onClick={() => { setSelectedBank("todos"); resetPage(); }}>Todos</Button>
                        {bancariaRouteKeys.map((route) => <Button key={route} size="sm" color={selectedBank === route ? "primary" : "tertiary"} onClick={() => { setSelectedBank(route); resetPage(); }}>{getRutaLabel(route)}</Button>)}
                    </div>
                </div>
                <div className="border-b border-secondary p-3">
                    <div className="flex flex-wrap gap-2" aria-label="Filtrar por flujo">
                        {flowFilters.map((flow) => <Button key={flow} size="sm" color={selectedFlow === flow ? "primary" : "tertiary"} onClick={() => { setSelectedFlow(flow); resetPage(); }}>{flow}</Button>)}
                    </div>
                </div>
                <div className="grid gap-4 border-b border-secondary p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    <section className="rounded-lg border border-secondary p-3">
                        <p className="mb-3 text-sm font-semibold text-primary">Resumen de pendientes</p>
                        <SeguimientoKpiGrid items={[{ label: "Total de operaciones pendientes", value: formatInteger(result.total_pendientes) }]} isLoading={isLoading} />
                    </section>
                    <section className="rounded-lg border border-secondary p-3">
                        <p className="mb-3 text-sm font-semibold text-primary">Tiempo de atención</p>
                        <SeguimientoKpiGrid items={[
                            { label: "Menos de 1 hora", value: formatInteger(result.tiempo_menor_una_hora) },
                            { label: "De 1 a menos de 2 horas", value: formatInteger(result.tiempo_entre_una_y_dos_horas) },
                            { label: "2 horas o más", value: formatInteger(result.tiempo_mayor_igual_dos_horas) },
                        ]} isLoading={isLoading} />
                    </section>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3">
                    <Input aria-label="DNI" className="w-48" placeholder="DNI" value={dni} onChange={(value) => { setDni(value); resetPage(); }} />
                    <Input aria-label="Código de operación" className="w-48" placeholder="Código de operación" value={codigo} onChange={(value) => { setCodigo(value); resetPage(); }} />
                    {timeFilters.map((filter) => <Button key={filter.value} size="sm" color={timeFilter === filter.value ? "primary" : "tertiary"} onClick={() => { setTimeFilter(filter.value); resetPage(); }}>{filter.label}</Button>)}
                </div>
                {error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}
                <SeguimientoUnifiedTable data={result.rows} isLoading={isLoading} now={now} pagination={pagination} />
            </section>
        </div>
    </AppLayout>;
};

const LegacySeguimientoOperacionesPaginadoPage = ({ initialTab = "Efectivizacion" }: { initialTab?: SeguimientoTab }) => {
    const [selectedBank, setSelectedBank] = useState<OperacionRutaBancaria>("bcp");
    const [activeTab, setActiveTab] = useState<SeguimientoTab>(initialTab);
    const [stateFilter, setStateFilter] = useState(initialTab === "Pago Deuda" ? "Todos" : "Pendiente");
    const [timeFilter, setTimeFilter] = useState("Todos");
    const [dni, setDni] = useState("");
    const [codigo, setCodigo] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [results, setResults] = useState<Results>(emptyResults());
    const [now, setNow] = useState(() => Date.now());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const effectRequests = operationTabs.map((tab) => seguimientosService.getEfectivizacionPaginado({
                tab,
                ruta: selectedBank,
                filtroEstado: stateFilter,
                dni,
                codigo,
                filtroTiempo: timeFilter,
                page: activeTab === tab ? page : 1,
                pageSize: activeTab === tab ? pageSize : 1,
            }));
            const paymentRequest = seguimientosService.getPagoDeudaPaginado({
                ruta: selectedBank,
                filtroEstado: stateFilter,
                dni,
                codigo,
                filtroTiempo: timeFilter,
                page: activeTab === "Pago Deuda" ? page : 1,
                pageSize: activeTab === "Pago Deuda" ? pageSize : 1,
            });
            const [effectResults, paymentResult] = await Promise.all([Promise.all(effectRequests), paymentRequest]);
            setResults({ Efectivizacion: effectResults[0] ?? emptyResult, Derivados: effectResults[1] ?? emptyResult, POS: effectResults[2] ?? emptyResult, "Pago Deuda": paymentResult ?? emptyResult });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "No se pudo cargar Seguimiento Operaciones.");
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, codigo, dni, page, pageSize, selectedBank, stateFilter, timeFilter]);

    useEffect(() => {
        void load();
        const refresh = window.setInterval(() => void load(), 60000);
        return () => window.clearInterval(refresh);
    }, [load]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const current = results[activeTab];
    const kpiItems = useMemo(() => [
        { label: "Menos de 1 hora", value: formatInteger(current.tiempo_menor_una_hora) },
        { label: "De 1 a menos de 2 horas", value: formatInteger(current.tiempo_entre_una_y_dos_horas) },
        { label: "2 horas o más", value: formatInteger(current.tiempo_mayor_igual_dos_horas) },
    ], [current]);

    const resetPage = () => setPage(1);
    const changeBank = (value: string) => { setSelectedBank(value as OperacionRutaBancaria); setStateFilter(activeTab === "Pago Deuda" ? "Todos" : "Pendiente"); setTimeFilter("Todos"); setPage(1); };
    const changeTab = (tab: SeguimientoTab) => { setActiveTab(tab); setStateFilter(tab === "Pago Deuda" ? "Todos" : "Pendiente"); setTimeFilter("Todos"); setPage(1); };
    const changePageSize = (size: number) => { setPageSize(size); setPage(1); };
    // Filtros anteriores conservados para reactivar operaciones pagadas si el alcance cambia:
    // const stateFilters = activeTab === "Pago Deuda" ? ["Todos", "Pendiente Transferencia", "Pendiente Devolucion", "Pendiente Comision", "Pagado"] : ["Todos", "Pendiente", "Pagado"];
    const stateFilters = activeTab === "Pago Deuda" ? ["Todos", "Pendiente Transferencia", "Pendiente Devolucion", "Pendiente Comision"] : ["Pendiente"];
    const serverPagination = { page, totalPages: Math.max(1, current.total_paginas), pageSize, onPageChange: setPage, onPageSizeChange: changePageSize };

    return <AppLayout><div className="flex flex-col gap-4">
        <div>
            <h1 className="text-xl font-semibold text-primary">Seguimiento Operaciones</h1>
            <p className="mt-1 text-sm text-tertiary">Consulta global de operaciones y tiempos de atención.</p>
        </div>
        <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
            <div className="border-b border-secondary p-3">
                <Tabs selectedKey={selectedBank} onSelectionChange={(key) => changeBank(String(key))}>
                    <Tabs.List type="button-border" size="sm" aria-label="Consulta por banco">
                        {bankItems.map((item) => <Tabs.Item key={item.id} id={item.id}>{item.label}</Tabs.Item>)}
                    </Tabs.List>
                </Tabs>
            </div>
            <div className="border-b border-secondary p-3">
                <Tabs selectedKey={activeTab} onSelectionChange={(key) => changeTab(String(key) as SeguimientoTab)}>
                    <Tabs.List type="button-border" size="sm" aria-label="Seguimiento de operaciones">
                        {tabs.map((tab) => <Tabs.Item key={tab} id={tab} badge={results[tab].total_pendientes || undefined}>{tab}</Tabs.Item>)}
                    </Tabs.List>
                </Tabs>
            </div>
            <div className="border-b border-secondary p-3">
                <SeguimientoKpiGrid items={kpiItems} isLoading={isLoading} />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3">
                <Input aria-label="DNI" className="w-48" placeholder="DNI" value={dni} onChange={(value) => { setDni(value); resetPage(); }} />
                <Input aria-label="Cod. Op." className="w-48" placeholder="Cod. Op." value={codigo} onChange={(value) => { setCodigo(value); resetPage(); }} />
                {stateFilters.map((filter) => <Button key={filter} size="sm" color={stateFilter === filter ? "primary" : "tertiary"} onClick={() => { setStateFilter(filter); resetPage(); }}>{filter}</Button>)}
                {timeFilters.map((filter) => <Button key={filter.value} size="sm" color={timeFilter === filter.value ? "primary" : "tertiary"} onClick={() => { setTimeFilter(filter.value); resetPage(); }}>{filter.label}</Button>)}
            </div>
            {error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}
            {activeTab === "Pago Deuda" ? <SeguimientoPagoDeudaTable data={current.rows} isLoading={isLoading} now={now} pagination={serverPagination} /> : <SeguimientoOperationTable data={current.rows} isLoading={isLoading} tab={activeTab} now={now} pagination={serverPagination} />}
        </section>
    </div></AppLayout>;
};
