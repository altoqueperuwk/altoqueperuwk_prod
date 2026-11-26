import { ChevronRight } from "@untitledui/icons";
import { Link, useLocation } from "react-router";
import { useCompensacionPerfil } from "@/features/compensaciones/shared/compensacion-perfil";
import { compensacionesMenuLabel } from "@/features/compensaciones/shared/compensaciones-navigation";
import { useAtkBrand } from "@/hooks/use-atk-brand";
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
    "/atencion": "Atencion al Cliente",
    "/atencion/cliente": "Clientes",
    "/atencion/mi-enlace-qr": "Mi enlace y QR",
    "/compensaciones": "Compensaciones",
    "/compensaciones/resumen": "Resumen",
    "/compensaciones/colaboradores": "Colaboradores",
    "/compensaciones/evidencias": "Todos los registros",
    "/compensaciones/calificaciones": "Atención Calificada",
    "/compensaciones/llamadas": "Llamadas",
    "/compensaciones/tarjetas-erroneas": "Tarjetas erróneas",
    "/compensaciones/auditoria-operaciones": "Auditoría Operaciones",
    "/compensaciones/indisciplina-colaborador": "Indisciplina Colaborador",
    "/compensaciones/penalidad-escalonada-bonos": "Penalidad Escalonada Bonos",
    "/compensaciones/referidos": "Referidos",
    "/compensaciones/atenciones": "Registro Nuevo",
    "/compensaciones/otros-bonos": "Otros bonos",
    "/compensaciones/auditoria-activa": "Auditoría de Pagos",
    "/compensaciones/incidencias": "Incidencias del equipo",
    "/compensaciones/mis-bonos-descuentos": "Mis Bonos y Penalidades",
    "/compensaciones/bonos-mes": "Bonos del mes",
    "/compensaciones/configuracion": "Configuración",
    "/compensaciones/reportes": "Reporte de Bonos",
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
    "/reportes": "Reportes",
    "/reportes/cierre-caja": "Cierre de Caja",
    "/reportes/metricas-bancarias": "Métricas Bancarias",
    "/reportes/metricas-bancarias/pago-deuda": "Pago Deuda",
    "/reportes/metricas-bancarias/pos": "POS",
    "/reportes/metricas-bancarias/link-pago": "Link Pago",
    "/bandeja": "Bandeja",
    "/": "Inicio",
};

export const Breadcrumb = () => {
    const { pathname, search } = useLocation();
    const compact = pathname.startsWith("/compensaciones/");
    const { isAdministrator, isStoreManager, isResolving } = useCompensacionPerfil();
    // Quien no administra ve en /resumen su lista personal de bonos y penalidades (Jefatura conserva su menú propio).
    const personalResumen = pathname === "/compensaciones/resumen" && !search && !isAdministrator && !isStoreManager && !isResolving;
    useAtkBrand(pathname.startsWith("/compensaciones"));

    return (
        <nav aria-label="Breadcrumb" className={cx("flex items-center gap-2", compact && "min-w-0 flex-1")}>
            {pathname === "/" ? (
                <span className="shrink-0 text-sm font-medium text-primary">Inicio</span>
            ) : (
                <Link to="/" className="atk-crumb-link shrink-0 rounded-sm text-sm text-tertiary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2">
                    Inicio
                </Link>
            )}
            {pathname !== "/" &&
                pathname
                    .split("/")
                    .filter(Boolean)
                    .map((_segment, index, segments) => {
                        const fullPath = "/" + segments.slice(0, index + 1).join("/");
                        const fallbackLabel =
                            routeLabels[fullPath] ||
                            (pathname.startsWith("/compensaciones/otros-bonos/") && index === 2
                                ? segments[index].replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
                                : segments[index].charAt(0).toUpperCase() + segments[index].slice(1));
                        const isLast = index === segments.length - 1;
                        const label =
                            isLast && personalResumen ? "Mis Bonos y Penalidades" : compensacionesMenuLabel(fallbackLabel, fullPath + (isLast ? search : ""));

                        return (
                            <span key={fullPath} className={cx("flex items-center gap-2", compact && (isLast ? "min-w-0" : "hidden shrink-0 sm:flex"))}>
                                <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                                <span title={label} className={cx("text-sm", compact && "truncate", isLast ? "font-medium text-primary" : "text-tertiary")}>
                                    {label}
                                </span>
                            </span>
                        );
                    })}
        </nav>
    );
};
