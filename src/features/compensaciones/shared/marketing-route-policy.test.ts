import { describe, expect, it } from "vitest";
import { isCompensacionMarketing } from "./compensacion-perfil";
import { marketingConceptMenus } from "./compensaciones-navigation";
import { marketingRouteAllowed, marketingRoutes } from "./marketing-route-policy";

describe("Marketing: bloque 1 personal", () => {
    it("identifica rol real y conserva administración", () => {
        expect(isCompensacionMarketing({ id: "91", email: "", id_rol: 6 })).toBe(true);
        for (const id_rol of [1, 2, 3, 4, 5]) expect(isCompensacionMarketing({ id: "91", email: "marketing@atk.com", id_rol })).toBe(false);
        expect(isCompensacionMarketing({ id: "91", email: "", id_rol: 6, flag_super_admin: true })).toBe(false);
        expect(isCompensacionMarketing(null)).toBe(false);
    });
    it.each(marketingRoutes)("admite vista personal %s", (route) => expect(marketingRouteAllowed(`${route}?mes=2026-11`)).toBe(true));
    it.each([
        "colaboradores",
        "configuracion",
        "liquidaciones",
        "mis-bonos-descuentos",
        "calificaciones",
        "otros-bonos/liderazgo_subordinado",
        "otros-bonos/meta_sede_safetypay",
    ])("bloquea gestión o siguiente bloque: %s", (route) => expect(marketingRouteAllowed(`/compensaciones/${route}`)).toBe(false));
    it.each(["/sistema/usuario", "/reportes", "/reportes/cierre-caja", "/dashboard"])("rechaza acceso global %s", (route) =>
        expect(marketingRouteAllowed(route)).toBe(false),
    );
    it("menú y cards usan únicamente destinos asignados", () => {
        const menus = marketingConceptMenus([
            {
                label: "Compensaciones",
                items: [
                    { label: "Resumen", href: "/compensaciones/resumen" },
                    { label: "Indisciplina Colaborador", href: "/compensaciones/indisciplina-colaborador" },
                ],
            },
        ]);
        expect(
            menus
                .flatMap((menu) => menu.items ?? [])
                .map((item) => item.href)
                .sort(),
        ).toEqual(["/compensaciones/indisciplina-colaborador", "/compensaciones/resumen", "/compensaciones/resumen?vista=centro"]);
        const items = menus.flatMap((menu) => menu.items ?? []);
        expect(items.find((item) => item.href === "/compensaciones/indisciplina-colaborador")?.label).toBe("Indisciplina Colaborador");
        expect(marketingConceptMenus([])).toEqual([]);
    });
    it("separa Video Viral y Recuperación en dos entradas con su propio nombre", () => {
        const video = "/compensaciones/otros-bonos/video_viral";
        const recuperacion = "/compensaciones/otros-bonos/recuperacion_cliente";
        const menus = marketingConceptMenus([
            {
                label: "Compensaciones",
                items: [
                    { label: "Video", href: video },
                    { label: "Recuperación", href: recuperacion },
                ],
            },
        ]);
        const items = menus.flatMap((menu) => menu.items ?? []);
        expect(items.find((item) => item.href === video)?.label).toBe("Video Viral");
        expect(items.find((item) => item.href === recuperacion)?.label).toBe("Recuperación");
    });
});
