import type { ReactNode } from "react";
import { Link } from "react-router";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionPanel } from "@/features/compensaciones/shared/compensacion-panel";
import { useCompensacionPerfil } from "@/features/compensaciones/shared/compensacion-perfil";
import { facturacionRouteAllowed } from "@/features/compensaciones/shared/facturacion-route-policy";
import { useSessionCache } from "@/providers/session-cache-provider";
import type { CompensacionPeriodo } from "./compensaciones-resumen.types";

const shortcuts = [
    ["colaboradores", "Mi ficha", "Cargo, sede y datos laborales"],
    ["calificaciones", "Mis calificaciones", "Respuestas de clientes y ganancia aprobada"],
    ["mis-bonos-descuentos", "Mis Bonos y Penalidades", "Seguimiento por concepto y detalle liquidado del mes"],
];

/** No reutiliza montos ni contadores globales del periodo para un asesor. */
export const ResumenPersonal = ({
    periodo,
    toolbar,
    shortcutsOnly = false,
}: {
    periodo: CompensacionPeriodo | null;
    toolbar?: ReactNode;
    shortcutsOnly?: boolean;
}) => {
    const { navegacion } = useSessionCache();
    const { isFacturacion } = useCompensacionPerfil();
    // Facturación restringe lo que concede el servidor: Mis Bonos y Penalidades y Evidencias ya no son accesos suyos.
    const allowed = (navegacion?.rutas_permitidas ?? []).filter((route) => !isFacturacion || facturacionRouteAllowed(route));
    return (
        <div className="space-y-5">
            {!shortcutsOnly && (
                <CompensacionPanel title="Mi seguimiento mensual">
                    {periodo ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <p className="text-sm text-secondary">{periodo.nombre}</p>
                            <CompensacionEstado dominio="periodo" valor={periodo.estadoPeriodo} />
                            <p className="w-full text-xs text-tertiary">
                                {isFacturacion
                                    ? "Consulta tus bonos y penalidades en el Dashboard; los pendientes de revisión no representan un pago aprobado."
                                    : "Consulta tus montos en Mis Bonos y Penalidades; los bonos pendientes de revisión no representan un pago aprobado."}
                            </p>
                        </div>
                    ) : (
                        <p className="mt-3 text-sm text-tertiary">
                            Aún no tienes un período disponible. Puedes consultar tus registros en las opciones habilitadas.
                        </p>
                    )}
                </CompensacionPanel>
            )}
            {toolbar && (
                <CompensacionPanel title="Consultar período" ariaLabel="Consultar período">
                    {toolbar}
                </CompensacionPanel>
            )}
            <nav aria-label="Mis opciones de compensaciones" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shortcuts
                    .filter(
                        ([path]) =>
                            (!shortcutsOnly || !["mis-bonos-descuentos", "colaboradores"].includes(path)) &&
                            allowed.includes(`/compensaciones/${path.split("?")[0]}`),
                    )
                    .map(([path, label, description]) => (
                        <Link
                            key={path}
                            to={`/compensaciones/${path}`}
                            className="rounded-xl border border-secondary bg-primary p-5 shadow-xs hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                            <h2 className="text-sm font-semibold text-primary">{label}</h2>
                            <p className="mt-2 text-xs text-tertiary">{description}</p>
                        </Link>
                    ))}
            </nav>
        </div>
    );
};
