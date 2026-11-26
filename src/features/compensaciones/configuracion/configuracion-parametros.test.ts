import { describe, expect, it } from "vitest";
import { prepararCambiosParametros } from "./configuracion-parametros";

describe("Cambios de parámetros", () => {
    it("omite campos sin cambios y envía referencia anterior", () => {
        expect(prepararCambiosParametros({ "goal-2": "200", "rule-1": "0.3" }, { "goal-2": "200", "rule-1": "0.2" })).toEqual([
            { tipo: "REGLA", id: 1, anterior: "0.2", valor: "0.3" },
        ]);
    });
    it.each(["", "-1", "NaN", "Infinity", "abc"])("rechaza importe inválido %s antes de llamar al backend", (value) => {
        expect(() => prepararCambiosParametros({ "rule-1": value }, { "rule-1": "2" })).toThrow();
    });
    it("rechaza claves desconocidas, incluidos los horarios y tolerancias retirados", () => {
        expect(() => prepararCambiosParametros({ "other-1": "1" }, { "other-1": "0" })).toThrow();
        expect(() => prepararCambiosParametros({ "journey-1-entry": "10:00" }, { "journey-1-entry": "09:00" })).toThrow();
        expect(() => prepararCambiosParametros({ "cargotol-2": "10" }, { "cargotol-2": "5" })).toThrow();
    });
});
