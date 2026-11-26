import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { advisorCanRegisterBonus, advisorRouteAllowed, advisorRoutes, isCompensacionAdvisor } from "./compensacion-perfil";

describe("Política de presentación ATC", () => {
    it("las rutas de frontend y SQL son las mismas", async () => {
        const source = await readFile("backend/backend_despliegue/compensaciones/03_funciones_privadas.sql", "utf8");
        const policy = source.match(/CREATE OR REPLACE FUNCTION public\.f_private_compensacion_atc_ruta_permitida\([\s\S]*?\n\$function\$;/)![0];
        const routes = [...policy.matchAll(/'(\/compensaciones\/[^'%]+)'/g)].map((match) => match[1]);
        // El servidor admite además dos alias que el frontend redirige a Resumen y tarjetas-erroneas, permiso de respaldo de Seguridad tarjeta (redirige a Auditoría Operaciones).
        const aliases = ["/compensaciones/mis-bonos-descuentos", "/compensaciones/tarjetas-erroneas"];
        expect(routes.sort()).toEqual([...advisorRoutes, ...aliases].sort());
    });
    it("define nueve destinos ATC sin duplicados", () => {
        expect(advisorRoutes).toHaveLength(9);
        expect(new Set(advisorRoutes).size).toBe(9);
    });
    it("identifica el rol y conserva la excepción de superadministración", () => {
        expect(isCompensacionAdvisor({ id: "24", email: "", id_rol: 4 })).toBe(true);
        expect(isCompensacionAdvisor({ id: "20", email: "", id_rol: 1 })).toBe(false);
        expect(isCompensacionAdvisor({ id: "24", email: "", id_rol: 4, flag_super_admin: true })).toBe(false);
        expect(isCompensacionAdvisor(null)).toBe(false);
    });
    it.each([
        "configuracion",
        "cierres",
        "reportes",
        "incidencias",
        "otros-bonos/liderazgo_subordinado",
        "otros-bonos/recuperacion_cliente",
        "otros-bonos/reporte_abandono",
        "otros-bonos/video_viral",
        "otros-bonos/alerta_temprana",
    ])("excluye %s aunque exista permiso de menú", (route) => {
        expect(advisorRouteAllowed(`/compensaciones/${route}`)).toBe(false);
    });
    it.each(advisorRoutes)("conserva la ruta personal %s", (route) => expect(advisorRouteAllowed(route)).toBe(true));
    it("no concede rutas por prefijo ni altera otros módulos", () => {
        expect(advisorRouteAllowed("/compensaciones/referidos/otra")).toBe(false);
        expect(advisorRouteAllowed("/operaciones/bcp")).toBe(true);
    });
    it("solo permite propuestas y participaciones elegibles, no premios automáticos", () => {
        expect(advisorCanRegisterBonus("PROPUESTA_INNOVACION")).toBe(true);
        expect(advisorCanRegisterBonus("TIKTOK_LIVE")).toBe(true);
        for (const code of [undefined, "COLABORADOR_MES_ATENCIONES", "META_SEDE_SAFETYPAY", "BONO_PUNTUALIDAD", "VIDEO_VIRAL"])
            expect(advisorCanRegisterBonus(code)).toBe(false);
    });
});
