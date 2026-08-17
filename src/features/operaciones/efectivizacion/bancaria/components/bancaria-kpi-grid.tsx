import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";
import type { RutaOperacionKpi } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

interface BancariaKpiGridProps {
    isLoading?: boolean;
    kpi: RutaOperacionKpi | null;
    hasRetentionRule?: boolean;
}

export const BancariaKpiGrid = ({ hasRetentionRule = false, isLoading = false, kpi }: BancariaKpiGridProps) => {
    const cards = [
        { label: "Caja Inicial", value: formatMoney(kpi?.caja_inicial), valueClassName: "text-primary", badges: ["Efectivización", "Pago Deuda", "Otros"] },
        { label: "Caja Actual", value: formatMoney(kpi?.caja_actual), valueClassName: "text-primary", badges: ["Efectivización", "Pago Deuda", "Otros"] },
        { label: "Caja Recaudación", value: formatMoney(kpi?.total_recaudado), valueClassName: "text-concept-ingreso", badges: ["Efectivización", "Pago Deuda"] },
        { label: "Ingresos", value: formatMoney(kpi?.ingresos), valueClassName: "text-concept-ingreso", badges: ["Otros"] },
        { label: "Salidas", value: formatMoney(kpi?.salidas), valueClassName: "text-concept-salida", badges: ["Efectivización", "Pago Deuda", "Otros"] },
        { label: "Gastos Operacionales", value: formatMoney(kpi?.gastos_operacionales), valueClassName: "text-concept-gasto", badges: ["Efectivización", "Pago Deuda"] },
        { label: "Ganancias", value: formatMoney(kpi?.ganancias), valueClassName: "text-concept-ganancia", badges: ["Efectivización", "Pago Deuda"] },
        { label: "Retención Recaudación", value: formatMoney(kpi?.ingresos_retenidos), valueClassName: "text-concept-ingreso", badges: ["Efectivización", "Pago Deuda"] },
        { label: "Fuera de Horario", value: formatMoney(kpi?.fuera_horario), valueClassName: "text-concept-ingreso", badges: ["Efectivización"] },
    ] as const;
    const visibleCards = [
        ...cards.slice(0, 2),
        hasRetentionRule ? cards[7] : cards[2],
        cards[3],
        cards[6],
        cards[8],
        cards[4],
        cards[5],
    ] as const;

    return (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleCards.map((card) => (
                <RouteKpiCard
                    badges={card.badges}
                    isLoading={isLoading}
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    valueClassName={card.valueClassName}
                />
            ))}
        </section>
    );
};
