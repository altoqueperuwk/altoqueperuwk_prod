import { describe, expect, it } from "vitest";
import { camposTarifa, leerTarifaRegistro, textoTarifa } from "./evidencia-tarifa";

describe("Tarifa capturada al registrar", () => {
    it("lee la tarifa del backend sin recalcularla", () => {
        expect(leerTarifaRegistro({ politica_tarifa: "REGISTRO_V1", regla_registro: { tipo_calculo: "POR_UNIDAD", monto: "0.20" } })).toEqual({
            tipoCalculo: "POR_UNIDAD",
            valor: 0.2,
        });
    });
    it("usa porcentaje, no monto, en tarifas porcentuales", () => {
        expect(leerTarifaRegistro({ politica_tarifa: "REGISTRO_V1", regla_registro: { tipo_calculo: "PORCENTAJE", porcentaje: 0.4, monto: 999 } })).toEqual({
            tipoCalculo: "PORCENTAJE",
            valor: 0.4,
        });
    });
    it.each([
        undefined,
        {},
        { politica_tarifa: "OTRA" },
        { politica_tarifa: "REGISTRO_V1", regla_registro: { tipo_calculo: "FIJO" } },
        { politica_tarifa: "REGISTRO_V1", regla_registro: { tipo_calculo: "FIJO", monto: "invalid" } },
    ])("no inventa tarifas para datos ausentes o inválidos", (value) => {
        expect(leerTarifaRegistro(value)).toBeNull();
    });
    it("admite un monto cero explícito", () => {
        expect(leerTarifaRegistro({ politica_tarifa: "REGISTRO_V1", regla_registro: { tipo_calculo: "FIJO", monto: 0 } })?.valor).toBe(0);
    });
    it("solo pide monto base en porcentaje", () => {
        expect(camposTarifa("PORCENTAJE")).toMatchObject({ base: true, cantidad: false });
    });
    it("no pide bases o cantidades en monto fijo", () => {
        expect(camposTarifa("FIJO")).toMatchObject({ base: false, cantidad: false });
    });
    it("pide unidades con una etiqueta comprensible", () => {
        expect(camposTarifa("POR_MINUTO")).toEqual({ base: false, cantidad: true, etiquetaCantidad: "Minutos" });
        expect(camposTarifa()).toMatchObject({ base: true, cantidad: true });
    });
    it("presenta dinero y porcentaje sin códigos técnicos", () => {
        expect(textoTarifa({ tipoCalculo: "POR_UNIDAD", valor: 0.2 })).toContain("por unidad");
        expect(textoTarifa({ tipoCalculo: "PORCENTAJE", valor: 8 })).toBe("8%");
    });
});
