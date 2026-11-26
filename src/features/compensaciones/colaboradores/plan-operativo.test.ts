import { describe, expect, it } from "vitest";
import { planOperativoId } from "./plan-operativo";

describe("Plan interno del colaborador", () => {
    const plans = [
        { id: 91, nombre: "Prueba", codigo: "TEST" },
        { id: 7, nombre: "General", codigo: "PLAN_COMPENSACIONES_GENERAL" },
    ];
    it("elige el plan general por código, nunca por orden", () => {
        expect(planOperativoId(plans)).toBe(7);
        expect(planOperativoId([...plans].reverse())).toBe(7);
    });
    it("conserva el vínculo anterior al cambiar cargo u horario", () => {
        expect(planOperativoId(plans, 91)).toBe(91);
    });
    it("sin configuración general no inventa un vínculo", () => {
        expect(planOperativoId([plans[0]])).toBe(0);
        expect(planOperativoId([])).toBe(0);
    });
});
