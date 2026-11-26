const root = "/compensaciones/";

/** Jefatura supervisa su equipo vigente; el servidor verifica cada expediente. */
export const storeManagerRoutes = [
    "resumen",
    "colaboradores",
    "calificaciones",
    "llamadas",
    "atenciones",
    "referidos",
    "mis-bonos-descuentos",
    // Incidencias del equipo queda como dashboard; el registro vive en las opciones compartidas con ATC.
    "incidencias",
    // Esquema 12: Auditoría Operaciones (Caza-Errores), Indisciplina Colaborador (Uniforme/Indisciplina) y Penalidad Escalonada Bonos.
    "auditoria-operaciones",
    "indisciplina-colaborador",
    "penalidad-escalonada-bonos",
    "otros-bonos/propuesta_innovacion",
    "otros-bonos/tiktok_live",
].map((route) => root + route);
export const storeManagerRouteAllowed = (route: string) => {
    const path = route.split(/[?#]/)[0].replace(/\/+$/, "");
    // Uniforme e Indisciplina ya no son vistas de Incidencias: se registran en Indisciplina Colaborador.
    if (path.startsWith("/compensaciones/") && /[?&]concepto=/.test(route)) return false;
    return !path.startsWith("/compensaciones/") || storeManagerRoutes.includes(path);
};

/** Compatibilidad de enlaces del Jefe: la ruta anterior lleva a la opción que la absorbió (el guard exige el permiso del destino). */
export const storeManagerRouteRedirect = (path: string): string | null => {
    const pathname = path.split(/[?#]/)[0].replace(/\/+$/, "");
    // Las alertas tempranas de Marketing se validan dentro de Auditoría Operaciones.
    return pathname === root + "auditoria-activa" || pathname === root + "otros-bonos/alerta_temprana" ? root + "auditoria-operaciones" : null;
};
