import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { seguimientosService, type SeguimientoPagoDeudaKpi } from "./seguimientos.service";
import { SeguimientoKpiGrid, SeguimientoPagoDeudaTable } from "./components/seguimiento-operation-table";

const getText = (row: OperacionProceso, key: string) => String((row as unknown as Record<string, unknown>)[key] ?? "");

export const SeguimientoPagoDeudaPage = () => {
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [dni, setDni] = useState("");
    const [codigo, setCodigo] = useState("");
    const [rows, setRows] = useState<OperacionProceso[]>([]);
    const [kpi, setKpi] = useState<SeguimientoPagoDeudaKpi | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;
        setIsLoading(true);
        setError(null);
        Promise.all([
            seguimientosService.getPagoDeudaKpi(),
            seguimientosService.getPagoDeudaBandeja({ filtroEstado: "Todos", dni, codigo }),
        ]).then(([kpiRows, operationRows]) => {
            if (ignore) return;
            setKpi(kpiRows[0] ?? null);
            setRows(operationRows ?? []);
        }).catch((reason: unknown) => {
            if (!ignore) setError(reason instanceof Error ? reason.message : "No se pudo cargar Seguimientos.");
        }).finally(() => {
            if (!ignore) setIsLoading(false);
        });
        return () => { ignore = true; };
    }, [codigo, dni]);

    const visibleRows = useMemo(() => {
        if (activeFilter === "Todos") return rows;
        return rows.filter((row) => getText(row, "seguimiento_estado") === activeFilter);
    }, [activeFilter, rows]);

    const kpiItems = [
        { label: "Total Operaciones Pendientes", value: formatInteger(kpi?.total_operaciones_pendientes) },
        { label: "Total Operaciones Pagados", value: formatInteger(kpi?.total_operaciones_pagados) },
        { label: "Total Monto Solicitados", value: formatMoney(kpi?.total_monto_solicitados), valueClassName: "text-concept-ingreso" },
        { label: "Total Comisiones", value: formatMoney(kpi?.total_comisiones), valueClassName: "text-concept-gasto" },
        { label: "Total Monto Devueltos", value: formatMoney(kpi?.total_monto_devueltos), valueClassName: "text-concept-salida" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-4">
                <h1 className="text-xl font-semibold text-primary">Seguimiento Pago Deuda</h1>
                <SeguimientoKpiGrid items={kpiItems} isLoading={isLoading} />
                <section className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs">
                    <div className="flex flex-wrap items-center gap-2 border-b border-secondary p-3">
                        <Input aria-label="DNI" className="w-48" placeholder="DNI" value={dni} onChange={setDni} />
                        <Input aria-label="Cod. Op." className="w-48" placeholder="Cod. Op." value={codigo} onChange={setCodigo} />
                        {["Todos", "Pendiente Transferencia", "Pendiente Devolucion", "Pendiente Comision"].map((filter) => (
                            <Button key={filter} size="sm" color={activeFilter === filter ? "primary" : "tertiary"} onClick={() => setActiveFilter(filter)}>
                                {filter}
                            </Button>
                        ))}
                    </div>
                    {error && <p className="border-b border-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}
                    <SeguimientoPagoDeudaTable data={visibleRows} isLoading={isLoading} />
                </section>
            </div>
        </AppLayout>
    );
};
