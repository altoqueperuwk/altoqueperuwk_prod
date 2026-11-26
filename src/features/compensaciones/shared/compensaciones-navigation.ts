import { LayoutGrid01 } from "@untitledui/icons";
import type { NavItemType } from "@/components/application/app-navigation/config";
import { adminRouteRetired } from "./admin-route-policy";
import { advisorRouteAllowed } from "./atc-route-policy";
import { compensationDestinations, compensationViewKey, compensationWorkspaceHref } from "./compensacion-destinos";
import { facturacionRouteAllowed } from "./facturacion-route-policy";
import { storeManagerRouteAllowed } from "./jefatura-route-policy";
import { marketingRouteAllowed } from "./marketing-route-policy";
import { pagosRouteAllowed } from "./pagos-route-policy";

const root = "/compensaciones";
const bonus = `${root}/otros-bonos`;

/**
 * Única definición de nombres, grupos y orden para todos los perfiles.
 * General: cómo voy. Registro: lo que hago para ganar un Bono. Auditoría: faltas que generan Penalidad. Control: supervisar y administrar.
 */
const sections: { label: string; entries: [string, string][] }[] = [
    {
        label: "General",
        entries: [
            [compensationWorkspaceHref, "Centro de Trabajo"],
            [`${root}/resumen`, "Dashboard"],
            [`${root}/mis-bonos-descuentos`, "Mis Bonos y Penalidades"],
        ],
    },
    {
        label: "Registro",
        entries: [
            [`${root}/atenciones`, "Registro Nuevo"],
            [`${root}/calificaciones`, "Atención Calificada"],
            [`${root}/referidos`, "Referidos"],
            [`${root}/llamadas`, "Llamadas"],
            [`${bonus}/tiktok_live`, "TikTok Live"],
            [`${bonus}/video_viral`, "Video Viral"],
            [`${bonus}/recuperacion_cliente`, "Recuperación"],
            [`${bonus}/propuesta_innovacion`, "Propuesta de Innovación"],
        ],
    },
    {
        label: "Auditoría",
        entries: [
            [`${root}/auditoria-operaciones`, "Auditoría Operaciones"],
            [`${root}/auditoria-cuadre-cierre`, "Auditoría Cuadre y Cierre"],
            [`${root}/penalidad-escalonada-bonos`, "Penalidad Escalonada Bonos"],
            [`${root}/indisciplina-colaborador`, "Indisciplina Colaborador"],
        ],
    },
    {
        label: "Control",
        entries: [
            [`${root}/bonos-mes`, "Bonos del mes"],
            [`${root}/colaboradores`, "Colaboradores"],
            [`${root}/incidencias`, "Incidencias del equipo"],
            [`${root}/reportes`, "Reporte de Bonos"],
            [`${root}/configuracion`, "Configuración"],
        ],
    },
];

/** Pantallas retiradas: conservan su nombre (permisos y enlaces antiguos), pero no aparecen en el menú. */
const sinMenu: [string, string][] = [
    [`${root}/auditoria-activa`, "Auditoría de Pagos"],
    [`${root}/evidencias`, "Evidencias"],
    [`${root}/incidencias?concepto=uniforme`, "Falta de Uniforme Completo"],
    [`${root}/incidencias?concepto=indisciplina`, "Indisciplina Recurrente Activa"],
    [`${root}/tarjetas-erroneas`, "Tarjetas Erróneas"],
    [`${bonus}/alerta_temprana`, "Alerta Temprana"],
    [`${bonus}/colaborador_mes_atenciones`, "Colaborador del Mes"],
    [`${bonus}/meta_sede_safetypay`, "SafetyPay"],
    [`${bonus}/reporte_abandono`, "Abandono Comercial"],
];

const menuLabels = new Map([
    ...sections.flatMap((section) => section.entries),
    ...compensationDestinations.map((entry): [string, string] => [entry.href, entry.label]),
    ...sinMenu,
]);
const routePath = (route: string) => route.split(/[?#]/)[0].replace(/\/+$/, "");
export const compensacionesMenuLabel = (label: string, route?: string | null) => (route ? (menuLabels.get(compensationViewKey(route)) ?? label) : label);

/** Los mismos grupos y orden del menú, para las tarjetas del Centro de Trabajo. Lo que no está en el menú no se muestra. */
export const groupCompensacionesDestinations = <T extends { href: string }>(entries: readonly T[]) =>
    sections.flatMap((section) => {
        const items = section.entries.flatMap(([route]) => entries.filter((entry) => compensationViewKey(entry.href) === route));
        return items.length ? [{ label: section.label, items }] : [];
    });

/** Ordena únicamente enlaces recibidos; nunca crea accesos. */
export const groupCompensacionesMenu = (items: NavItemType[]): NavItemType[] => {
    const result = sections.flatMap((section) => {
        const entries = section.entries.flatMap(([route, label]) =>
            items.filter((item) => compensationViewKey(item.href ?? "") === route).map((item) => ({ ...item, label })),
        );
        return entries.length ? [{ label: section.label, sectionHeading: true }, ...entries] : [];
    });
    const extra = items.filter((item) => !menuLabels.has(compensationViewKey(item.href ?? "")));
    return extra.length ? [...result, { label: "Otras Actividades", sectionHeading: true }, ...extra] : result;
};

export const compensacionesMainMenus = (items: NavItemType[]): NavItemType[] => {
    const groups: NavItemType[] = [];
    for (const item of groupCompensacionesMenu(items)) {
        if (item.sectionHeading) groups.push({ label: item.label, items: [] });
        else groups.at(-1)?.items?.push(item);
    }
    return groups;
};

/** Presentación transversal; el rol solo filtra permisos antes de reagrupar. */
export const sharedCompensacionesMenus = (authorizedGroups: NavItemType[]): NavItemType[] => {
    const entries = authorizedGroups.flatMap((group) => group.items ?? []);
    const compensation = entries.filter((item) => routePath(item.href ?? "").startsWith(`${root}/`));
    // A second view of an assigned resource, not a newly assigned permission.
    const dashboard = compensation.find((item) => compensationViewKey(item.href ?? "") === `${root}/resumen`);
    const views = compensation.filter((item) => compensationViewKey(item.href ?? "") !== compensationWorkspaceHref);
    if (dashboard) views.push({ ...dashboard, href: compensationWorkspaceHref, label: "Centro de Trabajo", icon: LayoutGrid01, badge: undefined });
    const remaining = authorizedGroups.flatMap((group) => {
        const items = group.items?.filter((item) => !compensation.includes(item));
        return items?.length ? [{ ...group, items }] : [];
    });
    const operations = (group: NavItemType) => group.items?.some((item) => item.href?.startsWith("/operaciones/"));
    return [...remaining.filter(operations), ...compensacionesMainMenus(views), ...remaining.filter((group) => !operations(group))];
};

const filterMenus = (groups: NavItemType[], allowed: (route: string) => boolean) =>
    sharedCompensacionesMenus(
        groups.flatMap((group) => {
            const items = group.items?.filter((item) => allowed(item.href ?? ""));
            return items?.length ? [{ ...group, items }] : [];
        }),
    );

/** Para quien no es administrador, /resumen es su lista personal de bonos y penalidades. */
const personalResumen = (groups: NavItemType[]) =>
    groups.map((group) => ({
        ...group,
        items: group.items?.map((item) => (item.href === "/compensaciones/resumen" ? { ...item, label: "Mis Bonos y Penalidades" } : item)),
    }));
export const atcConceptMenus = (groups: NavItemType[]) =>
    personalResumen(filterMenus(groups, (route) => routePath(route) !== "/atencion/mi-enlace-qr" && advisorRouteAllowed(routePath(route))));
export const jefaturaConceptMenus = (groups: NavItemType[]) => {
    // Incidencias del equipo concentra los tres hallazgos; Uniforme e Indisciplina
    // permanecen bloqueados como rutas por concepto (D3).
    return filterMenus(groups, (route) => storeManagerRouteAllowed(route));
};
const facturacionMenusBase = (groups: NavItemType[]) => filterMenus(groups, facturacionRouteAllowed);
/** Pagos ve solo sus propias incidencias: la opción se llama "Incidencias", no "del equipo". */
const pagosMenusBase = (groups: NavItemType[]) =>
    filterMenus(groups, (route) => route.split(/[?#]/)[0] !== "/compensaciones/mis-bonos-descuentos" && pagosRouteAllowed(route)).map((group) => ({
        ...group,
        items: group.items?.map((item) => (routePath(item.href ?? "") === `${root}/incidencias` ? { ...item, label: "Incidencias" } : item)),
    }));

const marketingMenusBase = (groups: NavItemType[]) =>
    filterMenus(groups, (route) => route.split(/[?#]/)[0] !== "/compensaciones/mis-bonos-descuentos" && marketingRouteAllowed(route));

/** Administración ve las opciones vigentes. */
export const administracionConceptMenus = (groups: NavItemType[]) =>
    sharedCompensacionesMenus(
        groups.map((group) => ({
            ...group,
            items: group.items?.filter(
                (item) =>
                    !["/compensaciones/mis-bonos-descuentos", "/atencion/mi-enlace-qr"].includes(routePath(item.href ?? "")) &&
                    !adminRouteRetired(item.href ?? ""),
            ),
        })),
    );

export const facturacionConceptMenus = (groups: NavItemType[]) => personalResumen(facturacionMenusBase(groups));
export const pagosConceptMenus = (groups: NavItemType[]) => personalResumen(pagosMenusBase(groups));
export const marketingConceptMenus = (groups: NavItemType[]) => personalResumen(marketingMenusBase(groups));
