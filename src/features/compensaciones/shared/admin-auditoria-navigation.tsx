import { useInRouterContext, useLocation, useSearchParams } from "react-router";
import { CompensacionOptions } from "./compensacion-options";
import { useCompensacionPerfil } from "./compensacion-perfil";

const NavigationContent = () => {
    const { pathname } = useLocation();
    const [params, setParams] = useSearchParams();
    if (pathname !== "/compensaciones/auditoria-activa") return null;
    return (
        <CompensacionOptions
            label="Bandejas de Auditoría"
            selected={params.get("vista") || "facturacion"}
            options={[
                { id: "facturacion", label: "Facturación", description: "Errores de pago y operaciones extras reportados." },
                { id: "pagos", label: "Hallazgos de Pagos", description: "Errores manuales y códigos detectados por el gestor." },
                { id: "jefatura", label: "Reportes del Equipo", description: "Auditoría activa y revisión del hecho reportado." },
            ]}
            onChange={(view) =>
                setParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("vista", view);
                    return next;
                })
            }
        />
    );
};

export const AdminAuditoriaNavigation = () => {
    const { isAdministrator } = useCompensacionPerfil();
    const routed = useInRouterContext();
    return isAdministrator && routed ? <NavigationContent /> : null;
};
