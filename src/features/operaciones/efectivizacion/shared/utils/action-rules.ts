import type { BancariaTab } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja";

export const procesoActionTabs: BancariaTab[] = ["Efectivizacion", "Unificado", "Pago Deuda", "Derivados", "POS"];

interface IsBancariaActionDisabledArgs {
    action: string;
    activeTab: BancariaTab;
    companyCount: number;
    hasSelection: boolean;
    isApplyingAction: boolean;
}

export const isBancariaActionDisabled = ({
    action,
    activeTab,
    companyCount,
    hasSelection,
    isApplyingAction,
}: IsBancariaActionDisabledArgs) => {
    if (isApplyingAction) return true;

    if (action === "Pagar") {
        return !["Efectivizacion", "Unificado", "Pago Deuda", "Derivados", "POS"].includes(activeTab) || !hasSelection;
    }

    if (action === "Derivar") {
        return !["Efectivizacion", "Unificado", "Pago Deuda", "Derivados", "POS"].includes(activeTab) || !hasSelection;
    }

    if (action === "Directo") {
        return !["Efectivizacion", "Unificado"].includes(activeTab) || !hasSelection;
    }

    if (action === "Modalidad") {
        return !["Efectivizacion", "Unificado"].includes(activeTab) || !hasSelection;
    }

    if (action === "Reiniciar") {
        return !procesoActionTabs.includes(activeTab) || !hasSelection;
    }

    if (action === "Emp. Ingreso") {
        return activeTab !== "Efectivizacion" || !hasSelection || companyCount === 0;
    }

    if (action === "Eliminar Excel") {
        return !["Efectivizacion", "Unificado"].includes(activeTab);
    }

    if (action === "Eliminar Operacion") {
        return !["Efectivizacion", "Unificado"].includes(activeTab) || !hasSelection;
    }

    if (action === "Emp. Salida") {
        return !["Efectivizacion", "Unificado", "Pago Deuda", "Derivados", "POS"].includes(activeTab) || !hasSelection || companyCount === 0;
    }

    if (action === "Transferencia") {
        return activeTab !== "Pago Deuda" || !hasSelection || companyCount === 0;
    }

    if (action === "Match") {
        return activeTab !== "Pago Deuda" || !hasSelection;
    }

    if (action === "Reasignar") {
        return activeTab !== "Efectivizacion" || !hasSelection;
    }

    return true;
};
