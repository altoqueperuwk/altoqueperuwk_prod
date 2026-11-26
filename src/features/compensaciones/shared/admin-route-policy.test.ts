import { describe, expect, it } from "vitest";
import { adminRouteRedirect, adminRouteRetired } from "./admin-route-policy";

describe("opciones retiradas del Administrador", () => {
    it.each([
        ["incidencias", "auditoria-operaciones"],
        ["auditoria-activa", "auditoria-operaciones"],
        ["tarjetas-erroneas", "auditoria-operaciones"],
        ["otros-bonos/reporte_abandono", "auditoria-operaciones"],
        ["otros-bonos/alerta_temprana", "auditoria-operaciones"],
        ["evidencias", "resumen"],
        ["otros-bonos/meta_sede_safetypay", "resumen"],
        ["otros-bonos/colaborador_mes_atenciones", "resumen"],
    ])("%s lleva a %s", (from, to) => {
        expect(adminRouteRetired(`/compensaciones/${from}`)).toBe(true);
        expect(adminRouteRedirect(`/compensaciones/${from}/`)).toBe(`/compensaciones/${to}`);
    });

    it("las faltas por concepto llevan a Indisciplina Colaborador", () => {
        expect(adminRouteRedirect("/compensaciones/incidencias", "?concepto=uniforme")).toBe("/compensaciones/indisciplina-colaborador");
    });

    it("no toca las opciones vigentes", () => {
        for (const route of ["auditoria-operaciones", "indisciplina-colaborador", "otros-bonos/video_viral", "referidos", "resumen"]) {
            expect(adminRouteRetired(`/compensaciones/${route}`)).toBe(false);
            expect(adminRouteRedirect(`/compensaciones/${route}`)).toBeNull();
        }
    });
});
