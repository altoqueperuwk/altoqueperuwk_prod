import { describe, expect, it } from "vitest";
import { isCompensacionPagos } from "./compensacion-perfil";
import { pagosConceptMenus } from "./compensaciones-navigation";
import { pagosRouteAllowed, pagosRouteRedirect, pagosRoutes } from "./pagos-route-policy";

describe("Pagos: acceso personal del bloque 1", () => {
    it("identifica el rol por id y respeta superadministración", () => {
        expect(isCompensacionPagos({ id: "11", email: "", id_rol: 2 })).toBe(true);
        for (const id_rol of [1, 3, 4, 5]) expect(isCompensacionPagos({ id: "11", email: "bcp_uno@atk.com", id_rol })).toBe(false);
        expect(isCompensacionPagos({ id: "11", email: "", id_rol: 2, flag_super_admin: true })).toBe(false);
        expect(isCompensacionPagos(null)).toBe(false);
    });
    it.each(pagosRoutes)("preserva la ruta propia %s", (route) => expect(pagosRouteAllowed(`${route}?mes=2026-11`)).toBe(true));
    it.each([
        "configuracion",
        "colaboradores",
        "liquidaciones",
        "cierres",
        "reportes",
        "mis-bonos-descuentos",
        "llamadas",
        "tarjetas-erroneas",
        "otros-bonos/liderazgo_subordinado",
        "incidencias",
        "calificaciones",
        "evidencias",
        "auditoria-activa",
        "otros-bonos/reporte_abandono",
    ])("rechaza %s aunque exista permiso antiguo", (route) => expect(pagosRouteAllowed(`/compensaciones/${route}`)).toBe(false));
    it("redirige rutas retiradas a su opción vigente", () => {
        expect(pagosRouteRedirect("/compensaciones/auditoria-activa")).toBe("/compensaciones/auditoria-operaciones");
        expect(pagosRouteRedirect("/compensaciones/otros-bonos/reporte_abandono")).toBe("/compensaciones/auditoria-operaciones");
        expect(pagosRouteRedirect("/compensaciones/mis-bonos-descuentos")).toBe("/compensaciones/resumen");
        expect(pagosRouteRedirect("/compensaciones/referidos")).toBeNull();
    });
    it("no altera bancos ni Sistema ni concede subrutas", () => {
        expect(pagosRouteAllowed("/operaciones/bcp")).toBe(true);
        expect(pagosRouteAllowed("/compensaciones/asistencia/ajena")).toBe(false);
        expect(pagosRouteAllowed("/sistema/usuario")).toBe(true);
    });
    it("menú transversal no fabrica accesos ni expone supervisión", () => {
        const menus = pagosConceptMenus([
            {
                label: "Compensaciones",
                items: [
                    { label: "Resumen", href: "/compensaciones/resumen" },
                    { label: "Incidencias", href: "/compensaciones/incidencias" },
                    { label: "Auditoría", href: "/compensaciones/auditoria-cuadre-cierre" },
                ],
            },
        ]);
        const links = menus.flatMap((menu) => menu.items ?? []).map((item) => item.href);
        expect(links).toEqual(expect.arrayContaining(["/compensaciones/resumen", "/compensaciones/resumen?vista=centro"]));
        expect(links).toHaveLength(3);
        expect(links).not.toContain("/compensaciones/incidencias");
        expect(links).toContain("/compensaciones/auditoria-cuadre-cierre");
        expect(links).not.toContain("/compensaciones/liquidaciones");
        expect(links).not.toContain("/compensaciones/resumen?vista=control-pagos");
        expect(pagosConceptMenus([])).toEqual([]);
    });
});
