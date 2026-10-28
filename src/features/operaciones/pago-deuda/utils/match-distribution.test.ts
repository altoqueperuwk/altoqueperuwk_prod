import { describe, expect, it } from "vitest";
import { getMatchDistribution } from "./match-distribution";

describe("distribución de un retorno entre deudas", () => {
    const rows = [{ id: 1, monto_deposito_cliente: 1000, monto_devuelto: 0 }, { id: 2, monto_deposito_cliente: 2000, monto_devuelto: 0 }];
    it("permite 1000 + 2000 para un retorno de 3000", () => {
        expect(getMatchDistribution(3000, rows, [1, 2])).toMatchObject({ total: 3000, valid: true, difference: 0 });
    });
    it.each([[], [1], [2], [1, 1], [1, 2, 99]].map((ids) => ({ ids })))("rechaza selección incompleta o duplicada $ids", ({ ids }) => {
        expect(getMatchDistribution(3000, rows, ids).valid).toBe(false);
    });
    it("conserva retorno parcial a una sola deuda", () => {
        expect(getMatchDistribution(500, rows, [1]).valid).toBe(true);
    });
    it("suma solo los saldos pendientes, no los montos originales", () => {
        expect(getMatchDistribution(2500, [{ ...rows[0], monto_devuelto: 500 }, rows[1]], [1, 2]).valid).toBe(true);
    });
    it("evita errores de suma por decimales", () => {
        expect(getMatchDistribution(0.3, [{ id: 1, monto_deposito_cliente: 0.1 }, { id: 2, monto_deposito_cliente: 0.2 }], [1, 2]).valid).toBe(true);
    });
    it("no habilita devoluciones agotadas ni importes inválidos", () => {
        expect(getMatchDistribution(0, rows, [1, 2]).valid).toBe(false);
        expect(getMatchDistribution(2000, [{ ...rows[0], monto_devuelto: 1000 }, rows[1]], [1, 2]).valid).toBe(false);
        expect(getMatchDistribution(Number.NaN, rows, [1]).valid).toBe(false);
    });
});
