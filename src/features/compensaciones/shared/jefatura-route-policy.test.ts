import { describe, expect, it } from "vitest";
import type { NavItemType } from "@/components/application/app-navigation/config";
import { advisorRouteAllowed, isCompensacionAdvisor, isCompensacionStoreManager } from "./compensacion-perfil";
import { atcConceptMenus, jefaturaConceptMenus } from "./compensaciones-navigation";
import { storeManagerRouteAllowed, storeManagerRouteRedirect, storeManagerRoutes } from "./jefatura-route-policy";

const root = "/compensaciones/";
const supervision = ["mal-flujo-safetypay", "conversacion-al-aire", "error-registro-codigo"];
const administrative = [
    "incidencias?concepto=uniforme",
    "incidencias?concepto=indisciplina",
    "evidencias",
    "tarjetas-erroneas",
    "otros-bonos/bono_puntualidad",
    "otros-bonos/liderazgo_subordinado",
    "configuracion",
    "liquidaciones",
    "cierres",
    "reportes",
    "otros-bonos/colaborador_mes_atenciones",
    "otros-bonos/reporte_abandono",
    "otros-bonos/video_viral",
];
const links = (groups: NavItemType[]) => groups.flatMap((group) => group.items ?? []);

describe("Jefatura: política de rutas", () => {
    it.each([1, 3, 4, 5])("identifica exclusivamente al rol 3 y conserva superadministración (rol %s)", (role) => {
        const user = { id: "30", email: "", id_rol: role };
        expect(isCompensacionStoreManager(user)).toBe(role === 3);
        expect(isCompensacionAdvisor(user)).toBe(role === 4);
        expect(isCompensacionStoreManager({ ...user, flag_super_admin: true })).toBe(false);
    });

    it("no deduce jefatura de una sesión todavía sin ficha", () => {
        expect(isCompensacionStoreManager(null)).toBe(false);
        expect(isCompensacionStoreManager(undefined)).toBe(false);
    });

    it.each(supervision)("retira la ruta suelta %s tras absorberla en Incidencias", (route) => {
        expect(storeManagerRouteAllowed(root + route)).toBe(false);
        expect(advisorRouteAllowed(root + route)).toBe(false);
    });

    it.each(administrative)("rechaza el acceso administrativo o retirado %s", (route) => {
        expect(storeManagerRouteAllowed(root + route)).toBe(false);
    });

    it("permite Incidencias del equipo al Jefe (Paquete K)", () => {
        expect(storeManagerRouteAllowed(root + "incidencias")).toBe(true);
        expect(advisorRouteAllowed(root + "incidencias")).toBe(false);
    });

    it("comparte con ATC Auditoría Operaciones, Indisciplina Colaborador y suma Penalidad Escalonada Bonos", () => {
        for (const route of ["auditoria-operaciones", "indisciplina-colaborador", "penalidad-escalonada-bonos"]) {
            expect(storeManagerRouteAllowed(root + route)).toBe(true);
        }
        expect(advisorRouteAllowed(root + "auditoria-operaciones")).toBe(true);
        expect(advisorRouteAllowed(root + "penalidad-escalonada-bonos")).toBe(false);
        const items = links(
            jefaturaConceptMenus([
                {
                    label: "Compensaciones",
                    items: [
                        { label: "Auditoría Operaciones", href: root + "auditoria-operaciones" },
                        { label: "Penalidad Escalonada Bonos", href: root + "penalidad-escalonada-bonos" },
                    ],
                },
            ]),
        );
        expect(items.map((item) => item.label)).toEqual(["Auditoría Operaciones", "Penalidad Escalonada Bonos"]);
    });

    it("retira Auditoría Activa y SafetyPay del Jefe y lleva el enlace anterior a Auditoría Operaciones", () => {
        expect(storeManagerRouteAllowed(root + "auditoria-activa")).toBe(false);
        expect(storeManagerRouteAllowed(root + "otros-bonos/meta_sede_safetypay")).toBe(false);
        expect(storeManagerRouteRedirect(root + "auditoria-activa")).toBe(root + "auditoria-operaciones");
        expect(storeManagerRouteRedirect(root + "incidencias")).toBeNull();
    });

    it("lleva Alerta Temprana a Auditoría Operaciones del Jefe y no le da Recuperación", () => {
        expect(storeManagerRouteAllowed(root + "otros-bonos/alerta_temprana")).toBe(false);
        expect(storeManagerRouteRedirect(root + "otros-bonos/alerta_temprana")).toBe(root + "auditoria-operaciones");
        expect(advisorRouteAllowed(root + "otros-bonos/alerta_temprana")).toBe(false);
        expect(storeManagerRouteAllowed(root + "otros-bonos/recuperacion_cliente")).toBe(false);
    });

    it("conserva las rutas personales, sin conceder descendientes por prefijo", () => {
        expect(new Set(storeManagerRoutes).size).toBe(storeManagerRoutes.length);
        for (const route of ["resumen", "colaboradores", "calificaciones", "atenciones", "llamadas", "referidos"]) {
            expect(storeManagerRouteAllowed(root + route)).toBe(true);
        }
        expect(storeManagerRouteAllowed(`${root}incidencias///`)).toBe(true);
        expect(storeManagerRouteAllowed(`${root}incidencias/ajena`)).toBe(false);
        expect(storeManagerRouteAllowed(`${root}otros-bonos`)).toBe(false);
        expect(storeManagerRouteAllowed(`${root}otros-bonos/desconocido`)).toBe(false);
        expect(storeManagerRouteAllowed("/operaciones/bcp")).toBe(true);
    });
});

describe("Jefatura: menú derivado de permisos", () => {
    it("agrupa la sede y la bandeja unificada conservando los metadatos autorizados", () => {
        const icon = () => null;
        const calls = { label: "Nombre de catálogo", href: `${root}llamadas`, icon, badge: 7, accentColor: "brand" };
        const groups: NavItemType[] = [
            { label: "Operaciones", items: [{ label: "BCP", href: "/operaciones/bcp", badge: 3 }] },
            {
                label: "Compensaciones",
                items: [
                    { label: "Resumen", href: `${root}resumen` },
                    { label: "Equipo", href: `${root}colaboradores` },
                    calls,
                    { label: "Liderazgo", href: `${root}otros-bonos/liderazgo_subordinado` },
                    { label: "Bonos propios", href: `${root}mis-bonos-descuentos` },
                    ...supervision.slice(0, 3).map((route) => ({ label: route, href: root + route })),
                    { label: "Incidencias", href: `${root}incidencias` },
                    { label: "Alertas tempranas", href: `${root}otros-bonos/alerta_temprana` },
                    { label: "Clientes recuperados", href: `${root}otros-bonos/recuperacion_cliente` },
                    ...administrative.map((route) => ({ label: route, href: root + route })),
                ],
            },
            { label: "Sistema", items: [{ label: "Usuarios", href: "/sistema/usuario" }] },
            { label: "Consultas", items: [{ label: "Bandeja", href: "/bandeja" }] },
        ];
        const original = groups.map((group) => ({ ...group, items: group.items?.map((item) => ({ ...item })) }));
        const result = jefaturaConceptMenus(groups);
        expect(result.map((group) => group.label)).toEqual(["Operaciones", "General", "Registro", "Control", "Sistema", "Consultas"]);
        expect(result[1].items?.map((item) => item.label)).toEqual(["Centro de Trabajo", "Dashboard", "Mis Bonos y Penalidades"]);
        expect(result[3].items?.map((item) => item.label)).toEqual(["Colaboradores", "Incidencias del equipo"]);
        expect(links(result).find((item) => item.href === calls.href)).toEqual({ ...calls, label: "Llamadas" });
        const hrefs = links(result).map((item) => item.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        for (const route of administrative) expect(hrefs).not.toContain(root + route);
        expect(hrefs).toContain(root + "incidencias");
        expect(hrefs).not.toContain(root + "otros-bonos/video_viral");
        expect(hrefs).toContain("/sistema/usuario");
        expect(result[0]).toEqual(groups[0]);
        expect(groups).toEqual(original);
        expect(jefaturaConceptMenus(result)).toEqual(result);
    });

    it("no crea accesos de jefatura ni secciones cuando el servidor no los concede", () => {
        const groups = [{ label: "Catálogo", items: [{ label: "Llamadas", href: `${root}llamadas` }] }];
        expect(jefaturaConceptMenus(groups)).toEqual([{ label: "Registro", items: [{ label: "Llamadas", href: `${root}llamadas` }] }]);
        expect(jefaturaConceptMenus([])).toEqual([]);
        expect(jefaturaConceptMenus([{ label: "Administración", items: administrative.map((route) => ({ label: route, href: root + route })) }])).toEqual([]);
    });

    it("el mismo catálogo no habilita supervisión en el menú ATC", () => {
        const groups = [{ label: "Compensaciones", items: ["llamadas", ...supervision].map((route) => ({ label: route, href: root + route })) }];
        expect(links(atcConceptMenus(groups)).map((item) => item.href)).toEqual([`${root}llamadas`]);
        expect(links(jefaturaConceptMenus(groups)).map((item) => item.href)).toEqual([`${root}llamadas`]);
    });
});
