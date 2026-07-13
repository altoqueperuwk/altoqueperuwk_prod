import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";
import type { RutaOperacionKpi } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

interface BancariaKpiGridProps {
    isLoading?: boolean;
    kpi: RutaOperacionKpi | null;
}

export const BancariaKpiGrid = ({ isLoading = false, kpi }: BancariaKpiGridProps) => {
    const cards = [
        ["Caja Inicial", formatMoney(kpi?.caja_inicial), "text-primary"],
        ["Caja Actual", formatMoney(kpi?.caja_actual), "text-primary"],
        ["Total Recaudado", formatMoney(kpi?.total_recaudado), "text-concept-ingreso"],
        ["Ingresos", formatMoney(kpi?.ingresos), "text-concept-ingreso"],
        ["Salidas", formatMoney(kpi?.salidas), "text-concept-salida"],
        ["Gastos Operacionales", formatMoney(kpi?.gastos_operacionales), "text-concept-gasto"],
        ["Ganancias", formatMoney(kpi?.ganancias), "text-concept-ganancia"],
        ["Pendiente a Depositar", formatMoney(kpi?.pendiente_depositar), "text-primary"],
        ["Ingresos Retenidos", formatMoney(kpi?.ingresos_retenidos), "text-concept-ingreso"],
        ["Total Efectivizacion", formatInteger(kpi?.total_efectivizacion), "text-primary"],
        ["Total Pago Deuda", formatInteger(kpi?.total_pago_deuda), "text-primary"],
    ] as const;

    return (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            {cards.map(([label, value, valueClassName]) => (
                <RouteKpiCard isLoading={isLoading} key={label} label={label} value={value} valueClassName={valueClassName} />
            ))}
        </section>
    );
};
