/** Facturación (rol 5). Esta lista restringe permisos existentes; nunca los concede. */
export const facturacionRoutes = ["resumen", "referidos", "auditoria-operaciones", "indisciplina-colaborador", "otros-bonos/propuesta_innovacion"].map(
    (route) => `/compensaciones/${route}`,
);

export const facturacionRouteAllowed = (path: string) => {
    const route = path.split(/[?#]/)[0].replace(/\/+$/, "");
    return !route.startsWith("/compensaciones/") || facturacionRoutes.includes(route);
};

/** Compatibilidad de enlaces: Auditoría Activa quedó absorbida por Auditoría Operaciones. */
export const facturacionRouteRedirect = (path: string): string | null =>
    path.split(/[?#]/)[0].replace(/\/+$/, "") === "/compensaciones/auditoria-activa" ? "/compensaciones/auditoria-operaciones" : null;
