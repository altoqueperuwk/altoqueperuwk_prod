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
        expect(isBancariaActionDisabled({ ...base, action: "Pagar", activeTab: "Pago Deuda" })).toBe(true);
        expect(isBancariaActionDisabled({ ...base, action: "Pagar", hasSelection: false })).toBe(true);
    });

    it("enables Empresa only for Efectivizacion with companies and selected rows", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Empresa" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Empresa", activeTab: "Derivados" })).toBe(true);
        expect(isBancariaActionDisabled({ ...base, action: "Empresa", companyCount: 0 })).toBe(true);
    });

    it("enables Transferencia only for Pago Deuda", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Transferencia", activeTab: "Pago Deuda" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Transferencia" })).toBe(true);
    });

    it("enables Confirmar only for Retenidos", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Confirmar", activeTab: "Retenidos" })).toBe(false);
        expect(isBancariaActionDisabled({ ...base, action: "Confirmar" })).toBe(true);
    });

    it("disables every action while applying", () => {
        expect(isBancariaActionDisabled({ ...base, action: "Pagar", isApplyingAction: true })).toBe(true);
    });
});
