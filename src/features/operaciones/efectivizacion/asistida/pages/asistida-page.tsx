import { useMemo, useState } from "react";
import { Settings01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { RouteConfigDrawer } from "@/features/operaciones/efectivizacion/shared/components/route-config-drawer";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import type { OperacionRuta } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { AsistidaOperationalBoard } from "@/features/operaciones/efectivizacion/asistida/components/asistida-operational-board";
import { AsistidaSolicitudForm } from "@/features/operaciones/efectivizacion/asistida/components/asistida-solicitud-form";

interface AsistidaPageProps {
    ruta: Extract<OperacionRuta, "pos" | "linkpago">;
}

export const AsistidaPage = ({ ruta }: AsistidaPageProps) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const routeLabel = getRutaLabel(ruta);
    const { data: cajas, error, isLoading } = useRouteCompanies(ruta);
    const primaryCompany = useMemo(
        () => cajas.find((caja) => caja.flag_caja_ingreso_principal) ?? cajas[0] ?? null,
        [cajas],
    );

    return (
        <AppLayout>
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm text-tertiary">Home &gt; Operaciones &gt; {routeLabel}</p>
                        <h1 className="mt-1 text-xl font-semibold text-primary">{routeLabel}</h1>
                    </div>
                    <Button size="sm" color="primary" iconLeading={Settings01} onClick={() => setIsConfigOpen(true)}>
                        Configuracion
                    </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="rounded-lg border border-secondary bg-primary px-4 py-3 shadow-xs">
                        <p className="text-xs font-medium text-tertiary">Caja primaria</p>
                        <p className="mt-1 text-sm font-semibold text-primary">
                            {primaryCompany ? `${primaryCompany.nombre_empresa} - ${primaryCompany.nombre_banco}` : "Sin caja configurada"}
                        </p>
                    </div>
                    {isLoading && <span className="text-sm text-tertiary">Cargando empresas...</span>}
                </div>

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

                <AsistidaOperationalBoard companies={cajas} refreshKey={refreshKey} ruta={ruta} />

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
