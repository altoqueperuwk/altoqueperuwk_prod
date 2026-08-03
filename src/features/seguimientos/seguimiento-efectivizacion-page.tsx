import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { seguimientosService, type SeguimientoEfectivizacionKpi } from "./seguimientos.service";
import { SeguimientoKpiGrid, SeguimientoOperationTable } from "./components/seguimiento-operation-table";

const tabs = ["Efectivizacion", "Derivados", "POS"] as const;
type SeguimientoTab = (typeof tabs)[number];

const isPaid = (row: OperacionProceso) => String(row.nombre_estado ?? "").toUpperCase() === "PAGADO";

export const SeguimientoEfectivizacionPage = () => {
    const [activeTab, setActiveTab] = useState<SeguimientoTab>("Efectivizacion");
    const [activeFilter, setActiveFilter] = useState("Pendiente");
    const [dni, setDni] = useState("");
    const [codigo, setCodigo] = useState("");
    const [rows, setRows] = useState<Record<SeguimientoTab, OperacionProceso[]>>({ Efectivizacion: [], Derivados: [], POS: [] });
    const [kpi, setKpi] = useState<SeguimientoEfectivizacionKpi | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;
        setIsLoading(true);
        setError(null);
        Promise.all([
            seguimientosService.getEfectivizacionKpi(),
            ...tabs.map((tab) => seguimientosService.getEfectivizacionBandeja({ tab, filtroEstado: "Todos", dni, codigo })),
        ]).then(([kpiRows, effectRows, derivedRows, posRows]) => {
            if (ignore) return;
            setKpi(kpiRows[0] ?? null);
            setRows({ Efectivizacion: effectRows ?? [], Derivados: derivedRows ?? [], POS: posRows ?? [] });
        }).catch((reason: unknown) => {
            if (!ignore) setError(reason instanceof Error ? reason.message : "No se pudo cargar Seguimientos.");
        }).finally(() => {
            if (!ignore) setIsLoading(false);
        });
        return () => { ignore = true; };
    }, [codigo, dni]);

    const visibleRows = useMemo(() => {
        const current = rows[activeTab];
        if (activeFilter === "Todos") return current;
        return current.filter((row) => activeFilter === "Pagado" ? isPaid(row) : !isPaid(row));
    }, [activeFilter, activeTab, rows]);

    const kpiItems = [
        { label: "Total Operaciones Pendiente", value: formatInteger(kpi?.total_operaciones_pendientes) },
        { label: "Total Operaciones Pagados", value: formatInteger(kpi?.total_operaciones_pagados) },
        { label: "Total Monto Depositos", value: formatMoney(kpi?.total_monto_depositos), valueClassName: "text-concept-ingreso" },
        { label: "Total Monto Comisiones", value: formatMoney(kpi?.total_monto_comisiones), valueClassName: "text-concept-gasto" },
        { label: "Total Monto Transferencia", value: formatMoney(kpi?.total_monto_transferencia), valueClassName: "text-concept-salida" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-4">
                <h1 className="text-xl font-semibold text-primary">Seguimiento Efectivizacion</h1>
                <SeguimientoKpiGrid items={kpiItems} isLoading={isLoading} />
                <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
                    <div className="border-b border-secondary p-3">
                        <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key) as SeguimientoTab)}>
                            <Tabs.List type="button-border" size="sm" aria-label="Seguimientos de operaciones">
                                {tabs.map((tab) => (
                                    <Tabs.Item key={tab} id={tab} badge={rows[tab].filter((row) => !isPaid(row)).length || undefined}>
                                        {tab}
                                    </Tabs.Item>
                                ))}
                            </Tabs.List>
                        </Tabs>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3">
                        <Input aria-label="DNI" className="w-48" placeholder="DNI" value={dni} onChange={setDni} />
                        <Input aria-label="Cod. Op." className="w-48" placeholder="Cod. Op." value={codigo} onChange={setCodigo} />
                        {["Todos", "Pendiente", "Pagado"].map((filter) => (
                            <Button key={filter} size="sm" color={activeFilter === filter ? "primary" : "tertiary"} onClick={() => setActiveFilter(filter)}>
                                {filter}
                            </Button>
                        ))}
                    </div>
                    {error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}
                    <SeguimientoOperationTable data={visibleRows} isLoading={isLoading} tab={activeTab} />
                </section>
            </div>
        </AppLayout>
    );
};
