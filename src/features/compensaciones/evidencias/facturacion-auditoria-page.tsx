import { Edit03 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { AdminAuditoriaNavigation } from "../shared/admin-auditoria-navigation";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { facturacionColumnas } from "./facturacion-auditoria-columns";
import { money } from "./facturacion-auditoria-constantes";
import { FacturacionAuditoriaFiltros } from "./facturacion-auditoria-filtros";
import { FacturacionAuditoriaForm } from "./facturacion-auditoria-form";
import type { FacturacionReporte } from "./facturacion-auditoria.service";
import { useFacturacionAuditoria } from "./use-facturacion-auditoria";

// El wrapper de auditoria-activa decide rol 5 / administracion ?vista=facturacion.
// Esta pagina obtiene permisos reales del servidor; no acepta beneficiario externo.
export const FacturacionAuditoriaPage = withAlertProvider(() => {
    const { userId, isFacturacion, isAdministrator } = useCompensacionPerfil();
    return (
        <AppLayout>
            <FacturacionAuditoriaContent key={`${userId}:${isFacturacion}:${isAdministrator}`} />
        </AppLayout>
    );
});
const FacturacionAuditoriaContent = () => {
    const c = useFacturacionAuditoria();
    const { context, result, loading, query, editing, busy } = c;
    if (c.contextError) return <AlertMessage tone="error">{c.contextError}</AlertMessage>;
    if (!context)
        return (
            <p role="status" className="text-sm text-secondary">
                Cargando permisos…
            </p>
        );
    const accion = context.es_admin ? "Revisar Reporte" : "Ver o Editar Reporte";
    return (
        <div className="space-y-5">
            <CompensacionHeading section="evidencias" title="Auditoría de Pagos" />
            <AdminAuditoriaNavigation />
            <div className="grid gap-4 sm:grid-cols-3">
                {[
                    ["Reportes", result?.total],
                    ["Pendientes", result?.pendientes],
                    ["Monto aprobado", result ? money(result.aprobado) : undefined],
                ].map(([title, value]) => (
                    <CompensacionPanel key={title} title={String(title)}>
                        <p className="text-display-xs font-semibold text-primary tabular-nums">{loading ? "…" : (value ?? "—")}</p>
                    </CompensacionPanel>
                ))}
            </div>
            {context.puede_registrar && !editing && (
                <CompensacionPanel title="Registrar Reporte">
                    <FacturacionAuditoriaForm c={c} />
                </CompensacionPanel>
            )}
            {c.error && <AlertMessage tone="error">{c.error}</AlertMessage>}
            <DataTable
                density="compact"
                columns={facturacionColumnas(context.es_admin)}
                data={result?.items ?? []}
                isLoading={loading}
                page={query.pagina}
                pageSize={query.tamano}
                totalPages={Math.max(1, Math.ceil((result?.total ?? 0) / query.tamano))}
                onPageChange={(pagina) => c.setQuery((q) => ({ ...q, pagina }))}
                onPageSizeChange={(tamano) => c.setQuery((q) => ({ ...q, tamano, pagina: 1 }))}
                emptyMessage="Sin reportes de facturación"
                renderActions={(r) => (
                    <ButtonUtility
                        icon={Edit03}
                        size="xs"
                        color="tertiary"
                        className={compensationTableActionClass}
                        tooltip={accion}
                        aria-label={accion}
                        onClick={() => c.open(r as FacturacionReporte)}
                    />
                )}
                toolbar={<FacturacionAuditoriaFiltros c={c} />}
            />
            {editing && (
                <CompensacionSurface title="Reporte de Facturación" busy={busy} onClose={c.clear}>
                    <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                        <CompensacionDialogHeader title="Reporte de Facturación" busy={busy} onClose={c.clear} />
                        <div className="space-y-4 p-4">
                            <FacturacionAuditoriaForm c={c} />
                        </div>
                    </div>
                </CompensacionSurface>
            )}
        </div>
    );
};
