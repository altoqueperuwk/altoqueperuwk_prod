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

    if (action === "Pagar") {
        return !["Efectivizacion", "Pago Deuda", "Derivados", "POS"].includes(activeTab) || !hasSelection;
    }

    if (action === "Derivar") {
        return !["Efectivizacion", "Pago Deuda", "Derivados", "POS"].includes(activeTab) || !hasSelection;
    }

    if (action === "Directo") {
        return activeTab !== "Efectivizacion" || !hasSelection;
    }

    if (action === "Modalidad") {
        return activeTab !== "Efectivizacion" || !hasSelection;
    }

    if (action === "Reiniciar") {
        return !procesoActionTabs.includes(activeTab) || !hasSelection;
    }

    if (action === "Emp. Ingreso") {
        return activeTab !== "Efectivizacion" || !hasSelection || companyCount === 0;
    }

    if (action === "Eliminar Excel") {
        return activeTab !== "Efectivizacion";
    }

    if (action === "Emp. Salida") {
        return !["Efectivizacion", "Pago Deuda", "Derivados", "POS"].includes(activeTab) || !hasSelection || companyCount === 0;
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

    if (action === "Forzar Abono") {
        return activeTab !== "Retenidos" || !hasSelection;
    }

    return true;
};
