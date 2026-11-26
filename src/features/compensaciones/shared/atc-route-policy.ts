const root = "/compensaciones/";

/** Pantallas propias de ATC. La asignación del servidor sigue siendo obligatoria. */
export const advisorRoutes = [
    "resumen",
    "calificaciones",
    "llamadas",
    "atenciones",
    "referidos",
    // Esquema 12: Auditoría Operaciones (Seguridad tarjeta + penalidades) e Indisciplina Colaborador (consulta).
    "auditoria-operaciones",
    "indisciplina-colaborador",
    "otros-bonos/propuesta_innovacion",
    "otros-bonos/tiktok_live",
].map((route) => root + route);

const routePath = (route: string) => route.split(/[?#]/)[0].replace(/\/+$/, "");

export const advisorRouteAllowed = (path: string) => {
    const pathname = routePath(path);
    return !pathname.startsWith(root) || advisorRoutes.includes(pathname);
};

/** Compatibilidad de enlaces: el guard exige el permiso del destino, nunca el del alias. */
export const advisorRouteRedirect = (path: string, search = ""): string | null => {
    const pathname = routePath(path);
    const summary = `${root}resumen`;
    if (pathname === `${root}mis-bonos-descuentos`) return summary;
    // Alias: la ruta anterior se conserva hasta el cambio final de rutas.
    if (pathname === `${root}tarjetas-erroneas`) return `${root}auditoria-operaciones`;
    if (pathname === "/atencion/mi-enlace-qr") return `${root}calificaciones`;
    if (pathname === `${root}atenciones` && new URLSearchParams(search).get("canal")?.toUpperCase() === "LIVE") return `${root}otros-bonos/tiktok_live`;
    // Colaborador del Mes ya no existe para ATC (Esquema 12): sin alias, la ruta queda fuera de su alcance.
    return null;
};
