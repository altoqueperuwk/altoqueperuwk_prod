import { describe, expect, it } from "vitest";
import {
    atcConceptMenus,
    compensacionesMainMenus,
    compensacionesMenuLabel,
    facturacionConceptMenus,
    groupCompensacionesMenu,
    jefaturaConceptMenus,
    sharedCompensacionesMenus,
} from "./compensaciones-navigation";

describe("Agrupación de Compensaciones", () => {
    it("usa el mismo nombre y grupo para cada ruta compartida en todos los perfiles", () => {
        const routes = [
            "colaboradores",
            "calificaciones",
            "atenciones",
            "llamadas",
            "referidos",
            "tarjetas-erroneas",
            "resumen",
            "incidencias",
            "evidencias",
            "auditoria-activa",
            "mis-bonos-descuentos",
            "otros-bonos/propuesta_innovacion",
            "otros-bonos/meta_sede_safetypay",
            "otros-bonos/tiktok_live",
        ];
        const input = [{ label: "Catálogo", items: routes.map((route) => ({ label: "Nombre anterior", href: `/compensaciones/${route}`, badge: 2 })) }];
        const original = structuredClone(input);
        const baseline = sharedCompensacionesMenus(input);
        const expected = new Map(baseline.flatMap((group) => (group.items ?? []).map((item) => [item.href, { group: group.label, label: item.label }])));
        for (const build of [atcConceptMenus, jefaturaConceptMenus, facturacionConceptMenus, sharedCompensacionesMenus]) {
            const result = build(input);
            for (const group of result)
                for (const item of group.items ?? []) {
                    // Incidencias del equipo es la única entrada unificada para supervisión.
                    const own = expected.get(item.href);
                    const esFichaPropia = build === facturacionConceptMenus && item.href === "/compensaciones/colaboradores";
                    // Facturación ve solo sus incidencias: "Incidencias", no "del equipo".
                    const esIncidenciaPropia = build === facturacionConceptMenus && item.href === "/compensaciones/incidencias";
                    // Para ATC, Facturación, Pagos y Marketing /resumen es su lista personal.
                    const esListaPersonal = (build === atcConceptMenus || build === facturacionConceptMenus) && item.href === "/compensaciones/resumen";
                    // Jefatura nombra su registro de Caza-Errores "Auditoría Activa".
                    const esAuditoriaJefe = build === jefaturaConceptMenus && item.href === "/compensaciones/auditoria-activa";
                    expect({ group: group.label, label: item.label }).toEqual(
                        esAuditoriaJefe
                            ? { ...own, label: "Auditoría Activa" }
                            : esListaPersonal
                              ? { ...own, label: "Mis Bonos y Penalidades" }
                              : esFichaPropia
                                ? { ...own, label: "Mi ficha" }
                                : esIncidenciaPropia
                                  ? { ...own, label: "Incidencias" }
                                  : own,
                    );
                    expect(item.badge).toBe(item.href?.includes("vista=centro") || item.href?.includes("concepto=") ? undefined : 2);
                }
            expect(build(result)).toEqual(result);
        }
        expect(input).toEqual(original);
        expect(compensacionesMenuLabel("Anterior", "/compensaciones/atenciones/?mes=2026-10")).toBe("Registro Nuevo");
    });
    it("homologa el menú ATC y conserva las rutas e información de los enlaces", () => {
        const groups = [
            { label: "Operaciones", items: [{ label: "BCP", href: "/operaciones/bcp", badge: 3 }] },
            ...compensacionesMainMenus([
                { label: "Resumen", href: "/compensaciones/resumen" },
                { label: "Mi ficha", href: "/compensaciones/colaboradores" },
                { label: "Calificaciones", href: "/compensaciones/calificaciones" },
                { label: "Mi resumen", href: "/compensaciones/mis-bonos-descuentos" },
                { label: "Colaborador", href: "/compensaciones/otros-bonos/colaborador_mes_atenciones" },
                { label: "SafetyPay", href: "/compensaciones/otros-bonos/meta_sede_safetypay" },
                { label: "Referido", href: "/compensaciones/referidos" },
                { label: "Llamadas", href: "/compensaciones/llamadas" },
                { label: "Tarjetas", href: "/compensaciones/tarjetas-erroneas" },
                { label: "Auditoría", href: "/compensaciones/auditoria-operaciones" },
                { label: "Indisciplina", href: "/compensaciones/indisciplina-colaborador" },
                { label: "Atenciones", href: "/compensaciones/atenciones" },
                { label: "Evidencias", href: "/compensaciones/evidencias" },
                { label: "Idea", href: "/compensaciones/otros-bonos/propuesta_innovacion" },
                { label: "TikTok", href: "/compensaciones/otros-bonos/tiktok_live" },
            ]),
            { label: "Atención al Cliente", items: [{ label: "Mi enlace y QR", href: "/atencion/mi-enlace-qr" }] },
        ];
        const original = structuredClone(groups);
        const result = atcConceptMenus(groups);
        expect(result.map((g) => g.label)).toEqual(["Operaciones", "General", "Registro", "Auditoría"]);
        expect(result[1].items?.map((i) => i.label)).toEqual(["Centro de Trabajo", "Mis Bonos y Penalidades"]);
        expect(result[2].items?.map((i) => i.label)).toEqual([
            "Registro Nuevo",
            "Atención Calificada",
            "Referidos",
            "Llamadas",
            "TikTok Live",
            "Propuesta de Innovación",
        ]);
        expect(result[3].items?.map((i) => i.label)).toEqual(["Auditoría Operaciones", "Indisciplina Colaborador"]);
        const hrefs = result.flatMap((g) => g.items ?? []).map((i) => i.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        const removed = [
            "/compensaciones/evidencias",
            "/compensaciones/otros-bonos/colaborador_mes_atenciones",
            "/compensaciones/otros-bonos/meta_sede_safetypay",
            "/compensaciones/tarjetas-erroneas",
            "/atencion/mi-enlace-qr",
            "/compensaciones/colaboradores",
            "/compensaciones/mis-bonos-descuentos",
        ];
        for (const group of groups)
            for (const item of group.items ?? []) {
                if (removed.includes(item.href ?? "")) expect(hrefs).not.toContain(item.href);
                else expect(hrefs).toContain(item.href);
            }
        expect(result[0]).toEqual(groups[0]);
        expect(groups).toEqual(original);
        expect(atcConceptMenus(result)).toEqual(result);
    });
    it("no muestra opciones sin permiso ni secciones vacías", () => {
        const result = atcConceptMenus([{ label: "Gestión comercial", items: [{ label: "Llamada", href: "/compensaciones/llamadas" }] }]);
        expect(result).toEqual([{ label: "Registro", items: [{ label: "Llamadas", href: "/compensaciones/llamadas" }] }]);
        expect(atcConceptMenus([])).toEqual([]);
    });
    it("promueve cada sección a menú principal sin contenedor Compensaciones", () => {
        const entries = [
            { label: "Colaboradores", href: "/compensaciones/colaboradores" },
            { label: "Llamadas", href: "/compensaciones/llamadas" },
        ];
        const result = compensacionesMainMenus(entries);
        expect(result).toEqual([
            { label: "Registro", items: [entries[1]] },
            { label: "Control", items: [entries[0]] },
        ]);
        expect(result.some((menu) => menu.label === "Compensaciones" || menu.sectionHeading)).toBe(false);
        expect(compensacionesMainMenus([])).toEqual([]);
    });
    it("ordena secciones y mantiene enlaces directos", () => {
        const result = groupCompensacionesMenu([
            { label: "Configuración", href: "/compensaciones/configuracion" },
            { label: "Llamadas", href: "/compensaciones/llamadas" },
            { label: "Colaboradores", href: "/compensaciones/colaboradores" },
        ]);
        expect(result.map((item) => item.label)).toEqual(["Registro", "Llamadas", "Control", "Colaboradores", "Configuración"]);
        expect(result.every((item) => !item.items)).toBe(true);
    });
    it("no crea accesos ni encabezados vacíos", () => {
        expect(groupCompensacionesMenu([])).toEqual([]);
        const result = groupCompensacionesMenu([{ label: "Llamadas", href: "/compensaciones/llamadas" }]);
        expect(result.filter((item) => !item.sectionHeading)).toEqual([{ label: "Llamadas", href: "/compensaciones/llamadas" }]);
    });
    it("preserva futuras opciones sin clasificación e iconos originales", () => {
        const entry = { label: "Nuevo bono", href: "/compensaciones/otros-bonos/nuevo", accentColor: "original" };
        expect(groupCompensacionesMenu([entry])).toEqual([{ label: "Otras Actividades", sectionHeading: true }, entry]);
    });
    it("clasifica Calificaciones en Registro y no muestra pantallas retiradas", () => {
        const items = [
            { label: "Calificaciones", href: "/compensaciones/calificaciones" },
            { label: "Nombre extenso del bono", href: "/compensaciones/otros-bonos/colaborador_mes_atenciones" },
        ];
        expect(groupCompensacionesMenu(items)).toEqual([
            { label: "Registro", sectionHeading: true },
            { ...items[0], label: "Atención Calificada" },
        ]);
        expect(compensacionesMenuLabel("Nombre extenso del bono", items[1].href)).toBe("Colaborador del Mes");
    });
    it("acorta nombres de bonos sin mutar el catálogo ni cambiar rutas, iconos o permisos", () => {
        const names = [
            ["colaborador_mes_atenciones", "Colaborador del Mes"],
            ["recuperacion_cliente", "Recuperación"],
            ["reporte_abandono", "Abandono Comercial"],
            ["meta_sede_safetypay", "SafetyPay"],
            ["propuesta_innovacion", "Propuesta de Innovación"],
            ["tiktok_live", "TikTok Live"],
            ["video_viral", "Video Viral"],
            ["alerta_temprana", "Alerta Temprana"],
        ];
        const entries = names.map(([code]) => ({ label: `Nombre largo: ${code}`, href: `/compensaciones/otros-bonos/${code}`, badge: 2 }));
        const original = structuredClone(entries);
        const links = compensacionesMainMenus(entries).flatMap((group) => group.items ?? []);
        const retirados = ["colaborador_mes_atenciones", "reporte_abandono", "meta_sede_safetypay", "alerta_temprana"];
        expect(links).toHaveLength(entries.length - retirados.length);
        for (const [code, label] of names) {
            const href = `/compensaciones/otros-bonos/${code}`;
            const entry = entries.find((item) => item.href === href)!;
            expect(compensacionesMenuLabel(entry.label, href)).toBe(label);
            expect(links.find((item) => item.href === href)).toEqual(retirados.includes(code) ? undefined : { ...entry, label });
        }
        expect(links.every((link) => link.label.length <= 30)).toBe(true);
        expect(entries).toEqual(original);
    });
});
