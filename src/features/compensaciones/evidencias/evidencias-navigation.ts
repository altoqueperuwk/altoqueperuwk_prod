import type { EvidenciaCategoria } from "./evidencias.types";

/** Todas estas pantallas conservan el recurso backend EVIDENCIAS. */
export const evidenciaScreens: Array<{
    path: string;
    category: EvidenciaCategoria | "";
    label: string;
    description: string;
    icon: string;
}> = [
    {
        path: "/compensaciones/calificaciones",
        category: "CALIFICACION",
        label: "Atención Calificada",
        description: "Revisa las estrellas y su aprobación.",
        icon: "star",
    },
    {
        path: "/compensaciones/llamadas",
        category: "LLAMADA",
        label: "Llamadas",
        description: "Registra llamadas contestadas y consulta su aprobación.",
        icon: "phone",
    },
    {
        path: "/compensaciones/tarjetas-erroneas",
        category: "TARJETA_TERCERO",
        label: "Tarjetas erróneas",
        description: "Reporta tarjetas de terceros.",
        icon: "credit-card",
    },
    { path: "/compensaciones/referidos", category: "REFERIDO", label: "Referidos", description: "Consulta las comisiones vinculadas.", icon: "users" },
    { path: "/compensaciones/otros-bonos", category: "OTRO", label: "Otros bonos", description: "Registra y revisa bonos adicionales.", icon: "coins-stacked" },
    {
        path: "/compensaciones/evidencias",
        category: "",
        label: "Todos los registros",
        description: "Consulta los bonos y comisiones registrados.",
        icon: "file-text",
    },
];

interface MenuEntry {
    nombre: string;
    ruta: string | null;
    icono: string;
}

/** Expande solo un acceso ya autorizado; no crea permisos ni modifica otros módulos. */
export const expandEvidenciasMenu = <T extends MenuEntry>(entries: T[]): T[] => {
    const existingRoutes = new Set(entries.map((entry) => entry.ruta));
    return entries.flatMap((entry) =>
        entry.ruta === "/compensaciones/evidencias"
            ? evidenciaScreens
                  .filter((screen) => screen.path === entry.ruta || !existingRoutes.has(screen.path))
                  .map((screen) => ({ ...entry, nombre: screen.label, ruta: screen.path, icono: screen.icon }))
            : [entry],
    );
};
