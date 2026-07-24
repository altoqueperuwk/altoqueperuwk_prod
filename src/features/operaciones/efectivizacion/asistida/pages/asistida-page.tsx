import { useEffect, useMemo, useState } from "react";
import { Settings01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { RouteConfigDrawer } from "@/features/operaciones/efectivizacion/shared/components/route-config-drawer";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionAsistidaKpi, OperacionRuta } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { AsistidaOperationalBoard } from "@/features/operaciones/efectivizacion/asistida/components/asistida-operational-board";
import { AsistidaSolicitudForm } from "@/features/operaciones/efectivizacion/asistida/components/asistida-solicitud-form";

interface AsistidaPageProps {
    ruta: Extract<OperacionRuta, "pos" | "linkpago">;
}

const getTodayValue = () => new Date().toISOString().slice(0, 10);

export const AsistidaPage = ({ ruta }: AsistidaPageProps) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayValue);
    const [kpi, setKpi] = useState<OperacionAsistidaKpi | null>(null);
    const [isKpiLoading, setIsKpiLoading] = useState(false);
    const { data: cajas, error, isLoading } = useRouteCompanies(ruta);
    const primaryCompany = useMemo(
        () => cajas.find((caja) => caja.flag_caja_ingreso_principal) ?? cajas[0] ?? null,
        [cajas],
    );
    const routeLabel = getRutaLabel(ruta);

    useEffect(() => {
        let ignore = false;
        setIsKpiLoading(true);

        operacionesRpcService
            .getOperacionAsistidaKpi({
                p_ruta: ruta,
                p_fecha_registro_desde: `${selectedDate}T00:00:00`,
                p_fecha_registro_hasta: `${selectedDate}T23:59:59`,
            })
            .then((rows) => {
                if (!ignore) setKpi(rows[0] ?? null);
            })
            .finally(() => {
                if (!ignore) setIsKpiLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [refreshKey, ruta, selectedDate]);

    const kpiCards = [
        { label: "Gastos", value: formatMoney(kpi?.gastos), tone: "text-error-primary" },
        { label: "Ganancia", value: formatMoney(kpi?.ganancia), tone: "text-success-primary" },
        { label: "Salidas", value: formatMoney(kpi?.salidas), tone: "text-error-primary" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-primary">{routeLabel}</h1>
                        <p className="mt-1 text-sm text-tertiary">
                            {ruta === "pos" ? "Solicitudes enviadas a bancos para transferencia." : "Operaciones registradas sin impacto de caja."}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <Input
                            size="sm"
                            label="Fecha de registro"
                            type="date"
                            value={selectedDate}
                            onChange={setSelectedDate}
                            className="min-w-48"
                        />
                        <Button size="sm" color="secondary" onClick={() => setSelectedDate(getTodayValue())}>
                            Hoy
                        </Button>
                        <Button size="sm" color="primary" iconLeading={Settings01} onClick={() => setIsConfigOpen(true)}>
                            Configuracion
                        </Button>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    {kpiCards.map((card) => (
                        <div key={card.label} className="rounded-lg border border-secondary bg-primary px-4 py-3 shadow-xs">
                            <p className="text-sm font-medium text-tertiary">{card.label}</p>
                            <p className={`mt-2 text-xl font-semibold tabular-nums ${card.tone}`}>
                                {isKpiLoading ? "..." : card.value}
                            </p>
                        </div>
                    ))}
                </div>
                {isLoading && <span className="text-sm text-tertiary">Cargando configuracion...</span>}

                {error && (
                    <div className="rounded-lg border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary">
                        {error}
                    </div>
                )}

                <AsistidaSolicitudForm
                    activeCompany={primaryCompany}
                    onSaved={() => setRefreshKey((value) => value + 1)}
                    ruta={ruta}
                />

                <AsistidaOperationalBoard
                    companies={cajas}
                    refreshKey={refreshKey}
                    ruta={ruta}
                    selectedDate={selectedDate}
                    onChanged={() => setRefreshKey((value) => value + 1)}
                />

                <RouteConfigDrawer
                    activeCompany={primaryCompany}
                    cajas={cajas}
                    isOpen={isConfigOpen}
                    onClose={() => setIsConfigOpen(false)}
                    ruta={ruta}
                />
            </div>
        </AppLayout>
    );
};
