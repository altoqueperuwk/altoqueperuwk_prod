import { useState } from "react";
import { Activity, Bank, BarChart03, Calendar, CreditCard01, File07, Phone01, Star01, Users03 } from "@untitledui/icons";
import { Link } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { Input } from "@/components/base/input/input";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { useSessionCache } from "@/providers/session-cache-provider";
import { AdminCentroTrabajoPage } from "../administracion/admin-centro-page";
import { type CompensationDestination, getCompensationDestinations } from "../shared/compensacion-destinos";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { advisorRouteAllowed, useCompensacionPerfil } from "../shared/compensacion-perfil";
import { groupCompensacionesDestinations } from "../shared/compensaciones-navigation";
import { facturacionRouteAllowed } from "../shared/facturacion-route-policy";
import { storeManagerRouteAllowed } from "../shared/jefatura-route-policy";
import { marketingRouteAllowed } from "../shared/marketing-route-policy";
import { pagosRouteAllowed } from "../shared/pagos-route-policy";

const icons = {
    results: BarChart03,
    attendance: Calendar,
    clients: Users03,
    activity: Activity,
    ratings: Star01,
    bank: Bank,
    phone: Phone01,
    card: CreditCard01,
    proposal: File07,
};
const normalized = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es-PE");

/** Solo presenta enlaces permitidos. No carga expedientes ni genera efectos al abrir. */
export const CentroTrabajoPage = withAlertProvider(() => {
    const { navegacion, isLoading, navigationError } = useSessionCache();
    const profile = useCompensacionPerfil();
    const [search, setSearch] = useState("");
    if (profile.isAdministrator && !profile.isResolving) return <AdminCentroTrabajoPage />;
    const routeAllowed = profile.isAdvisor
        ? advisorRouteAllowed
        : profile.isStoreManager
          ? storeManagerRouteAllowed
          : profile.isFacturacion
            ? facturacionRouteAllowed
            : profile.isPagos
              ? pagosRouteAllowed
              : profile.isMarketing
                ? marketingRouteAllowed
                : () => true;
    const destinos: { href: string; label: string; description: string; group: string; icon: CompensationDestination["icon"] }[] = getCompensationDestinations(
        navegacion?.rutas_permitidas ?? [],
        routeAllowed,
    );
    const entries = destinos
        // Igual que el menú: Pagos y Marketing ven su lista personal en /resumen.
        .filter((entry) => !(profile.isPagos || profile.isMarketing) || entry.href !== "/compensaciones/mis-bonos-descuentos")
        // Facturación, Pagos y Marketing: sin vistas por concepto.
        .filter((entry) => !(profile.isFacturacion || profile.isPagos || profile.isMarketing) || !entry.href.includes("?concepto="))
        .map((entry) =>
            profile.isStoreManager && entry.href === "/compensaciones/auditoria-activa"
                ? {
                      ...entry,
                      label: "Auditoría Activa",
                      description: "Registra los errores que detectas en tu equipo antes de que escalen y consulta su revisión.",
                  }
                : entry,
        )
        .filter((entry) => entry.group !== "Supervisar Equipo" || (!profile.isAdvisor && !profile.isFacturacion && !profile.isPagos && !profile.isMarketing));
    const grupos = groupCompensacionesDestinations(entries);
    const total = grupos.reduce((suma, grupo) => suma + grupo.items.length, 0);
    const terms = normalized(search).trim().split(/\s+/).filter(Boolean);
    const visible = grupos.flatMap((grupo) => {
        const items = grupo.items.filter((entry) => terms.every((term) => normalized(`${entry.label} ${entry.description} ${grupo.label}`).includes(term)));
        return items.length ? [{ ...grupo, items }] : [];
    });
    return (
        <AppLayout>
            <div className="min-w-0 space-y-4">
                <CompensacionHeading section="resumen" title="Centro de Trabajo" />
                {isLoading || profile.isResolving ? (
                    <p role="status" className="text-sm text-tertiary">
                        Verificando tus accesos…
                    </p>
                ) : navigationError ? (
                    <AlertMessage tone="error">{navigationError}</AlertMessage>
                ) : (
                    <CompensacionPanel title="Opciones Disponibles" trailing={<span className="text-xs text-tertiary">{total} opciones</span>}>
                        <div className="space-y-4">
                            <div className="w-full sm:max-w-sm">
                                <Input
                                    aria-label="Buscar opción"
                                    isRequired={false}
                                    placeholder="Buscar opción"
                                    size="sm"
                                    value={search}
                                    onChange={setSearch}
                                />
                            </div>
                            {visible.length === 0 && (
                                <p role="status" className="py-3 text-sm text-tertiary">
                                    {total === 0 ? "No tienes opciones asignadas para este centro." : "No hay opciones que coincidan con tu búsqueda."}
                                </p>
                            )}
                            {visible.length > 0 && (
                                <nav aria-label="Opciones del Centro de Trabajo" className="min-w-0 space-y-5">
                                    {visible.map((grupo) => (
                                        <div key={grupo.label} className="space-y-2">
                                            <h2 className="text-sm font-semibold text-secondary">{grupo.label}</h2>
                                            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                                {grupo.items.map((entry) => {
                                                    const Icon = icons[entry.icon];
                                                    return (
                                                        <Link
                                                            key={entry.href}
                                                            to={entry.href}
                                                            className="group flex min-w-0 flex-col rounded-xl border border-secondary bg-primary p-4 transition-colors hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="rounded-lg border border-secondary bg-secondary p-2 text-brand-secondary">
                                                                    <Icon aria-hidden="true" className="size-5" />
                                                                </span>
                                                                <h3 className="text-sm font-semibold text-primary">{entry.label}</h3>
                                                            </div>
                                                            <p className="mt-3 flex-1 text-xs text-tertiary">{entry.description}</p>
                                                            <span aria-hidden="true" className="mt-4 text-xs font-semibold text-brand-secondary">
                                                                Abrir
                                                            </span>
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </nav>
                            )}
                        </div>
                    </CompensacionPanel>
                )}
            </div>
        </AppLayout>
    );
});
