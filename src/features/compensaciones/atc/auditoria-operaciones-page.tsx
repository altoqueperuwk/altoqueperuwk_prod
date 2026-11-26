import { AppLayout } from "@/components/application/app-layout";
import { withAlertProvider } from "@/components/shared/alert-center";
import { AtcAuditoria } from "../auditoria/atc-auditoria";
import { FacturacionAuditoria } from "../auditoria/facturacion-auditoria";
import { JefeAuditoria } from "../auditoria/jefe-auditoria";
import { MarketingAuditoria } from "../auditoria/marketing-auditoria";
import { PagosAuditoria } from "../auditoria/pagos-auditoria";
import { AdminOperacionesPage } from "../evidencias/admin-operaciones-page";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";

/**
 * Auditoría Operaciones (Esquema 12): ATC, Jefe de Sede, Facturación, Pagos y Marketing usan la misma pantalla
 * (auditoria/auditoria-screen y auditoria-form); cada uno aporta sus conceptos, filas y acciones.
 * Administrador: todos los hallazgos con su revisión y el registro de las penalidades sin otro origen.
 */
export const AuditoriaOperacionesPage = withAlertProvider(() => {
    const { isStoreManager, isFacturacion, isPagos, isMarketing, isAdministrator, isResolving, userId } = useCompensacionPerfil();
    if (!isResolving && isAdministrator) return <AdminOperacionesPage />;
    const Perfil = isFacturacion
        ? FacturacionAuditoria
        : isPagos
          ? PagosAuditoria
          : isMarketing
            ? MarketingAuditoria
            : isStoreManager
              ? JefeAuditoria
              : AtcAuditoria;
    return (
        <AppLayout>
            {isResolving ? (
                <p role="status" className="text-sm text-tertiary">
                    Verificando acceso…
                </p>
            ) : (
                <Perfil key={userId} />
            )}
        </AppLayout>
    );
});
