import { expect, it } from "vitest";
import { dashboardConcepto, dashboardCriterio } from "./dashboard-concepto";
import { dashboardLimites, dashboardMes } from "./dashboard-filtros";

it("resuelve mes de Lima durante el cambio UTC de mes", () => {
    expect(dashboardMes(new Date("2026-11-01T04:59:59Z"))).toBe("2026-10");
    expect(dashboardMes(new Date("2026-11-01T05:00:00Z"))).toBe("2026-11");
});
it("limita febrero y diciembre sin depender de la zona del navegador", () => {
    expect(dashboardLimites("2024-02")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(dashboardLimites("2026-02").hasta).toBe("2026-02-28");
    expect(dashboardLimites("2026-12").hasta).toBe("2026-12-31");
});
it("conserva concepto legacy con filtro separado por criterio", () => {
    expect(dashboardConcepto("COLABORADOR_MES_ATENCIONES")).toBe("BONO_COLABORADOR_MES");
    expect(dashboardCriterio("COLABORADOR_MES_ATENCIONES")).toBe("ATENCIONES");
    expect(dashboardCriterio("COLABORADOR_MES_CALIFICACIONES")).toBe("CALIFICACIONES");
    expect(dashboardCriterio("BONO_COLABORADOR_MES")).toBe("");
});
