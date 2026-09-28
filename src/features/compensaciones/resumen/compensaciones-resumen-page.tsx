import { useEffect, useMemo, useState, type FC } from "react";
import {
    AlertCircle,
    BankNote01,
    Calendar,
    CheckCircle,
    Clock,
    CoinsStacked01,
    RefreshCw01,
    Users03,
} from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";
import type { CompensacionPeriodo } from "./compensaciones-resumen.types";
import { useCompensacionesResumen } from "./use-compensaciones-resumen";

const moneyFormatter = new Intl.NumberFormat("es-PE", {
    currency: "PEN",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
});
const integerFormatter = new Intl.NumberFormat("es-PE");
const dateFormatter = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});

const formatMoney = (value: number | null) => value === null ? "—" : moneyFormatter.format(value).replace("PEN", "S/");
const formatInteger = (value: number | null) => value === null ? "—" : integerFormatter.format(value);
const formatDate = (value: string) => value ? dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—";
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));

const statusColor = (status: string): "success" | "warning" | "brand" | "gray" => {
    if (["CERRADO", "APROBADO"].includes(status)) return "success";
    if (["EN_REVISION", "EN_CALCULO", "OBSERVADO"].includes(status)) return "warning";
    if (["ABIERTO", "REABIERTO"].includes(status)) return "brand";
    return "gray";
};

interface MetricCardProps {
    icon: FC<{ className?: string }>;
    label: string;
    value: string;
    helper: string;
    tone?: "default" | "success" | "warning";
    index: number;
}

const MetricCard = ({ icon: Icon, label, value, helper, tone = "default", index }: MetricCardProps) => (
    <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: index * 0.035 }}
        className="rounded-xl border border-secondary bg-primary p-5 shadow-xs"
    >
        <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-tertiary">{label}</p>
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">
                <Icon className="size-5" />
            </span>
        </div>
        <p className={cx(
            "mt-4 text-display-xs font-semibold tracking-tight tabular-nums",
            tone === "success" && "text-success-primary",
            tone === "warning" && "text-warning-primary",
            tone === "default" && "text-primary",
        )}>
            {value}
        </p>
        <p className="mt-1 text-xs text-tertiary">{helper}</p>
    </motion.article>
);

const LoadingState = () => (
    <div className="space-y-5" aria-label="Cargando resumen de compensaciones">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl bg-primary" />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <div className="h-80 animate-pulse rounded-xl bg-primary" />
            <div className="h-80 animate-pulse rounded-xl bg-primary" />
        </div>
    </div>
);

const EmptyState = () => (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-secondary bg-primary px-6 text-center shadow-xs">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-fg-quaternary">
            <Calendar className="size-6" />
        </span>
        <h2 className="mt-4 text-md font-semibold text-primary">Aún no existen períodos</h2>
        <p className="mt-1 max-w-md text-sm text-tertiary">Cuando se abra el primer período mensual, aquí aparecerán sus totales y pendientes operativos.</p>
    </div>
);

const PeriodProgress = ({ periodo }: { periodo: CompensacionPeriodo }) => {
    const total = periodo.totalPagar;
    const paid = periodo.totalPagado;
    const percentage = total !== null && paid !== null && total > 0
        ? Math.min(100, Math.max(0, paid / total * 100))
        : 0;

    return (
        <section className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-md font-semibold text-primary">Avance del período</h2>
                    <p className="mt-1 text-sm text-tertiary">Seguimiento financiero y estado de cierre.</p>
                </div>
                <Badge color={statusColor(periodo.estadoPeriodo)}>{humanize(periodo.estadoPeriodo)}</Badge>
            </div>

            <div className="mt-6 flex items-end justify-between gap-3">
                <div>
                    <p className="text-xs font-medium text-tertiary">Pagado</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-primary">{formatMoney(paid)}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-brand-secondary">{total === null ? "—" : `${percentage.toFixed(1)}%`}</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-secondary">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.35 }}
                    className="h-full rounded-full bg-brand-solid"
                />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-tertiary">
                <span>Total del período</span>
                <span className="font-medium tabular-nums text-secondary">{formatMoney(total)}</span>
            </div>

            <div className="mt-6 grid gap-3 border-t border-secondary pt-5 sm:grid-cols-2">
                <div className="rounded-lg bg-secondary p-3">
                    <p className="text-xs text-tertiary">Rango</p>
                    <p className="mt-1 text-sm font-medium text-primary">{formatDate(periodo.fechaInicio)} – {formatDate(periodo.fechaFin)}</p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                    <p className="text-xs text-tertiary">Último cálculo</p>
                    <p className="mt-1 text-sm font-medium text-primary">Versión {integerFormatter.format(periodo.numeroCalculo)}</p>
                </div>
            </div>
        </section>
    );
};

export const CompensacionesResumenPage = () => {
    const { periodos, isLoading, error, refresh } = useCompensacionesResumen();
    const [selectedId, setSelectedId] = useState("");

    useEffect(() => {
        if (!periodos.length) {
            setSelectedId("");
            return;
        }
        if (!periodos.some((periodo) => String(periodo.id) === selectedId)) {
            setSelectedId(String(periodos[0].id));
        }
    }, [periodos, selectedId]);

    const selected = useMemo(
        () => periodos.find((periodo) => String(periodo.id) === selectedId) ?? periodos[0] ?? null,
        [periodos, selectedId],
    );

    const pendingAmount = selected?.totalPagar !== null && selected?.totalPagar !== undefined && selected.totalPagado !== null
        ? Math.max(0, selected.totalPagar - selected.totalPagado)
        : null;
    const hasGlobalTotals = selected?.totalPagar !== null && selected?.totalPagar !== undefined;
    const periodOptions = periodos.map((periodo) => ({
        label: `${periodo.nombre} · ${humanize(periodo.estadoPeriodo)}`,
        value: String(periodo.id),
    }));

    const pendingItems = selected ? [
        { label: "Liquidaciones pendientes", value: selected.liquidacionesPendientes, icon: CoinsStacked01 },
        { label: "Solicitudes de asistencia", value: selected.solicitudesAsistenciaPendientes, icon: Clock },
        { label: "Eventos por revisar", value: selected.eventosPendientes, icon: AlertCircle },
    ] : [];

    return (
        <AppLayout>
            <div className="mx-auto w-full max-w-[1600px] space-y-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                    <div>
                        <p className="text-sm font-medium text-brand-secondary">Compensaciones</p>
                        <h1 className="mt-1 text-display-sm font-semibold tracking-tight text-primary">Resumen</h1>
                        <p className="mt-1 text-sm text-tertiary">Vista consolidada del período, pagos y pendientes antes del cierre mensual.</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-end">
                        <NativeSelect
                            label="Período"
                            className="sm:min-w-72"
                            value={selectedId}
                            options={periodOptions.length ? periodOptions : [{ label: "Sin períodos disponibles", value: "" }]}
                            disabled={!periodOptions.length || isLoading}
                            onChange={(event) => setSelectedId(event.currentTarget.value)}
                        />
                        <Button size="md" color="secondary" iconLeading={RefreshCw01} isLoading={isLoading} onClick={refresh}>
                            Actualizar
                        </Button>
                    </div>
                </div>

                {error && (
                    <div role="alert" className="flex flex-col items-start justify-between gap-3 rounded-xl border border-error_subtle bg-error-primary p-4 sm:flex-row sm:items-center">
                        <div>
                            <p className="text-sm font-semibold text-error-primary">No se pudo cargar el resumen.</p>
                            <p className="mt-1 text-xs text-error-primary">{error}</p>
                        </div>
                        <Button size="sm" color="secondary" onClick={refresh}>Reintentar</Button>
                    </div>
                )}

                {isLoading && !selected ? <LoadingState /> : !selected ? <EmptyState /> : (
                    <>
                        {!hasGlobalTotals && (
                            <div className="rounded-xl border border-warning_subtle bg-warning-primary px-4 py-3 text-sm text-warning-primary">
                                Los totales consolidados están restringidos por tu alcance. Puedes consultar el estado general del período.
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard icon={BankNote01} label="Total a pagar" value={formatMoney(selected.totalPagar)} helper={`${formatInteger(selected.totalLiquidaciones)} liquidaciones vigentes`} index={0} />
                            <MetricCard icon={CheckCircle} label="Total pagado" value={formatMoney(selected.totalPagado)} helper="Pagos aplicados al período" tone="success" index={1} />
                            <MetricCard icon={Clock} label="Saldo pendiente" value={formatMoney(pendingAmount)} helper="Importe aún no completado" tone="warning" index={2} />
                            <MetricCard icon={Users03} label="Liquidaciones pendientes" value={formatInteger(selected.liquidacionesPendientes)} helper="Requieren completar su flujo" tone="warning" index={3} />
                        </div>

                        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
                            <PeriodProgress periodo={selected} />

                            <section className="rounded-xl border border-secondary bg-primary p-5 shadow-xs">
                                <h2 className="text-md font-semibold text-primary">Pendientes operativos</h2>
                                <p className="mt-1 text-sm text-tertiary">Elementos que deben resolverse antes del cierre.</p>
                                <div className="mt-5 divide-y divide-secondary">
                                    {pendingItems.map((item, index) => {
                                        const Icon = item.icon;
                                        const isClear = item.value === 0;
                                        return (
                                            <motion.div
                                                key={item.label}
                                                initial={{ opacity: 0, x: 8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.2, delay: index * 0.045 }}
                                                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={cx(
                                                        "flex size-9 items-center justify-center rounded-lg",
                                                        isClear ? "bg-success-secondary text-featured-icon-light-fg-success" : "bg-warning-secondary text-featured-icon-light-fg-warning",
                                                    )}>
                                                        <Icon className="size-5" />
                                                    </span>
                                                    <span className="text-sm font-medium text-primary">{item.label}</span>
                                                </div>
                                                <span className={cx("text-lg font-semibold tabular-nums", isClear ? "text-success-primary" : "text-warning-primary")}>
                                                    {formatInteger(item.value)}
                                                </span>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                                <div className="mt-5 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-xs text-tertiary">
                                    {selected.tieneCierreVigente ? <CheckCircle className="size-4 text-success-primary" /> : <AlertCircle className="size-4 text-warning-primary" />}
                                    {selected.tieneCierreVigente ? "El período cuenta con un cierre vigente." : "El período todavía no cuenta con un cierre vigente."}
                                </div>
                            </section>
                        </div>

                        <section className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
                            <div className="border-b border-secondary px-5 py-4">
                                <h2 className="text-md font-semibold text-primary">Períodos recientes</h2>
                                <p className="mt-1 text-sm text-tertiary">Histórico disponible para consulta y comparación.</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[880px] text-left text-sm">
                                    <thead className="bg-secondary text-xs text-tertiary">
                                        <tr>
                                            <th className="px-5 py-3 font-semibold">Período</th>
                                            <th className="px-4 py-3 font-semibold">Estado</th>
                                            <th className="px-4 py-3 text-right font-semibold">Cálculo</th>
                                            <th className="px-4 py-3 text-right font-semibold">Liquidaciones</th>
                                            <th className="px-4 py-3 text-right font-semibold">Pendientes</th>
                                            <th className="px-4 py-3 text-right font-semibold">Total</th>
                                            <th className="px-5 py-3 text-right font-semibold">Pagado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-secondary">
                                        {periodos.slice(0, 8).map((periodo) => (
                                            <tr key={periodo.id} className={cx("text-secondary", periodo.id === selected.id && "bg-brand-primary_alt")}>
                                                <td className="px-5 py-3.5">
                                                    <button type="button" className="text-left font-medium text-primary hover:text-brand-secondary" onClick={() => setSelectedId(String(periodo.id))}>
                                                        {periodo.nombre}
                                                    </button>
                                                    <p className="mt-0.5 text-xs text-tertiary">{formatDate(periodo.fechaInicio)} – {formatDate(periodo.fechaFin)}</p>
                                                </td>
                                                <td className="px-4 py-3.5"><Badge size="sm" color={statusColor(periodo.estadoPeriodo)}>{humanize(periodo.estadoPeriodo)}</Badge></td>
                                                <td className="px-4 py-3.5 text-right tabular-nums">v{integerFormatter.format(periodo.numeroCalculo)}</td>
                                                <td className="px-4 py-3.5 text-right tabular-nums">{formatInteger(periodo.totalLiquidaciones)}</td>
                                                <td className="px-4 py-3.5 text-right tabular-nums text-warning-primary">{formatInteger(periodo.liquidacionesPendientes)}</td>
                                                <td className="px-4 py-3.5 text-right font-medium tabular-nums text-primary">{formatMoney(periodo.totalPagar)}</td>
                                                <td className="px-5 py-3.5 text-right font-medium tabular-nums text-success-primary">{formatMoney(periodo.totalPagado)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </AppLayout>
    );
};

