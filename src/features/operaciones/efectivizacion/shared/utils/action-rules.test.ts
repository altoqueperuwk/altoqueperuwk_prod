import { describe, expect, it } from "vitest";
import { isBancariaActionDisabled } from "./action-rules";

const base = {
    activeTab: "Efectivizacion" as const,
    companyCount: 1,
    hasSelection: true,
    isApplyingAction: false,
};

describe("action-rules", () => {
    it("enables Pagar only for process tabs with selection", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Pagar" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Pagar", activeTab: "Pago Deuda" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Pagar", hasSelection: false })).toBe(true);
    });

    it("enables Emp. Ingreso only for Efectivizacion with companies and selected rows", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Ingreso" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Ingreso", activeTab: "Derivados" })).toBe(true);
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Ingreso", companyCount: 0 })).toBe(true);
    });

    it("enables Eliminar Excel only for Efectivizacion without requiring selected rows", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Eliminar Excel", hasSelection: false })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Eliminar Excel", activeTab: "Derivados" })).toBe(true);
    });

    it("enables Emp. Salida for Efectivizacion, Pago Deuda and Derivados with companies and selected rows", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Salida" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Salida", activeTab: "Pago Deuda" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Salida", activeTab: "Derivados" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Salida", activeTab: "POS" })).toBe(true);
        expect(isBancariaActionDisabled({ ...base, action: "Emp. Salida", companyCount: 0 })).toBe(true);
    });

    it("enables Transferencia only for Pago Deuda", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Transferencia", activeTab: "Pago Deuda" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Transferencia" })).toBe(true);
    });

    it("enables Directo only for Efectivizacion with selected rows", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Directo" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Directo", activeTab: "Derivados" })).toBe(true);
        expect(isBancariaActionDisabled({ ...base, action: "Directo", hasSelection: false })).toBe(true);
    });

    it("enables Match only for Pago Deuda", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Match", activeTab: "Pago Deuda" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Match" })).toBe(true);
    });

    it("enables Forzar Abono only for Retenidos", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Forzar Abono", activeTab: "Retenidos" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Forzar Abono" })).toBe(true);
    });

    it("disables every action while applying", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Pagar", isApplyingAction: true })).toBe(true);
    });
});
