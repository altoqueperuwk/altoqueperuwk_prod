/** Marketing: resultados propios y capturas del bloque 2; sin gestión administrativa. */
export const marketingRoutes = [
    "resumen",
    "referidos",
    "auditoria-operaciones",
    "indisciplina-colaborador",
    "otros-bonos/video_viral",
    "otros-bonos/recuperacion_cliente",
    "otros-bonos/tiktok_live",
    "otros-bonos/propuesta_innovacion",
].map((route) => `/compensaciones/${route}`);
export const marketingRouteAllowed = (path: string) => {
    const route = path.split(/[?#]/)[0].replace(/\/+$/, "");
    if (["/sistema", "/reportes", "/dashboard"].includes(route) || route.startsWith("/sistema/") || route.startsWith("/reportes/")) return false;
    return (route !== "/compensaciones" && !route.startsWith("/compensaciones/")) || marketingRoutes.includes(route);
};

/** Compatibilidad de enlaces: Incidencias pasó a Indisciplina Colaborador y Alerta Temprana a Auditoría Operaciones. */
export const marketingRouteRedirect = (path: string): string | null => {
    const route = path.split(/[?#]/)[0].replace(/\/+$/, "");
    if (route === "/compensaciones/mis-bonos-descuentos") return "/compensaciones/resumen";
    if (route === "/compensaciones/incidencias") return "/compensaciones/indisciplina-colaborador";
    return route === "/compensaciones/otros-bonos/alerta_temprana" ? "/compensaciones/auditoria-operaciones" : null;
};
