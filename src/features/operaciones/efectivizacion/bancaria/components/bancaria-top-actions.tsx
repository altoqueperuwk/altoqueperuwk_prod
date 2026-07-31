import { ChevronDown, Download01, File06, File07, RefreshCcw02, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { BancariaHistoryDropdown } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-history-dropdown";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface BancariaTopActionsProps {
    activeCajaIds?: number[];
    activeCompany: RutaOperacionCaja | null;
    canReopenTodayClose?: boolean;
    isClosing?: boolean;
    isReopening?: boolean;
    selectedHistoryDate: string | null;
    onCloseRoute: () => void;
    onHistoryDateChange: (date: string | null) => void;
    onHistoryDateAvailabilityChange?: (isAvailable: boolean) => void;
    onReopenTodayClose?: () => void;
    onDownloadExcel: () => void;
    onDownloadPdf: () => void;
    isDownloading?: boolean;
}

export const BancariaTopActions = ({
    activeCajaIds,
    activeCompany,
    canReopenTodayClose = false,
    isClosing,
    isReopening,
    selectedHistoryDate,
    onCloseRoute,
    onHistoryDateChange,
    onHistoryDateAvailabilityChange,
    onReopenTodayClose,
    onDownloadExcel,
    onDownloadPdf,
    isDownloading,
}: BancariaTopActionsProps) => {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" color="secondary" iconLeading={XClose} isLoading={isClosing} onClick={onCloseRoute}>
                Cierre
            </Button>
            {canReopenTodayClose && (
                <Button size="sm" color="secondary" iconLeading={RefreshCcw02} isLoading={isReopening} onClick={onReopenTodayClose}>
                    Reabrir
                </Button>
            )}
            <BancariaHistoryDropdown
                activeCajaIds={activeCajaIds}
                activeCompany={activeCompany}
                selectedDate={selectedHistoryDate}
                onDateChange={onHistoryDateChange}
                onSelectedDateAvailabilityChange={onHistoryDateAvailabilityChange}
            />
            <Dropdown.Root>
                <Button size="sm" color="secondary" iconLeading={Download01} iconTrailing={ChevronDown} isLoading={isDownloading}>
                    Descargar
                </Button>
                <Dropdown.Popover className="w-48">
                    <Dropdown.Menu>
                        <Dropdown.Item icon={File06} onAction={onDownloadExcel}>
                            Excel
                        </Dropdown.Item>
                        <Dropdown.Item icon={File07} onAction={onDownloadPdf}>
                            PDF
                        </Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown.Root>
        </div>
    );
};
