import type { BancariaTab } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja";

export const procesoActionTabs: BancariaTab[] = ["Efectivizacion", "Pago Deuda", "Derivados", "POS", "Retenidos"];

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

    if (action === "Pagar" || action === "Derivar") {
        return !["Efectivizacion", "Derivados", "POS"].includes(activeTab) || !hasSelection;
    }

    if (action === "Reiniciar") {
        return !procesoActionTabs.includes(activeTab) || !hasSelection;
    }

    if (action === "Empresa") {
        return activeTab !== "Efectivizacion" || !hasSelection || companyCount === 0;
    }

    if (action === "Transferencia") {
        return activeTab !== "Pago Deuda" || !hasSelection || companyCount === 0;
    }

    if (action === "Reasignar") {
        return activeTab !== "Efectivizacion" || !hasSelection;
    }

    if (action === "Confirmar") {
        return activeTab !== "Retenidos" || !hasSelection;
    }

    return true;
};
