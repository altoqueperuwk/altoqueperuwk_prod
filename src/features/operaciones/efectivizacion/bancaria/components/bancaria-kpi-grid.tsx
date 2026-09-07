import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";
import type { RutaOperacionKpi, SafetyPayKpi } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { calcularSaldoBanco } from "@/features/operaciones/efectivizacion/bancaria/utils/saldo-banco";

interface BancariaKpiGridProps {
    activeAccountId?: number | null;
    activeBankId?: number | null;
    activeCompanyId?: number | null;
    isLoading?: boolean;
    kpi: RutaOperacionKpi | null;
    gananciasBadge?: string | null;
    isSafetyPay?: boolean;
    safetyPayKpi?: SafetyPayKpi | null;
    /** Conservado para compatibilidad con los consumidores existentes. */
    hasRetentionRule?: boolean;
}

export const BancariaKpiGrid = ({
    activeAccountId,
    activeBankId,
    activeCompanyId,
    gananciasBadge,
    isLoading = false,
    kpi,
    isSafetyPay = false,
    safetyPayKpi,
}: BancariaKpiGridProps) => {
    if (isSafetyPay) {
        const specialKpi = safetyPayKpi;
        const derivedCompanies = specialKpi?.empresas_derivadas ?? [];

        return (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <RouteKpiCard
                    isLoading={isLoading}
                    label="Caja Recaudación"
                    value={formatMoney(specialKpi?.caja_recaudacion)}
                    valueClassName="text-concept-ingreso"
                />
                <RouteKpiCard
                    isLoading={isLoading}
                    label="Ganancias"
                    value={formatMoney(specialKpi?.ganancias)}
                    valueClassName="text-concept-ganancia"
                />
                <RouteKpiCard
                    isLoading={isLoading}
                    label="Salidas"
                    value={formatMoney(specialKpi?.salidas)}
                    valueClassName="text-concept-salida"
                />
                <RouteKpiCard
                    isLoading={isLoading}
                    label="Gastos Operacionales"
                    value={formatMoney(specialKpi?.gastos_operacionales)}
                    valueClassName="text-concept-gasto"
                />
                <RouteKpiCard
                    isLoading={isLoading}
                    label="Pendiente Transferencia"
                    value={formatMoney(specialKpi?.pendiente_transferencia)}
                    valueClassName="text-concept-transferencia"
                />
                <RouteKpiCard
                    isLoading={isLoading}
                    label="Total Transferencia"
                    value={formatInteger(specialKpi?.total_transferencia)}
                    valueClassName="text-primary"
                />
                <div className="min-h-24 rounded-lg border border-secondary bg-primary p-4 shadow-xs lg:col-span-2">
                    <p className="text-xs font-medium text-tertiary">Empresas Derivadas</p>
                    {isLoading ? (
                        <div className="mt-3 h-7 w-40 animate-pulse rounded bg-secondary" />
                    ) : derivedCompanies.length ? (
                        <div className="mt-2 space-y-1.5">
                            {derivedCompanies.map((company) => (
                                <div className="flex items-center justify-between gap-3 text-xs" key={`${company.empresa}-${company.cuenta}`}>
                                    <span className="min-w-0 truncate text-secondary">{company.empresa} · {company.cuenta}</span>
                                    <span className="shrink-0 font-semibold tabular-nums text-concept-transferencia">{formatMoney(company.monto)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-2 text-sm text-tertiary">Sin transferencias derivadas.</p>
                    )}
                </div>
            </section>
        );
    }

    const saldoBanco = calcularSaldoBanco(kpi, activeCompanyId, activeBankId, activeAccountId);
    const cards = [
        { label: "Caja Inicial", value: formatMoney(kpi?.caja_inicial), valueClassName: "text-primary", badges: ["Efectivizacion", "Pago Deuda", "Otros"] },
        {
            label: "Saldo Banco",
            value: formatMoney(saldoBanco),
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
                    value={card.value}
                    valueClassName={card.valueClassName}
                />
            ))}
        </section>
    );
};
