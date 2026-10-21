import { describe, expect, it } from "vitest";
import { getBancariaEstadoLabel, matchesBancariaEstadoFilter } from "./bancaria-estado-label";

describe("getBancariaEstadoLabel", () => {
    it("muestra Eliminado para la operación 23306 con estado 10", () => {
        expect(getBancariaEstadoLabel({ id_estado: 10, nombre_estado: "Eliminado" })).toBe("Eliminado");
    });
    it("prioriza el ID eliminado aunque el nombre sea inconsistente", () => {
        expect(getBancariaEstadoLabel({ id_estado: 10, nombre_estado: "Pendiente" })).toBe("Eliminado");
    });
    it("reconoce el nombre de estado eliminado", () => {
        expect(getBancariaEstadoLabel({ id_estado: null, nombre_estado: " Eliminado " })).toBe("Eliminado");
    });
    it("conserva Pagado", () => {
        expect(getBancariaEstadoLabel({ id_estado: 4, nombre_estado: "Pagado" })).toBe("Pagado");
    });
    it.each([3, 7])("conserva Pendiente para el estado %s, incluido POS solicitado", (id) => {
        expect(getBancariaEstadoLabel({ id_estado: id, nombre_estado: id === 7 ? "Solicitado" : "Pendiente" })).toBe("Pendiente");
    });
});

describe("matchesBancariaEstadoFilter", () => {
    const pos = { id_estado: 7, nombre_estado: "Solicitado", tipo_servicio: "POS", ruta_origen: "pos" };
    it("incluye POS solicitado en Pendiente, sin convertirlo en Pagado", () => {
        expect(matchesBancariaEstadoFilter(pos, "Pendiente")).toBe(true);
        expect(matchesBancariaEstadoFilter(pos, "Pagado")).toBe(false);
        expect(matchesBancariaEstadoFilter(pos, "Todos")).toBe(true);
    });
    it("no amplía la equivalencia a pago deuda solicitado", () => {
        expect(matchesBancariaEstadoFilter({ ...pos, tipo_servicio: "PAGO DEUDA", ruta_origen: "pagodeuda" }, "Pendiente")).toBe(false);
    });
    it("normaliza nombres y reconoce POS por ruta de origen", () => {
        expect(matchesBancariaEstadoFilter({ ...pos, id_estado: null, nombre_estado: " Solicitado ", tipo_servicio: "", ruta_origen: " POS " }, " pendiente ")).toBe(true);
    });
    it("no incluye eliminados ni POS pagados o rechazados como pendientes", () => {
        expect(matchesBancariaEstadoFilter({ ...pos, id_estado: 10 }, "Pendiente")).toBe(false);
        expect(matchesBancariaEstadoFilter({ ...pos, id_estado: 4, nombre_estado: "Pagado" }, "Pendiente")).toBe(false);
        expect(matchesBancariaEstadoFilter({ ...pos, id_estado: 9, nombre_estado: "Rechazado" }, "Pendiente")).toBe(false);
    });
    it("conserva el filtro literal de efectivización y de pagados", () => {
        expect(matchesBancariaEstadoFilter({ ...pos, tipo_servicio: "EFECTIVIZACION", ruta_origen: "bbva", id_estado: 3, nombre_estado: "Pendiente" }, "Pendiente")).toBe(true);
        expect(matchesBancariaEstadoFilter({ ...pos, id_estado: 4, nombre_estado: "Pagado" }, "Pagado")).toBe(true);
    });
});
