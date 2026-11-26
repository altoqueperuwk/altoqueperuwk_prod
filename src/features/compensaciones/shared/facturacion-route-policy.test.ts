import { describe, expect, it } from "vitest";
import { isCompensacionFacturacion } from "./compensacion-perfil";
import { facturacionConceptMenus } from "./compensaciones-navigation";
import { facturacionRouteAllowed, facturacionRoutes } from "./facturacion-route-policy";

describe("Política de Facturación", () => {
    it("identifica solo rol 5 y conserva superadministración", () => {
        expect(isCompensacionFacturacion({ id: "19", email: "", id_rol: 5 })).toBe(true);
        for (const id_rol of [1, 2, 3, 4]) expect(isCompensacionFacturacion({ id: "19", email: "", id_rol })).toBe(false);
        expect(isCompensacionFacturacion({ id: "19", email: "", id_rol: 5, flag_super_admin: true })).toBe(false);
        expect(isCompensacionFacturacion(null)).toBe(false);
    });
    it.each(facturacionRoutes)("acepta exclusivamente la ruta %s y normaliza barra/query", (route) => {
        expect(facturacionRouteAllowed(route)).toBe(true);
        expect(facturacionRouteAllowed(`${route}/?mes=2026-10`)).toBe(true);
        expect(facturacionRouteAllowed(`${route}/ajeno`)).toBe(false);
    });
    it.each([
        "calificaciones",
        "colaboradores",
        "incidencias",
        "auditoria-activa",
        "evidencias",
        "mis-bonos-descuentos",
        "atenciones",
        "liquidaciones",
        "cierres",
        "reportes",
        "configuracion",
        "otros-bonos/liderazgo_subordinado",
        "otros-bonos/meta_sede_safetypay",
        "otros-bonos/tiktok_live",
        "otros-bonos/deteccion_error_pago",
        "otros-bonos/operacion_extra",
    ])("excluye permisos antiguos: %s", (route) => {
        expect(facturacionRouteAllowed(`/compensaciones/${route}`)).toBe(false);
    });
    it("reagrupa solo enlaces asignados sin mutar ni fabricar accesos", () => {
        const groups = [
            { label: "Operaciones", items: [{ label: "BCP", href: "/operaciones/bcp", badge: 2 }] },
            { label: "Sistema", items: [{ label: "Usuarios", href: "/sistema/usuario" }] },
            { label: "Compensaciones", items: facturacionRoutes.map((href) => ({ label: "Original", href })) },
        ];
        const original = structuredClone(groups);
        const menus = facturacionConceptMenus(groups);
        expect(menus.map((group) => group.label)).toEqual(["Operaciones", "General", "Registro", "Auditoría", "Sistema"]);
        expect(menus[0]).toEqual(groups[0]);
        expect(
            menus
                .flatMap((group) => group.items ?? [])
                .map((item) => item.href)
                .sort(),
        ).toEqual(["/operaciones/bcp", "/sistema/usuario", ...facturacionRoutes, "/compensaciones/resumen?vista=centro"].sort());
        expect(groups).toEqual(original);
        expect(facturacionConceptMenus(menus)).toEqual(menus);
        expect(facturacionConceptMenus([])).toEqual([]);
        expect(facturacionRouteAllowed("/sistema/usuario")).toBe(true);
    });
});
