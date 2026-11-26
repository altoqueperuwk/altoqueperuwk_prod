import { useState } from "react";
import { ArrowUpRight, LayoutGrid01 } from "@untitledui/icons";
import { Link } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { Input } from "@/components/base/input/input";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { useSessionCache } from "@/providers/session-cache-provider";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { getAdminDestinations } from "./admin-destinos";

const normal = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
export const AdminCentroTrabajoPage = withAlertProvider(() => {
    const { navegacion, isLoading, navigationError } = useSessionCache();
    const [search, setSearch] = useState("");
    const entries = getAdminDestinations(navegacion?.rutas_permitidas ?? []);
    const terms = normal(search).trim().split(/\s+/).filter(Boolean);
    const visible = entries.filter((entry) => terms.every((term) => normal(`${entry.label} ${entry.description} ${entry.group}`).includes(term)));
    return (
        <AppLayout>
            <div className="min-w-0 space-y-4">
                <CompensacionHeading section="resumen" title="Centro de Trabajo" />
                {isLoading ? (
                    <p role="status">Verificando tus accesos…</p>
                ) : navigationError ? (
                    <AlertMessage tone="error">{navigationError}</AlertMessage>
                ) : (
                    <>
                        <CompensacionPanel
                            title="Buscar Opción"
                            trailing={<span className="text-xs text-tertiary">{entries.length} opciones disponibles</span>}
                        >
                            <div className="max-w-sm">
                                <Input aria-label="Buscar opción" size="sm" value={search} onChange={setSearch} placeholder="Opción o tarea administrativa" />
                            </div>
                        </CompensacionPanel>
                        {!visible.length && (
                            <p role="status" className="text-sm text-tertiary">
                                {entries.length ? "No hay opciones que coincidan con tu búsqueda." : "No tienes opciones asignadas para este centro."}
                            </p>
                        )}
                        {[...new Set(visible.map((entry) => entry.group))].map((group) => {
                            const items = visible.filter((entry) => entry.group === group);
                            return (
                                !!items.length && (
                                    <CompensacionPanel key={group} title={group}>
                                        <nav aria-label={group} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                            {items.map((entry) => (
                                                <Link
                                                    key={entry.href}
                                                    to={entry.href}
                                                    className="flex min-w-0 flex-col rounded-xl border border-secondary bg-primary p-4 hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-brand"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <LayoutGrid01 className="size-5 shrink-0 text-brand-secondary" aria-hidden="true" />
                                                        <h3 className="text-sm font-semibold text-primary">{entry.label}</h3>
                                                    </div>
                                                    <p className="mt-3 flex-1 text-xs text-tertiary">{entry.description}</p>
                                                    <span className="mt-4 flex items-center gap-1 text-xs font-semibold text-brand-secondary">
                                                        Abrir
                                                        <ArrowUpRight className="size-4" aria-hidden="true" />
                                                    </span>
                                                </Link>
                                            ))}
                                        </nav>
                                    </CompensacionPanel>
                                )
                            );
                        })}
                    </>
                )}
            </div>
        </AppLayout>
    );
});
