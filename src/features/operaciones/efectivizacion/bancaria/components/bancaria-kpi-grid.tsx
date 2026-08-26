import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";
import type { RutaOperacionKpi } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

interface BancariaKpiGridProps {
    isLoading?: boolean;
    kpi: RutaOperacionKpi | null;
    gananciasBadge?: string | null;
    /** Conservado para compatibilidad con los consumidores existentes. */
    hasRetentionRule?: boolean;
}

export const BancariaKpiGrid = ({ gananciasBadge, isLoading = false, kpi }: BancariaKpiGridProps) => {
    const cajaActualCalculada = (kpi?.caja_inicial ?? 0) + (kpi?.ingresos ?? 0) - (kpi?.salidas ?? 0);
    const cards = [
        { label: "Caja Inicial", value: formatMoney(kpi?.caja_inicial), valueClassName: "text-primary", badges: ["Efectivizacion", "Pago Deuda", "Otros"] },
        {
            label: "Caja Actual",
            value: formatMoney(kpi?.caja_actual),
            secondaryLabel: "Saldo Banco",
            secondaryValue: formatMoney(cajaActualCalculada),
            valueClassName: "text-primary",
            badges: ["Efectivizacion", "Pago Deuda", "Otros"],
        },
        { label: "Caja Recaudación", value: formatMoney(kpi?.caja_recaudacion ?? kpi?.total_recaudado), valueClassName: "text-concept-ingreso", badges: ["Efectivizacion", "Pago Deuda"] },
        { label: "Ingresos", value: formatMoney(kpi?.ingresos), valueClassName: "text-concept-ingreso", badges: ["Otros"] },
        {
            label: "Ganancias",
            value: formatMoney(kpi?.ganancias),
            valueClassName: "text-concept-ganancia",
            badges: ["Efectivizacion", "Pago Deuda", ...(gananciasBadge ? [gananciasBadge] : [])],
        },
        { label: "Salidas", value: formatMoney(kpi?.salidas), valueClassName: "text-concept-salida", badges: ["Efectivizacion", "Pago Deuda", "Otros"] },
        { label: "Gastos Operacionales", value: formatMoney(kpi?.gastos_operacionales), valueClassName: "text-concept-gasto", badges: ["Efectivizacion", "Pago Deuda"] },
        { label: "Pendiente Transferencia", value: formatMoney(kpi?.pendiente_transferencia ?? kpi?.pendiente_depositar), valueClassName: "text-concept-transferencia", badges: ["Efectivizacion", "Pago Deuda"] },
    ] as const;

    return (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
                <RouteKpiCard
                    badges={card.badges}
                    isLoading={isLoading}
                    key={card.label}
                    label={card.label}
                    secondaryLabel={"secondaryLabel" in card ? card.secondaryLabel : undefined}
                    secondaryValue={"secondaryValue" in card ? card.secondaryValue : undefined}
                    value={card.value}
                    valueClassName={card.valueClassName}
                />
            ))}
        </section>
    );
};
