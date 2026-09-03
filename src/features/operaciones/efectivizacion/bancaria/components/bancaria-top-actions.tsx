import { ChevronDown, Download01, File06, File07, RefreshCcw02, XClose } from "@untitledui/icons";
import { Pressable } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { BancariaHistoryDropdown } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-history-dropdown";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface BancariaTopActionsProps {
    activeCajaIds?: number[];
    activeCompany: RutaOperacionCaja | null;
    canReopenTodayClose?: boolean;
    isClosing?: boolean;
    isReopening?: boolean;
    selectedClosureId?: number | null;
    selectedHistoryDate: string | null;
    onCloseRoute: () => void;
    onHistoryClosureChange?: (selection: { id: number; date: string } | null) => void;
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
    selectedClosureId,
    selectedHistoryDate,
    onCloseRoute,
    onHistoryClosureChange,
    onHistoryDateChange,
    onHistoryDateAvailabilityChange,
    onReopenTodayClose,
    onDownloadExcel,
    onDownloadPdf,
    isDownloading,
}: BancariaTopActionsProps) => {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <Tooltip title="El cierre de caja es automatico a las 10:30 pm" placement="bottom">
                <Pressable>
                    <span className="inline-flex" tabIndex={0}>
                        <Button size="sm" color="secondary" iconLeading={XClose} isDisabled isLoading={isClosing} onClick={onCloseRoute}>
                            Cierre
                        </Button>
                    </span>
                </Pressable>
            </Tooltip>
            {canReopenTodayClose && (
                <Button size="sm" color="secondary" iconLeading={RefreshCcw02} isLoading={isReopening} onClick={onReopenTodayClose}>
                    Reabrir
                </Button>
            )}
            <BancariaHistoryDropdown
                activeCajaIds={activeCajaIds}
                activeCompany={activeCompany}
                selectedClosureId={selectedClosureId}
                selectedDate={selectedHistoryDate}
                onClosureChange={onHistoryClosureChange}
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
