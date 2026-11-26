/** Vistas del mismo recurso: ambas requieren el permiso servidor de Dashboard. */
export const compensationWorkspaceHref = "/compensaciones/resumen?vista=centro";

export const compensationPath = (route: string) => route.split(/[?#]/)[0].replace(/\/+$/, "");
export const compensationViewKey = (route: string) => {
    const path = compensationPath(route);
    const search = route.split("?")[1]?.split("#")[0] ?? "";
    const concept = new URLSearchParams(search).get("concepto");
    if (path === "/compensaciones/incidencias" && (concept === "uniforme" || concept === "indisciplina")) return `${path}?concepto=${concept}`;
    return path === "/compensaciones/resumen" && new URLSearchParams(search).get("vista") === "centro" ? compensationWorkspaceHref : path;
};

/** El catálogo describe tareas; nunca asigna permisos ni consulta datos de negocio. */
export const compensationDestinations = [
    {
        href: "/compensaciones/resumen",
        label: "Dashboard",
        description: "Consulta tus bonos y penalidades con sus estados.",
        group: "Consultar Resultados",
        icon: "results",
    },
    {
        href: "/compensaciones/mis-bonos-descuentos",
        label: "Mis Bonos y Penalidades",
        description: "Consulta tu resumen del mes por concepto y su detalle.",
        group: "Consultar Resultados",
        icon: "results",
    },
    {
        href: "/compensaciones/colaboradores",
        label: "Colaboradores",
        description: "Consulta las personas de tu equipo asignado y su vigencia laboral.",
        group: "Supervisar Equipo",
        icon: "clients",
    },
    {
        href: "/compensaciones/incidencias",
        label: "Incidencias del equipo",
        description: "Registra hallazgos del equipo y consulta su revisión.",
        group: "Supervisar Equipo",
        icon: "activity",
    },
    {
        href: "/compensaciones/incidencias?concepto=uniforme",
        label: "Falta de Uniforme Completo",
        description: "Reporta el hecho con evidencia y consulta su revisión.",
        group: "Supervisar Equipo",
        icon: "proposal",
    },
    {
        href: "/compensaciones/incidencias?concepto=indisciplina",
        label: "Indisciplina Recurrente Activa",
        description: "Registra el hecho y su sustento; la revisión evalúa el estado previo del bono.",
        group: "Supervisar Equipo",
        icon: "proposal",
    },
    {
        href: "/compensaciones/atenciones",
        label: "Registro Nuevo",
        description: "Registra un cliente nuevo y consulta el seguimiento autorizado de su primera operación.",
        group: "Registrar Actividad",
        icon: "clients",
    },
    {
        href: "/compensaciones/otros-bonos/tiktok_live",
        label: "TikTok Live",
        description: "Registra al cliente y la evidencia de tu atención durante el live.",
        group: "Registrar Actividad",
        icon: "activity",
    },
    {
        href: "/compensaciones/calificaciones",
        label: "Atención Calificada",
        description: "Comparte tu QR y vincula las operaciones de la atención calificada.",
        group: "Registrar Actividad",
        icon: "ratings",
    },
    {
        href: "/compensaciones/otros-bonos/meta_sede_safetypay",
        label: "SafetyPay",
        description: "Registra códigos y consulta operaciones y avance de la sede.",
        group: "Registrar Actividad",
        icon: "bank",
    },
    {
        href: "/compensaciones/referidos",
        label: "Referidos",
        description: "Registra al cliente referido y consulta sus operaciones vinculadas.",
        group: "Registrar Actividad",
        icon: "clients",
    },
    {
        href: "/compensaciones/llamadas",
        label: "Llamadas",
        description: "Registra una llamada atendida y consulta su revisión.",
        group: "Registrar Actividad",
        icon: "phone",
    },
    {
        href: "/compensaciones/tarjetas-erroneas",
        label: "Tarjetas Erróneas",
        description: "Reporta una detección de tarjeta de terceros con su sustento.",
        group: "Registrar Actividad",
        icon: "card",
    },
    {
        href: "/compensaciones/auditoria-operaciones",
        label: "Auditoría Operaciones",
        description: "Registra tus auditorías y consulta las penalidades de auditoría con su descargo.",
        group: "Registrar Actividad",
        icon: "card",
    },
    {
        href: "/compensaciones/indisciplina-colaborador",
        label: "Indisciplina Colaborador",
        description: "Registra o consulta las faltas de uniforme e indisciplina y presenta tu descargo.",
        group: "Consultar Resultados",
        icon: "results",
    },
    {
        href: "/compensaciones/auditoria-cuadre-cierre",
        label: "Auditoría Cuadre y Cierre",
        description: "Consulta tu cuadre, descuadres y cierres diarios, y presenta tu descargo.",
        group: "Consultar Resultados",
        icon: "results",
    },
    {
        href: "/compensaciones/penalidad-escalonada-bonos",
        label: "Penalidad Escalonada Bonos",
        description: "Consulta las penalidades escalonadas de tu sede y presenta tu descargo.",
        group: "Consultar Resultados",
        icon: "results",
    },
    {
        href: "/compensaciones/otros-bonos/propuesta_innovacion",
        label: "Propuesta de Innovación",
        description: "Prepara tu propuesta y consulta la decisión de Administración.",
        group: "Registrar Actividad",
        icon: "proposal",
    },
    {
        href: "/compensaciones/auditoria-activa",
        label: "Auditoría de Pagos",
        description: "Reporta hallazgos operativos y consulta su revisión y las operaciones vinculadas.",
        group: "Registrar Actividad",
        icon: "activity",
    },
    {
        href: "/compensaciones/otros-bonos/reporte_abandono",
        label: "Abandono Comercial",
        description: "Sustenta la atención asumida y consulta la revisión del reporte.",
        group: "Registrar Actividad",
        icon: "phone",
    },
    {
        href: "/compensaciones/otros-bonos/video_viral",
        label: "Video Viral",
        description: "Registra tus videos con sus métricas y la evidencia para el bono mensual.",
        group: "Registrar Actividad",
        icon: "activity",
    },
    {
        href: "/compensaciones/otros-bonos/recuperacion_cliente",
        label: "Recuperación",
        description: "Registra al cliente que volvió tras más de 60 días sin actividad; aprueba Administración.",
        group: "Registrar Actividad",
        icon: "activity",
    },
    {
        href: "/compensaciones/otros-bonos/alerta_temprana",
        label: "Alerta Temprana",
        description: "Reporta un error de datos o un chat sin respuesta para su revisión.",
        group: "Registrar Actividad",
        icon: "activity",
    },
] as const;

export type CompensationDestination = (typeof compensationDestinations)[number];

/** La intersección exacta con permisos reales evita mostrar destinos por el rol solo. */
export const getCompensationDestinations = (routes: readonly string[], routeAllowed: (route: string) => boolean = () => true) => {
    const assigned = new Set(routes.map(compensationPath));
    return compensationDestinations.filter((destination) => assigned.has(compensationPath(destination.href)) && routeAllowed(destination.href));
};
