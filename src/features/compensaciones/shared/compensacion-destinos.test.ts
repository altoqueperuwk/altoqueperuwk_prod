import { describe, expect, it } from "vitest";
import { advisorRouteAllowed } from "./atc-route-policy";
import { compensationDestinations, compensationViewKey, compensationWorkspaceHref, getCompensationDestinations } from "./compensacion-destinos";
import { sharedCompensacionesMenus } from "./compensaciones-navigation";

describe("Destinos del Centro de Trabajo", () => {
    it("muestra Video Viral y Recuperación como dos opciones con su nombre", () => {
        const video = "/compensaciones/otros-bonos/video_viral",
            recovery = "/compensaciones/otros-bonos/recuperacion_cliente";
        expect(getCompensationDestinations([video, recovery]).map((item) => item.href)).toEqual([video, recovery]);
        const menus = sharedCompensacionesMenus([
            {
                label: "Bonos",
                items: [
                    { label: "Video", href: video },
                    { label: "Clientes recuperados", href: recovery },
                ],
            },
        ]);
        expect(menus.flatMap((menu) => menu.items ?? []).map((item) => item.label)).toEqual(["Video Viral", "Recuperación"]);
    });
    it("intersecta rutas exactas del servidor y política ATC", () => {
        const assigned = ["/compensaciones", "/compensaciones/atenciones", "/compensaciones/liquidaciones", "/compensaciones/otros-bonos/tiktok_live"];
        expect(getCompensationDestinations(assigned, advisorRouteAllowed).map((item) => item.href)).toEqual([
            "/compensaciones/atenciones",
            "/compensaciones/otros-bonos/tiktok_live",
        ]);
        expect(getCompensationDestinations(["/compensaciones"])).toEqual([]);
    });
    it("distingue las dos vistas autorizadas del mismo recurso", () => {
        expect(compensationViewKey("/compensaciones/resumen/?vista=centro#inicio")).toBe(compensationWorkspaceHref);
        expect(compensationViewKey("/compensaciones/resumen?concepto=PUNTUALIDAD")).toBe("/compensaciones/resumen");
        expect(compensationDestinations.some((item) => String(item.href) === compensationWorkspaceHref)).toBe(false);
    });
    it("deriva el acceso del Dashboard sin heredar sus contadores ni duplicar el menú", () => {
        const input = [{ label: "General", items: [{ label: "Resumen", href: "/compensaciones/resumen", badge: 8 }] }];
        const result = sharedCompensacionesMenus(input);
        expect(result[0].items?.map((item) => item.href)).toEqual([compensationWorkspaceHref, "/compensaciones/resumen"]);
        expect(result[0].items?.[0].badge).toBeUndefined();
        expect(sharedCompensacionesMenus(result)).toEqual(result);
        expect(input[0].items).toHaveLength(1);
        expect(
            sharedCompensacionesMenus([{ label: "Registros", items: [{ label: "Llamadas", href: "/compensaciones/llamadas" }] }])
                .flatMap((group) => group.items ?? [])
                .some((item) => item.href === compensationWorkspaceHref),
        ).toBe(false);
    });
});
