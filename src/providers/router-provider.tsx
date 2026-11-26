import { type PropsWithChildren, useEffect } from "react";
import { RouterProvider } from "react-aria-components";
import { useNavigate } from "react-router";
import type { NavigateOptions } from "react-router";

declare module "react-aria-components" {
    interface RouterConfig {
        routerOptions: NavigateOptions;
    }
}

/** Ruta interna de un clic que el navegador abriría recargando toda la aplicación. */
const rutaInterna = (event: MouseEvent): string | null => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return null;
    if ((link.target && link.target !== "_self") || link.hasAttribute("download") || link.getAttribute("aria-disabled") === "true") return null;
    if (link.origin !== window.location.origin || link.getAttribute("href")?.startsWith("#")) return null;
    return link.pathname + link.search + link.hash;
};

export const RouteProvider = ({ children }: PropsWithChildren) => {
    const navigate = useNavigate();

    // React Aria llega instalado en varias copias y sus enlaces no siempre ven el RouterProvider.
    // Se interceptan en captura porque React Aria detiene la propagación del clic.
    useEffect(() => {
        const abrirSinRecargar = (event: MouseEvent) => {
            const ruta = rutaInterna(event);
            if (!ruta) return;
            event.preventDefault();
            navigate(ruta);
        };
        document.addEventListener("click", abrirSinRecargar, true);
        return () => document.removeEventListener("click", abrirSinRecargar, true);
    }, [navigate]);

    return <RouterProvider navigate={navigate}>{children}</RouterProvider>;
};
