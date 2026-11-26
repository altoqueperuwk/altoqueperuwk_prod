/** Pagos (rol 2): una opción por ruta; el cargo decide el monto y el servidor decide el acceso. Esta lista restringe, nunca concede. */
export const pagosRoutes = [
    "resumen",
    "atenciones",
    "referidos",
    "otros-bonos/tiktok_live",
    "otros-bonos/propuesta_innovacion",
    "auditoria-operaciones",
    "auditoria-cuadre-cierre",
    "indisciplina-colaborador",
    "penalidad-escalonada-bonos",
].map((route) => `/compensaciones/${route}`);
export const pagosRouteAllowed = (path: string) => {
    const route = path.split(/[?#]/)[0].replace(/\/+$/, "");
    return !route.startsWith("/compensaciones/") || pagosRoutes.includes(route);
};

/** Compatibilidad de enlaces: Auditoría Activa y Abandono comercial quedaron absorbidos por Auditoría Operaciones. */
export const pagosRouteRedirect = (path: string): string | null => {
    const route = path.split(/[?#]/)[0].replace(/\/+$/, "");
    if (route === "/compensaciones/mis-bonos-descuentos") return "/compensaciones/resumen";
    return route === "/compensaciones/auditoria-activa" || route === "/compensaciones/otros-bonos/reporte_abandono"
        ? "/compensaciones/auditoria-operaciones"
        : null;
};
