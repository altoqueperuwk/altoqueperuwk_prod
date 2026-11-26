const root = "/compensaciones/";
const operaciones = `${root}auditoria-operaciones`;
const resumen = `${root}resumen`;

/** Opciones anteriores del Administrador y la opción que las reemplazó. SafetyPay y Colaborador del Mes ya no se usan (Esquema 12). */
const retired: Record<string, string> = {
    [`${root}incidencias`]: operaciones,
    [`${root}auditoria-activa`]: operaciones,
    [`${root}tarjetas-erroneas`]: operaciones,
    [`${root}otros-bonos/reporte_abandono`]: operaciones,
    [`${root}otros-bonos/alerta_temprana`]: operaciones,
    [`${root}evidencias`]: resumen,
    [`${root}otros-bonos/meta_sede_safetypay`]: resumen,
    [`${root}otros-bonos/colaborador_mes_atenciones`]: resumen,
    [`${root}otros-bonos/colaborador_mes_calificaciones`]: resumen,
};

const routePath = (route: string) => route.split(/[?#]/)[0].replace(/\/+$/, "");

/** Solo oculta y redirige: los permisos de estas rutas siguen autorizando en el servidor las revisiones de las opciones nuevas. */
export const adminRouteRetired = (route: string) => Object.hasOwn(retired, routePath(route));

export const adminRouteRedirect = (path: string, search = ""): string | null => {
    const pathname = routePath(path);
    const concept = new URLSearchParams(search).get("concepto");
    if (pathname === `${root}incidencias` && (concept === "uniforme" || concept === "indisciplina")) return `${root}indisciplina-colaborador`;
    return retired[pathname] ?? null;
};
