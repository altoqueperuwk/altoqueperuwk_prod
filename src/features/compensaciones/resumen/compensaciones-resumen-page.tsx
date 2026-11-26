import { type FC, useEffect, useMemo, useState } from "react";
import { AlertCircle, Calendar, CheckCircle, Clock } from "@untitledui/icons";
import { motion } from "motion/react";
import { useSearchParams } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { cx } from "@/utils/cx";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import type { CompensacionPeriodo } from "./compensaciones-resumen.types";
import { DashboardPersonal } from "./dashboard-personal";
import { JefaturaPage } from "./jefatura-page";
import { ResumenPersonal } from "./resumen-personal";
import { useCompensacionesResumen } from "./use-compensaciones-resumen";

const integerFormatter = new Intl.NumberFormat("es-PE");
const dateFormatter = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});

const formatInteger = (value: number | null) => (value === null ? "—" : integerFormatter.format(value));
const formatDate = (value: string) => (value ? dateFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—");
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));

interface MetricCardProps {
    icon: FC<{ className?: string }>;
    label: string;
    value: string;
    helper: string;
    tone?: "default" | "success" | "warning";
    index: number;
}

const MetricCard = ({ icon: Icon, label, value, helper, tone = "default", index }: MetricCardProps) => (
    <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.035 }} className="min-w-0">
        <CompensacionPanel
            title={label}
            trailing={
                <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">
                    <Icon className="size-4" />
                </span>
            }
        >
            <p
                className={cx(
                    "text-display-xs font-semibold tracking-tight tabular-nums",
                    tone === "success" && "text-success-primary",
                    tone === "warning" && "text-warning-primary",
                    tone === "default" && "text-primary",
                )}
            >
                {value}
            </p>
            <p className="mt-1 text-xs text-tertiary">{helper}</p>
        </CompensacionPanel>
    </motion.article>
);

const LoadingState = () => (
    <div className="space-y-5" aria-label="Cargando resumen de compensaciones">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-36 animate-pulse rounded-xl bg-primary" />
            ))}
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
    return (
        <CompensacionPanel title="Avance del período" trailing={<CompensacionEstado dominio="periodo" valor={periodo.estadoPeriodo} />}>
            <p className="text-sm text-tertiary">Estado del período y del reporte mensual de bonos y penalidades.</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-secondary p-3">
                    <p className="text-xs text-tertiary">Rango</p>
                    <p className="mt-1 text-sm font-medium text-primary">
                        {formatDate(periodo.fechaInicio)} – {formatDate(periodo.fechaFin)}
                    </p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                    <p className="text-xs text-tertiary">Último cálculo</p>
                    <p className="mt-1 text-sm font-medium text-primary">Versión {integerFormatter.format(periodo.numeroCalculo)}</p>
                </div>
            </div>
        </CompensacionPanel>
    );
};

export const CompensacionesResumenPage = withAlertProvider(() => {
    const { isAdvisor, isStoreManager, isFacturacion, isPagos, isMarketing, isResolving } = useCompensacionPerfil();
    if (isResolving)
        return (
            <p role="status" className="text-sm text-tertiary">
                Verificando acceso…
            </p>
        );
    if (isAdvisor || isPagos || isMarketing) return <DashboardPersonal />;
    if (isFacturacion) return <DashboardPersonal />;
    return isStoreManager ? <ResumenPersonalEntry /> : <CompensacionesResumenGeneral />;
});
const ResumenPersonalEntry = () => {
    const [params] = useSearchParams();
    return params.get("vista") === "responsabilidades" ? <JefaturaPage /> : <DashboardPersonal />;
};
const CompensacionesResumenGeneral = () => {
    const { isAdvisor } = useCompensacionPerfil();
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

    const selected = useMemo(() => periodos.find((periodo) => String(periodo.id) === selectedId) ?? periodos[0] ?? null, [periodos, selectedId]);

    const periodOptions = periodos.map((periodo) => ({
        label: `${periodo.nombre} · ${humanize(periodo.estadoPeriodo)}`,
        value: String(periodo.id),
    }));
    const recentPeriodColumns: ColumnDef[] = [
        {
            key: "nombre",
            header: "Periodo",
            render: (value, row) => (
                <div>
                    <button
                        type="button"
                        className="text-left font-medium text-primary hover:text-brand-secondary"
                        onClick={() => setSelectedId(String(row.id))}
                    >
                        {String(value ?? "—")}
                    </button>
                    <p className="mt-0.5 text-xs text-tertiary">
                        {formatDate(String(row.fechaInicio))} – {formatDate(String(row.fechaFin))}
                    </p>
                </div>
            ),
        },
        { key: "estadoPeriodo", header: "Estado", render: (value) => <CompensacionEstado dominio="periodo" valor={value} /> },
        { key: "numeroCalculo", header: "Cálculo", align: "right", render: (value) => `v${integerFormatter.format(Number(value))}` },
        { key: "eventosPendientes", header: "Eventos por revisar", align: "right", render: (value) => formatInteger(value == null ? null : Number(value)) },
        { key: "tieneCierreVigente", header: "Reporte", render: (value) => (value ? "Confirmado" : "En borrador") },
    ];

    const pendingItems = selected ? [{ label: "Eventos por revisar", value: selected.eventosPendientes, icon: AlertCircle }] : [];

    const periodControls = (
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <NativeSelect
                label="Periodo"
                className="w-full min-w-0 sm:max-w-xs"
                selectClassName="w-full min-w-0 truncate pr-10"
                value={selectedId}
                options={periodOptions.length ? periodOptions : [{ label: "Sin períodos disponibles", value: "" }]}
                disabled={!periodOptions.length || isLoading}
                onChange={(event) => setSelectedId(event.currentTarget.value)}
            />
        </div>
    );

    return (
        <AppLayout>
            <div className="mx-auto w-full max-w-[1600px] space-y-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                    <CompensacionHeading section="resumen" title={isAdvisor ? "Mi resumen" : "Resumen"} />
                    {!isAdvisor && (
                        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row lg:w-auto lg:items-end">
                            <NativeSelect
                                label="Periodo"
                                className="min-w-0 sm:min-w-72"
                                selectClassName="w-full min-w-0 truncate pr-10"
                                value={selectedId}
                                options={periodOptions.length ? periodOptions : [{ label: "Sin períodos disponibles", value: "" }]}
                                disabled={!periodOptions.length || isLoading}
                                onChange={(event) => setSelectedId(event.currentTarget.value)}
                            />
                        </div>
                    )}
                </div>

                {error && (
                    <div className="flex flex-wrap items-center gap-2">
                        <AlertMessage tone="error">{error}</AlertMessage>
                        <Button size="sm" color="secondary" onClick={refresh}>
                            Reintentar
                        </Button>
                    </div>
                )}

                {isLoading && !selected ? (
                    <LoadingState />
                ) : isAdvisor ? (
                    !error && <ResumenPersonal periodo={selected} toolbar={periodControls} />
                ) : !selected ? (
                    <EmptyState />
                ) : (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <MetricCard
                                icon={Calendar}
                                label="Estado del período"
                                value={humanize(selected.estadoPeriodo)}
                                helper={`${formatDate(selected.fechaInicio)} – ${formatDate(selected.fechaFin)}`}
                                index={0}
                            />
                            <MetricCard
                                icon={CheckCircle}
                                label="Reporte del mes"
                                value={selected.tieneCierreVigente ? "Confirmado" : "En borrador"}
                                helper="Se confirma en Bonos del mes"
                                tone={selected.tieneCierreVigente ? "success" : "warning"}
                                index={1}
                            />
                            <MetricCard
                                icon={AlertCircle}
                                label="Eventos por revisar"
                                value={formatInteger(selected.eventosPendientes)}
                                helper="Registros pendientes de revisión"
                                tone="warning"
                                index={2}
                            />
                        </div>

                        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
                            <PeriodProgress periodo={selected} />

                            <CompensacionPanel title="Pendientes operativos">
                                <p className="text-sm text-tertiary">Elementos que deben resolverse antes de confirmar el reporte del mes.</p>
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
                                                    <span
                                                        className={cx(
                                                            "flex size-9 items-center justify-center rounded-lg",
                                                            isClear
                                                                ? "bg-success-secondary text-featured-icon-light-fg-success"
                                                                : "bg-warning-secondary text-featured-icon-light-fg-warning",
                                                        )}
                                                    >
                                                        <Icon className="size-5" />
                                                    </span>
                                                    <span className="text-sm font-medium text-primary">{item.label}</span>
                                                </div>
                                                <span
                                                    className={cx(
                                                        "text-lg font-semibold tabular-nums",
                                                        isClear ? "text-success-primary" : "text-warning-primary",
                                                    )}
                                                >
                                                    {formatInteger(item.value)}
                                                </span>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                                <div className="mt-5 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-xs text-tertiary">
                                    {selected.tieneCierreVigente ? (
                                        <CheckCircle className="size-4 text-success-primary" />
                                    ) : (
                                        <AlertCircle className="size-4 text-warning-primary" />
                                    )}
                                    {selected.tieneCierreVigente ? "El reporte del mes está confirmado." : "El reporte del mes todavía no está confirmado."}
                                </div>
                            </CompensacionPanel>
                        </div>

                        <CompensacionPanel title="Períodos recientes">
                            <p className="mb-4 text-sm text-tertiary">Histórico disponible para consulta y comparación.</p>
                            <DataTable
                                density="compact"
                                wrapText
                                columns={recentPeriodColumns}
                                data={periodos.slice(0, 8) as unknown as Record<string, unknown>[]}
                                isLoading={isLoading}
                                page={1}
                                pageSize={8}
                                totalPages={1}
                                onPageChange={() => {}}
                                onPageSizeChange={() => {}}
                                hidePageSizeSelector
                                hidePagination
                                emptyMessage="Aún no existen períodos"
                            />
                        </CompensacionPanel>
                    </>
                )}
            </div>
        </AppLayout>
    );
};
