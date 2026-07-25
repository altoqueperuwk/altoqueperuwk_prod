import { useEffect, useMemo, useState } from "react";
import { CalendarDate } from "@internationalized/date";
import { Calendar as CalendarIcon, Settings01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Calendar } from "@/components/application/date-picker/calendar";
import { Button } from "@/components/base/buttons/button";
import { RouteConfigDrawer } from "@/features/operaciones/efectivizacion/shared/components/route-config-drawer";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionAsistidaKpi, OperacionRuta } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { AsistidaOperationalBoard } from "@/features/operaciones/efectivizacion/asistida/components/asistida-operational-board";
import { AsistidaSolicitudForm } from "@/features/operaciones/efectivizacion/asistida/components/asistida-solicitud-form";
import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";

interface AsistidaPageProps {
    ruta: Extract<OperacionRuta, "pos" | "linkpago">;
}

const getTodayValue = () => new Date().toISOString().slice(0, 10);

const stringToCalendarDate = (str: string) => {
    const [year, month, day] = str.split("-").map(Number);
    return new CalendarDate(year, month, day);
};

export const AsistidaPage = ({ ruta }: AsistidaPageProps) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(getTodayValue);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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
        { label: "Comisiones", value: formatMoney(kpi?.comisiones), tone: "text-concept-ingreso" },
        { label: "Gastos", value: formatMoney(kpi?.gastos), tone: "text-concept-gasto" },
        { label: "Ganancia", value: formatMoney(kpi?.ganancia), tone: "text-concept-ganancia" },
        { label: "Salidas", value: formatMoney(kpi?.salidas), tone: "text-concept-salida" },
    ];

    const handleCalendarChange = (date: any) => {
        if (date) {
            setSelectedDate(`${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`);
            setIsCalendarOpen(false);
        }
    };

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="flex items-end gap-2">
                        <div className="relative">
                            <Button size="sm" color="secondary" iconLeading={CalendarIcon} onClick={() => setIsCalendarOpen(!isCalendarOpen)}>
                                {new Date(selectedDate).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                            </Button>
                            {isCalendarOpen && (
                                <div className="absolute right-0 top-full z-50 mt-2">
                                    <div className="rounded-lg border border-secondary bg-primary p-3 shadow-lg">
                                        <Calendar value={stringToCalendarDate(selectedDate)} onChange={handleCalendarChange}>
                                            <div />
                                        </Calendar>
                                    </div>
                                </div>
                            )}
                        </div>
                        <Button size="sm" color="primary" iconLeading={Settings01} onClick={() => setIsConfigOpen(true)}>
                            Configuracion
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {kpiCards.map((card) => (
                        <RouteKpiCard
                            key={card.label}
                            isLoading={isKpiLoading}
                            label={card.label}
                            value={card.value}
                            valueClassName={card.tone}
                        />
                    ))}
                </div>

                <AsistidaSolicitudForm
                    activeCompany={primaryCompany}
                    onSaved={() => setRefreshKey((value) => value + 1)}
                    ruta={ruta}
                />

                {isLoading && <span className="text-sm text-tertiary">Cargando configuracion...</span>}

                {error && (
                    <div className="rounded-lg border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary">
                        {error}
                    </div>
                )}

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
