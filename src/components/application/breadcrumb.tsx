import { useLocation } from "react-router";
import { ChevronRight } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const routeLabels: Record<string, string> = {
    "/sistema/estado": "Estados",
    "/sistema/rol": "Roles",
    "/sistema/sucursal": "Sucursales",
    "/sistema/comunidad": "Comunidades",
    "/sistema/usuario": "Usuarios",
    "/sistema/permiso-menu": "Permisos Menu",
    "/sistema/permiso-usuario": "Permisos Usuario",
    "/sistema/cliente": "Clientes",
    "/sistema/codigo-servicio": "Codigos Servicio",
    "/sistema/banco": "Bancos",
    "/sistema/empresa": "Empresas",
    "/sistema/reglas-efectivizacion": "Reglas Efectivizacion",
    "/sistema/caja-operativa": "Caja Operativa",
    "/sistema": "Sistema",
    "/operaciones": "Operaciones",
    "/operaciones/bcp": "BCP",
    "/operaciones/bbva": "BBVA",
    "/operaciones/scotiabank": "Scotiabank",
    "/operaciones/banbif": "BanBif",
    "/operaciones/interbank": "Interbank",
    "/operaciones/safetypay": "SafetyPay",
    "/operaciones/pos": "POS",
    "/operaciones/linkpago": "Link Pago",
    "/operaciones/deuda": "Pago Deuda",
    "/operaciones/pago-deuda": "Pago Deuda",
    "/operaciones/pagodeuda": "Pago Deuda",
    "/": "Home",
};

export const Breadcrumb = () => {
    const { pathname } = useLocation();

    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-2">
            <span
                className={cx(
                    "text-sm",
                    pathname === "/" ? "text-primary font-medium" : "text-tertiary",
                )}
            >
                Home
            </span>
            {pathname !== "/" &&
                pathname
                    .split("/")
                    .filter(Boolean)
                    .map((_segment, index, segments) => {
                        const fullPath = "/" + segments.slice(0, index + 1).join("/");
                        const label =
                            routeLabels[fullPath] ||
                            segments[index].charAt(0).toUpperCase() + segments[index].slice(1);
                        const isLast = index === segments.length - 1;

                        return (
                            <span key={fullPath} className="flex items-center gap-2">
                                <ChevronRight
                                    className="size-4 text-tertiary"
                                    aria-hidden="true"
                                />
                                <span
                                    className={cx(
                                        "text-sm",
                                        isLast ? "text-primary font-medium" : "text-tertiary",
                                    )}
                                >
                                    {label}
                                </span>
                            </span>
                        );
                    })}
        </nav>
    );
};
