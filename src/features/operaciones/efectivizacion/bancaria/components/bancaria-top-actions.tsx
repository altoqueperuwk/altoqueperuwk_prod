import { Download01, UserPlus01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { BancariaHistoryDropdown } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-history-dropdown";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface BancariaTopActionsProps {
    activeCajaIds?: number[];
    activeCompany: RutaOperacionCaja | null;
    isClosing?: boolean;
    selectedHistoryDate: string | null;
    onOpenConfig: () => void;
    onCloseRoute: () => void;
    onHistoryDateChange: (date: string | null) => void;
    onHistoryDateAvailabilityChange?: (isAvailable: boolean) => void;
    onDownload: () => void;
}

export const BancariaTopActions = ({
    activeCajaIds,
    activeCompany,
    isClosing,
    selectedHistoryDate,
    onOpenConfig,
    onCloseRoute,
    onHistoryDateChange,
    onHistoryDateAvailabilityChange,
    onDownload,
}: BancariaTopActionsProps) => {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" color="secondary" iconLeading={XClose} isLoading={isClosing} onClick={onCloseRoute}>
                Cierre
            </Button>
            <BancariaHistoryDropdown
                activeCajaIds={activeCajaIds}
                activeCompany={activeCompany}
                selectedDate={selectedHistoryDate}
                onDateChange={onHistoryDateChange}
                onSelectedDateAvailabilityChange={onHistoryDateAvailabilityChange}
            />
            <Button size="sm" color="secondary" iconLeading={UserPlus01} onClick={onOpenConfig}>
                Asignar
            </Button>
            <Button size="sm" color="secondary" iconLeading={Download01} onClick={onDownload}>
                Descargar
            </Button>
        </div>
    );
};
