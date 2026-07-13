import { useMemo, useState } from "react";
import { AppLayout } from "@/components/application/app-layout";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/base/buttons/button";
import { Settings01 } from "@untitledui/icons";
import { EmpresaTabs } from "@/features/operaciones/efectivizacion/shared/components/empresa-tabs";
import { RouteConfigDrawer } from "@/features/operaciones/efectivizacion/shared/components/route-config-drawer";
import { useActiveCompany } from "@/features/operaciones/efectivizacion/shared/hooks/use-active-company";
import { useRouteCompanies } from "@/features/operaciones/efectivizacion/shared/hooks/use-route-companies";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { BancariaExcelUpload } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-excel-upload";
import { BancariaHistoryDrawer } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-history-drawer";
import { BancariaInlineForms } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-inline-forms";
import { BancariaKpiGrid } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-kpi-grid";
import { BancariaOperationalTabs } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-operational-tabs";
import { BancariaTopActions } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-top-actions";
import { useBancariaKpis } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-kpis";

interface BancariaPageProps {
    ruta: OperacionRutaBancaria;
}

export const BancariaPage = ({ ruta }: BancariaPageProps) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [downloadKey, setDownloadKey] = useState(0);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const routeLabel = getRutaLabel(ruta);
    const { data: cajas, error: companiesError, isLoading: isLoadingCompanies } = useRouteCompanies(ruta);
    const { activeCompany, activeCompanyCajas, activeCompanyId, companies, setActiveCompanyId } = useActiveCompany(cajas);
    const { data: kpi, error: kpiError, isLoading: isLoadingKpis } = useBancariaKpis(ruta, refreshKey);
    const activeCajaIds = useMemo(
        () => activeCompanyCajas.map((caja) => caja.id_caja).filter((idCaja): idCaja is number => Boolean(idCaja)),
        [activeCompanyCajas],
    );

    const companyName = activeCompany?.nombre_empresa ?? "Empresa";
    const userId = businessUser?.id ? Number(businessUser.id) : null;

    const handleCloseRoute = async () => {
        const cajasToClose = activeCompanyCajas.filter((caja) => caja.id_caja);

        if (!activeCompany) {
            addToast("error", "Selecciona una empresa antes de cerrar.");
            return;
        }

        if (!cajasToClose.length) {
            addToast("error", "La empresa activa no tiene cajas operativas configuradas.");
            return;
        }

        const confirmed = window.confirm(`Cerrar caja de ${activeCompany.nombre_empresa} en ${routeLabel}?`);
        if (!confirmed) return;

        setIsClosing(true);

        try {
            for (const caja of cajasToClose) {
                await operacionesRpcService.postCajaCierre({
                    p_id_caja: caja.id_caja,
                    p_id_usuario: userId,
                    p_kpi_snapshot: kpi ?? null,
                });
            }

            await operacionesRpcService.syncRutaKpiCaja(ruta, userId);
            setRefreshKey((value) => value + 1);
            addToast("success", "Cierre registrado correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar el cierre.";
            addToast("error", message);
        } finally {
            setIsClosing(false);
        }
    };

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
                    <EmpresaTabs companies={companies} activeCompanyId={activeCompanyId} onChange={setActiveCompanyId} />
                    <BancariaTopActions
                        isClosing={isClosing}
                        onOpenConfig={() => setIsConfigOpen(true)}
                        onCloseRoute={handleCloseRoute}
                        onDownload={() => setDownloadKey((value) => value + 1)}
                        onOpenHistory={() => setIsHistoryOpen(true)}
                    />
                    {isLoadingCompanies && <span className="text-sm text-tertiary">Cargando empresas...</span>}
                </div>

                {(companiesError || kpiError) && (
                    <div className="rounded-lg border border-error_subtle bg-error-primary px-4 py-3 text-sm text-error-primary">
                        {companiesError || kpiError}
                    </div>
                )}

                <BancariaKpiGrid isLoading={isLoadingKpis} kpi={kpi} />

                <BancariaInlineForms
                    activeCompany={activeCompany}
                    activeCompanyCajas={activeCompanyCajas}
                    onSaved={() => setRefreshKey((value) => value + 1)}
                    ruta={ruta}
                />

                <BancariaExcelUpload
                    activeCompany={activeCompany}
                    companyName={companyName}
                    onProcessed={() => setRefreshKey((value) => value + 1)}
                    ruta={ruta}
                />

                <BancariaOperationalTabs
                    activeCompanyId={activeCompanyId}
                    companies={companies}
                    downloadKey={downloadKey}
                    onCompanyChange={setActiveCompanyId}
                    refreshKey={refreshKey}
                    ruta={ruta}
                />

                <RouteConfigDrawer
                    activeCompany={activeCompany}
                    cajas={cajas}
                    isOpen={isConfigOpen}
                    onClose={() => setIsConfigOpen(false)}
                    ruta={ruta}
                />

                <BancariaHistoryDrawer
                    activeCajaIds={activeCajaIds}
                    activeCompany={activeCompany}
                    isOpen={isHistoryOpen}
                    onClose={() => setIsHistoryOpen(false)}
                />
            </div>
        </AppLayout>
    );
};
