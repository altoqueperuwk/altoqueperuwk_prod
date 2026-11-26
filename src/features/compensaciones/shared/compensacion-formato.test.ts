import { describe, expect, it } from "vitest";
import { formatoMonto, serviceLabel, titleCaseSiMayusculas, vencePronto } from "./compensacion-formato";

describe("formato de Compensaciones", () => {
    it.each([
        ["JOSÉ PÉREZ", "José Pérez"],
        ["Ana de la Cruz", "Ana de la Cruz"],
        ["Cliente LIVE", "Cliente LIVE"],
        [null, ""],
        ["", ""],
    ])("normaliza nombres solo cuando llegan en mayúsculas: %s", (input, expected) => expect(titleCaseSiMayusculas(input)).toBe(expected));
    it.each([
        ["EFECTIVIZACION", "Efectivización"],
        ["POS", "POS"],
        ["LINKPAGO", "Link de pago"],
        ["PAGO_DEUDA", "Pago de deuda"],
        ["LINK_WEB", "Link web"],
        ["Servicio mixto", "Servicio mixto"],
    ])("normaliza el servicio sin escribir en origen: %s", (input, expected) => expect(serviceLabel(input)).toBe(expected));
    it("marca únicamente vencimientos futuros a menos de 24 horas", () => {
        const now = Date.parse("2026-11-17T12:00:00Z");
        expect(vencePronto("2026-11-18T11:59:59Z", now)).toBe(true);
        for (const date of ["2026-11-18T12:00:00Z", "2026-11-17T12:00:00Z", "2026-11-16T12:00:00Z", "inválida", null])
            expect(vencePronto(date, now)).toBe(false);
    });
    it("conserva cero y decimales sin fabricar dinero ante datos ausentes", () => {
        expect(formatoMonto(0)).toMatch(/S\/\s*0\.00/);
        expect(formatoMonto("1500.5")).toMatch(/S\/\s*1,500\.50/);
        for (const value of [null, undefined, "", "   ", "no disponible", NaN, Infinity, false]) expect(formatoMonto(value)).toBe("—");
    });
});
