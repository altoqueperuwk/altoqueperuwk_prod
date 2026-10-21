import { describe, expect, it } from "vitest";
import { getBancariaEstadoLabel } from "./bancaria-estado-label";

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
