import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { seguimientosService, type SeguimientoEfectivizacionKpi, type SeguimientoPagoDeudaKpi } from "./seguimientos.service";
import { SeguimientoKpiGrid, SeguimientoOperationTable, SeguimientoPagoDeudaTable } from "./components/seguimiento-operation-table";

const operationTabs = ["Efectivizacion", "Derivados", "POS"] as const;
type OperationTab = (typeof operationTabs)[number];
export type SeguimientoSection = "Efectivizacion" | "Pago Deuda";
const isPaid = (row: OperacionProceso) => String(row.nombre_estado ?? "").toUpperCase() === "PAGADO";
const isPaymentPaid = (row: OperacionProceso) => String((row as unknown as Record<string, unknown>).seguimiento_estado ?? "").toUpperCase() === "PAGADO";

export const SeguimientoOperacionesPage = ({ initialSection = "Efectivizacion" }: { initialSection?: SeguimientoSection }) => {
    const [section, setSection] = useState<SeguimientoSection>(initialSection);
    const [activeTab, setActiveTab] = useState<OperationTab>("Efectivizacion");
    const [operationFilter, setOperationFilter] = useState("Pendiente");
    const [paymentFilter, setPaymentFilter] = useState("Todos");
    const [dni, setDni] = useState("");
    const [codigo, setCodigo] = useState("");
    const [operationRows, setOperationRows] = useState<Record<OperationTab, OperacionProceso[]>>({ Efectivizacion: [], Derivados: [], POS: [] });
    const [paymentRows, setPaymentRows] = useState<OperacionProceso[]>([]);
    const [operationKpi, setOperationKpi] = useState<SeguimientoEfectivizacionKpi | null>(null);
    const [paymentKpi, setPaymentKpi] = useState<SeguimientoPagoDeudaKpi | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;
        setIsLoading(true);
        setError(null);
        Promise.all([
            seguimientosService.getEfectivizacionKpi(),
            ...operationTabs.map((tab) => seguimientosService.getEfectivizacionBandeja({ tab, filtroEstado: "Todos", dni, codigo })),
            seguimientosService.getPagoDeudaKpi(),
            seguimientosService.getPagoDeudaBandeja({ filtroEstado: "Todos", dni, codigo }),
        ]).then((response) => {
            const [operationKpiRows, effectRows, derivedRows, posRows, paymentKpiRows, paymentOperationRows] = response as [
                SeguimientoEfectivizacionKpi[],
                OperacionProceso[],
                OperacionProceso[],
                OperacionProceso[],
                SeguimientoPagoDeudaKpi[],
                OperacionProceso[],
            ];
            if (ignore) return;
            setOperationKpi(operationKpiRows[0] ?? null);
            setOperationRows({ Efectivizacion: effectRows ?? [], Derivados: derivedRows ?? [], POS: posRows ?? [] });
            setPaymentKpi(paymentKpiRows[0] ?? null);
            setPaymentRows(paymentOperationRows ?? []);
        }).catch((reason: unknown) => {
            if (!ignore) setError(reason instanceof Error ? reason.message : "No se pudo cargar Seguimiento Operaciones.");
        }).finally(() => { if (!ignore) setIsLoading(false); });
        return () => { ignore = true; };
    }, [codigo, dni]);

    const hasPending = useMemo(() => Object.values(operationRows).some((rows) => rows.some((row) => !isPaid(row))) || paymentRows.some((row) => !isPaymentPaid(row)), [operationRows, paymentRows]);
    useEffect(() => {
        if (!hasPending) return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [hasPending]);

    const visibleOperationRows = useMemo(() => {
        const current = operationRows[activeTab];
        if (operationFilter === "Todos") return current;
        return current.filter((row) => operationFilter === "Pagado" ? isPaid(row) : !isPaid(row));
    }, [activeTab, operationFilter, operationRows]);
    const visiblePaymentRows = useMemo(() => paymentFilter === "Todos" ? paymentRows : paymentRows.filter((row) => String((row as unknown as Record<string, unknown>).seguimiento_estado ?? "") === paymentFilter), [paymentFilter, paymentRows]);

    const operationKpiItems = [
        { label: "Total Operaciones Pendiente", value: formatInteger(operationKpi?.total_operaciones_pendientes) },
        { label: "Total Operaciones Pagados", value: formatInteger(operationKpi?.total_operaciones_pagados) },
        { label: "Total Monto Depositos", value: formatMoney(operationKpi?.total_monto_depositos), valueClassName: "text-concept-ingreso" },
        { label: "Total Monto Comisiones", value: formatMoney(operationKpi?.total_monto_comisiones), valueClassName: "text-concept-gasto" },
        { label: "Total Monto Transferencia", value: formatMoney(operationKpi?.total_monto_transferencia), valueClassName: "text-concept-salida" },
    ];
    const paymentKpiItems = [
        { label: "Total Operaciones Pendientes", value: formatInteger(paymentKpi?.total_operaciones_pendientes) },
        { label: "Total Operaciones Pagados", value: formatInteger(paymentKpi?.total_operaciones_pagados) },
        { label: "Total Monto Solicitados", value: formatMoney(paymentKpi?.total_monto_solicitados), valueClassName: "text-concept-ingreso" },
        { label: "Total Comisiones", value: formatMoney(paymentKpi?.total_comisiones), valueClassName: "text-concept-gasto" },
        { label: "Total Monto Devueltos", value: formatMoney(paymentKpi?.total_monto_devueltos), valueClassName: "text-concept-salida" },
    ];

    return <AppLayout><div className="flex flex-col gap-4">
        <div><h1 className="text-xl font-semibold text-primary">Seguimiento Operaciones</h1><p className="mt-1 text-sm text-tertiary">Consulta global de operaciones y tiempos de atención.</p></div>
        <Tabs selectedKey={section} onSelectionChange={(key) => setSection(String(key) as SeguimientoSection)}><Tabs.List type="button-border" size="sm" aria-label="Sección de seguimiento"><Tabs.Item id="Efectivizacion">Efectivizacion</Tabs.Item><Tabs.Item id="Pago Deuda" badge={paymentRows.filter((row) => !isPaymentPaid(row)).length || undefined}>Pago Deuda</Tabs.Item></Tabs.List></Tabs>
        <SeguimientoKpiGrid items={section === "Efectivizacion" ? operationKpiItems : paymentKpiItems} isLoading={isLoading} />
        <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
            {section === "Efectivizacion" ? <><div className="border-b border-secondary p-3"><Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key) as OperationTab)}><Tabs.List type="button-border" size="sm" aria-label="Seguimiento de efectivización">{operationTabs.map((tab) => <Tabs.Item key={tab} id={tab} badge={operationRows[tab].filter((row) => !isPaid(row)).length || undefined}>{tab}</Tabs.Item>)}</Tabs.List></Tabs></div><div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3"><Input aria-label="DNI" className="w-48" placeholder="DNI" value={dni} onChange={setDni} /><Input aria-label="Cod. Op." className="w-48" placeholder="Cod. Op." value={codigo} onChange={setCodigo} />{["Todos", "Pendiente", "Pagado"].map((filter) => <Button key={filter} size="sm" color={operationFilter === filter ? "primary" : "tertiary"} onClick={() => setOperationFilter(filter)}>{filter}</Button>)}</div>{error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}<SeguimientoOperationTable data={visibleOperationRows} isLoading={isLoading} tab={activeTab} now={now} /></> : <><div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3"><Input aria-label="DNI" className="w-48" placeholder="DNI" value={dni} onChange={setDni} /><Input aria-label="Cod. Op." className="w-48" placeholder="Cod. Op." value={codigo} onChange={setCodigo} />{["Todos", "Pendiente Transferencia", "Pendiente Devolucion", "Pendiente Comision"].map((filter) => <Button key={filter} size="sm" color={paymentFilter === filter ? "primary" : "tertiary"} onClick={() => setPaymentFilter(filter)}>{filter}</Button>)}</div>{error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}<SeguimientoPagoDeudaTable data={visiblePaymentRows} isLoading={isLoading} now={now} /></>}
        </section>
    </div></AppLayout>;
};
