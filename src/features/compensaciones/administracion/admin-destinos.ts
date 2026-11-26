import { adminRouteRetired } from "../shared/admin-route-policy";
import { compensationPath, getCompensationDestinations } from "../shared/compensacion-destinos";
import { groupCompensacionesDestinations } from "../shared/compensaciones-navigation";

export interface AdminDestination {
    href: string;
    label: string;
    description: string;
}
const extra: AdminDestination[] = [
    {
        href: "/compensaciones/bonos-mes",
        label: "Bonos del mes",
        description: "Revisa lo que acumuló cada colaborador y confirma el reporte del mes.",
    },
    {
        href: "/compensaciones/reportes",
        label: "Reporte de Bonos",
        description: "Consulta reportes de compensaciones según tus accesos.",
    },
    {
        href: "/compensaciones/configuracion",
        label: "Configuración",
        description: "Gestiona reglas y parámetros con vigencia y trazabilidad.",
    },
];
/** Tarjetas del Administrador con los grupos y el orden del menú. */
export const getAdminDestinations = (routes: readonly string[]) => {
    const assigned = new Set(routes.map(compensationPath));
    // Como en el menú, Administración no tiene "Mis Bonos y Penalidades": no gana bonos.
    const shared: AdminDestination[] = getCompensationDestinations(
        routes,
        (route) => route !== "/compensaciones/mis-bonos-descuentos" && !adminRouteRetired(route),
    ).map((entry) => ({
        ...entry,
        description:
            entry.href === "/compensaciones/resumen"
                ? "Consulta los pendientes de gestión por sede, rol y período."
                : entry.href === "/compensaciones/colaboradores"
                  ? "Consulta fichas, asignaciones y vigencias de los colaboradores."
                  : "Consulta registros, evidencia y decisiones de esta opción.",
    }));
    const entries = [...shared, ...extra.filter((entry) => assigned.has(compensationPath(entry.href)))];
    return groupCompensacionesDestinations(entries).flatMap((group) => group.items.map((entry) => ({ ...entry, group: group.label })));
};
