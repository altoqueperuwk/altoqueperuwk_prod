import { useSearchParams } from "react-router";
import { IncidenciasPage } from "../incidencias/incidencias-page";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { FacturacionAuditoriaPage } from "./facturacion-auditoria-page";
import { PagosDeteccionesPage } from "./pagos-detecciones-page";

export const FacturacionAuditoriaRoute = () => {
    const { isFacturacion, isAdministrator, isResolving } = useCompensacionPerfil();
    const [params] = useSearchParams();
    if (isResolving) return <p className="p-6 text-sm text-tertiary">Cargando perfil…</p>;
    if (isAdministrator && params.get("vista") === "pagos") return <PagosDeteccionesPage tipo="DETECCION_ERROR_MANUAL" />;
    if (isFacturacion || (isAdministrator && params.get("vista") !== "jefatura")) return <FacturacionAuditoriaPage />;
    return <IncidenciasPage auditoriaOnly />;
};
