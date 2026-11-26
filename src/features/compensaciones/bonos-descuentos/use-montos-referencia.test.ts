import { describe, expect, it } from "vitest";
import { ayudaConMonto } from "./use-montos-referencia";

describe("ayudaConMonto", () => {
    it("agrega el monto configurado del cargo a la regla", () => {
        expect(ayudaConMonto("Regla", 150)).toBe("Regla. Monto de tu cargo: S/ 150.00");
    });
    it("conserva la regla sin monto o sin regla", () => {
        expect(ayudaConMonto("Regla", undefined)).toBe("Regla");
        expect(ayudaConMonto("Regla", 0)).toBe("Regla");
        expect(ayudaConMonto(undefined, 30)).toBeUndefined();
    });
});
