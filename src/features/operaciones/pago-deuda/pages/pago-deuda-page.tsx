import { useEffect, useState } from "react";
import { CalendarDate } from "@internationalized/date";
import { Calendar as CalendarIcon } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Calendar } from "@/components/application/date-picker/calendar";
import { Button } from "@/components/base/buttons/button";
import { OperacionConfigDropdown } from "@/features/operaciones/efectivizacion/shared/components/operacion-config-dropdown";
import { OperacionReglasEfectivizacionModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-reglas-efectivizacion-modal";
import { RouteKpiCard } from "@/features/operaciones/efectivizacion/shared/components/route-kpi-card";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { PagoDeudaBoard } from "@/features/operaciones/pago-deuda/components/pago-deuda-board";
import { PagoDeudaEmpresasComisionModal } from "@/features/operaciones/pago-deuda/components/pago-deuda-empresas-comision-modal";
import { PagoDeudaSolicitudForm } from "@/features/operaciones/pago-deuda/components/pago-deuda-solicitud-form";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";

interface PagoDeudaKpi {
    total_operaciones_pendientes?: number | null;
    total_operaciones_pagados?: number | null;
    monto_solicitados?: number | null;
    comisiones?: number | null;
    monto_devueltos?: number | null;
}

const getTodayValue = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const stringToCalendarDate = (str: string) => {
    const [year, month, day] = str.split("-").map(Number);
    return new CalendarDate(year, month, day);
};

const formatSelectedDate = (str: string) => {
    const [year, month, day] = str.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
};

export const PagoDeudaPage = () => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [isEmpresasComisionOpen, setIsEmpresasComisionOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isReglasOpen, setIsReglasOpen] = useState(false);
    const [isKpiLoading, setIsKpiLoading] = useState(false);
    const [kpi, setKpi] = useState<PagoDeudaKpi | null>(null);
    const [selectedDate, setSelectedDate] = useState(getTodayValue);

    useEffect(() => {
        let ignore = false;
        setIsKpiLoading(true);

        pagoDeudaService
            .getKpi({
                p_fecha_registro_desde: `${selectedDate}T00:00:00`,
                p_fecha_registro_hasta: `${selectedDate}T23:59:59`,
            })
            .then((rows) => {
                if (!ignore) setKpi((rows?.[0] ?? null) as PagoDeudaKpi | null);
            })
            .finally(() => {
                if (!ignore) setIsKpiLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [refreshKey, selectedDate]);

    const handleCalendarChange = (date: any) => {
        if (!date) return;
        setSelectedDate(`${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`);
        setIsCalendarOpen(false);
    };

    const handleChanged = () => setRefreshKey((value) => value + 1);

    const kpiCards = [
        { label: "Total Operaciones Pendientes", value: formatInteger(kpi?.total_operaciones_pendientes), tone: "text-primary" },
        { label: "Total Operaciones Pagados", value: formatInteger(kpi?.total_operaciones_pagados), tone: "text-concept-ingreso" },
        { label: "Monto Solicitados", value: formatMoney(kpi?.monto_solicitados), tone: "text-primary" },
        { label: "Comisiones", value: formatMoney(kpi?.comisiones), tone: "text-concept-ingreso" },
        { label: "Monto Devueltos", value: formatMoney(kpi?.monto_devueltos), tone: "text-concept-salida" },
    ];

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <div className="relative">
                        <Button size="sm" color="secondary" iconLeading={CalendarIcon} onClick={() => setIsCalendarOpen(!isCalendarOpen)}>
                            {formatSelectedDate(selectedDate)}
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
                    <OperacionConfigDropdown
                        onOpenEmpresasComision={() => setIsEmpresasComisionOpen(true)}
                        onOpenReglas={() => setIsReglasOpen(true)}
                        showEmpresasComision
                    />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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

                <PagoDeudaSolicitudForm onSaved={handleChanged} />
                <PagoDeudaBoard refreshKey={refreshKey} selectedDate={selectedDate} onChanged={handleChanged} />
            </div>
            <OperacionReglasEfectivizacionModal
                isOpen={isReglasOpen}
                mode="pago-deuda"
                onClose={() => setIsReglasOpen(false)}
                onSaved={handleChanged}
            />
            <PagoDeudaEmpresasComisionModal
                isOpen={isEmpresasComisionOpen}
                onClose={() => setIsEmpresasComisionOpen(false)}
                onSaved={handleChanged}
            />
        </AppLayout>
    );
};
