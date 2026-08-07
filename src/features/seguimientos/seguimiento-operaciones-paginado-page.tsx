import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { formatInteger } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { bancariaRouteKeys, getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { seguimientosService, type SeguimientoPaginado } from "./seguimientos.service";
import { SeguimientoKpiGrid, SeguimientoOperationTable, SeguimientoPagoDeudaTable } from "./components/seguimiento-operation-table";

const tabs = ["Efectivizacion", "Derivados", "POS", "Pago Deuda"] as const;
type SeguimientoTab = (typeof tabs)[number];
const operationTabs = tabs.slice(0, 3);
const timeFilters = [
    { value: "MENOR_1_HORA", label: "<1h" },
    { value: "ENTRE_1_Y_2_HORAS", label: "1-<2h" },
    { value: "MAYOR_IGUAL_2_HORAS", label: ">=2h" },
] as const;
const emptyResult: SeguimientoPaginado = { rows: [], total: 0, total_paginas: 0, tiempo_menor_una_hora: 0, tiempo_entre_una_y_dos_horas: 0, tiempo_mayor_igual_dos_horas: 0, total_pendientes: 0 };
const emptyResults = (): Results => ({ Efectivizacion: emptyResult, Derivados: emptyResult, POS: emptyResult, "Pago Deuda": emptyResult });
const bankItems = bancariaRouteKeys.map((route) => ({ id: route, label: getRutaLabel(route) }));

type Results = Record<SeguimientoTab, SeguimientoPaginado>;

export const SeguimientoOperacionesPaginadoPage = ({ initialTab = "Efectivizacion" }: { initialTab?: SeguimientoTab }) => {
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
