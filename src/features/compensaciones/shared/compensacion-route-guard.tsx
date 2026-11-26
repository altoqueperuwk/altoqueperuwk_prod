import type { ReactNode } from "react";
import { RefreshCw01 } from "@untitledui/icons";
import { Navigate, useLocation } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { useSessionCache } from "@/providers/session-cache-provider";
import { cazaErroresLegacyRoutes } from "../incidencias/caza-errores-policy";
import { adminRouteRedirect } from "./admin-route-policy";
import { advisorRouteRedirect } from "./atc-route-policy";
import { advisorRouteAllowed, useCompensacionPerfil } from "./compensacion-perfil";
import { facturacionRouteAllowed, facturacionRouteRedirect } from "./facturacion-route-policy";
import { storeManagerRouteAllowed, storeManagerRouteRedirect } from "./jefatura-route-policy";
import { marketingRouteAllowed, marketingRouteRedirect } from "./marketing-route-policy";
import { pagosRouteAllowed, pagosRouteRedirect } from "./pagos-route-policy";

export const CompensacionRouteGuard = withAlertProvider(({ children }: { children: ReactNode }) => {
    const { pathname, search } = useLocation();
    const { navegacion, isLoading, navigationError, reloadNavigation } = useSessionCache();
    const { isAdvisor, isStoreManager, isFacturacion, isPagos, isMarketing, isAdministrator, isResolving } = useCompensacionPerfil();
    const redirect =
        cazaErroresLegacyRoutes[pathname.replace(/\/+$/, "")] ??
        (isAdministrator
            ? adminRouteRedirect(pathname, search)
            : isAdvisor
              ? advisorRouteRedirect(pathname, search)
              : isStoreManager
                ? storeManagerRouteRedirect(pathname)
                : isFacturacion
                  ? (facturacionRouteRedirect(pathname) ??
                    (pathname.replace(/\/+$/, "") === "/compensaciones/mis-bonos-descuentos" ? "/compensaciones/resumen" : null))
                  : isPagos
                    ? pagosRouteRedirect(pathname)
                    : isMarketing
                      ? marketingRouteRedirect(pathname)
                      : null);
    if (isFacturacion && !redirect && !facturacionRouteAllowed(pathname)) return <Navigate to="/403" replace />;
    if (isPagos && !redirect && !pagosRouteAllowed(pathname)) return <Navigate to="/403" replace />;
    if (isMarketing && !redirect && pathname.replace(/\/+$/, "") !== "/compensaciones" && !marketingRouteAllowed(pathname))
        return <Navigate to="/403" replace />;
    if (!redirect && pathname !== "/compensaciones" && !pathname.startsWith("/compensaciones/")) return <>{children}</>;
    if (isLoading || isResolving)
        return (
            <p role="status" className="text-sm text-tertiary">
                Verificando acceso…
            </p>
        );
    if (navigationError)
        return (
            <div className="space-y-3">
                <AlertMessage tone="error">{navigationError}</AlertMessage>
                <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={reloadNavigation}>
                    Reintentar
                </Button>
            </div>
        );
    const routes = (navegacion?.rutas_permitidas ?? []).filter(
        (route) =>
            (!isAdvisor || advisorRouteAllowed(route)) &&
            (!isStoreManager || storeManagerRouteAllowed(route)) &&
            (!isFacturacion || facturacionRouteAllowed(route)) &&
            (!isPagos || pagosRouteAllowed(route)) &&
            (!isMarketing || marketingRouteAllowed(route)),
    );
    if (redirect) return <Navigate to={routes.includes(redirect.split("?")[0]) ? redirect : "/403"} replace />;
    if (pathname.replace(/\/+$/, "") === "/compensaciones") {
        const first = routes.find((route) => route.startsWith("/compensaciones/"));
        return <Navigate to={first ?? "/403"} replace />;
    }
    return routes.includes(pathname.replace(/\/+$/, "")) ? <>{children}</> : <Navigate to="/403" replace />;
});
