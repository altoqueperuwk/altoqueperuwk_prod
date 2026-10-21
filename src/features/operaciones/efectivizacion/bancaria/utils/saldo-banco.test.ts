import { describe, expect, it } from "vitest";
import { calcularSaldoBanco, tieneRetencionRecaudacion } from "./saldo-banco";

describe("retención de recaudación por empresa, banco y cuenta", () => {
    it.each([[4, 2, 3], [5, 2, 4], [6, 2, 5], [5, 3, 33], [8, 3, 7], [7, 4, 16], [11, 2, 12], [12, 2, 14]])(
        "excluye recaudación para empresa %i, banco %i y cuenta %i",
        (empresa, banco, cuenta) => {
            expect(tieneRetencionRecaudacion(empresa, banco, cuenta)).toBe(true);
            expect(calcularSaldoBanco({ caja_inicial: 100, ingresos: 20, caja_recaudacion: 500, salidas: 10 }, empresa, banco, cuenta)).toBe(110);
        },
    );

    it.each([[4, 2, 99], [4, 3, 3], [99, 2, 3], [11, 2, 14], [12, 2, 12], [11, 3, 12], [12, 3, 14]])("no extiende la regla a otra combinación %i:%i:%i", (empresa, banco, cuenta) => {
        expect(tieneRetencionRecaudacion(empresa, banco, cuenta)).toBe(false);
        expect(calcularSaldoBanco({ caja_inicial: 100, ingresos: 20, caja_recaudacion: 500, salidas: 10 }, empresa, banco, cuenta)).toBe(610);
    });

    it.each([[4, 2, 3], [11, 2, 12], [12, 2, 14]])(
        "excluye la recaudación del saldo sin alterar el KPI recibido para %i:%i:%i",
        (empresa, banco, cuenta) => {
            const kpi = Object.freeze({
                caja_inicial: 0,
                ingresos: 0,
                caja_recaudacion: 29970,
                salidas: 42557.01,
            });

            expect(calcularSaldoBanco(kpi, empresa, banco, cuenta)).toBe(-42557.01);
            expect(kpi.caja_recaudacion).toBe(29970);
        },
    );

    it.each([[4, 2, 3], [11, 2, 12], [12, 2, 14]])(
        "también excluye total_recaudado cuando no viene caja_recaudacion para %i:%i:%i",
        (empresa, banco, cuenta) => {
            expect(calcularSaldoBanco({ caja_inicial: 100, ingresos: 20, total_recaudado: 500, salidas: 10 }, empresa, banco, cuenta)).toBe(110);
        },
    );
});
