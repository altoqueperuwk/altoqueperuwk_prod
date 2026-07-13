import { ClockRewind, Download01, UserPlus01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";

interface BancariaTopActionsProps {
    isClosing?: boolean;
    onOpenConfig: () => void;
    onCloseRoute: () => void;
    onDownload: () => void;
    onOpenHistory: () => void;
}

export const BancariaTopActions = ({ isClosing, onOpenConfig, onCloseRoute, onDownload, onOpenHistory }: BancariaTopActionsProps) => {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" color="secondary" iconLeading={XClose} isLoading={isClosing} onClick={onCloseRoute}>
                Cierre
            </Button>
            <Button size="sm" color="secondary" iconLeading={ClockRewind} onClick={onOpenHistory}>
                Historial
            </Button>
            <Button size="sm" color="secondary" iconLeading={UserPlus01} onClick={onOpenConfig}>
                Asignar
            </Button>
            <Button size="sm" color="secondary" iconLeading={Download01} onClick={onDownload}>
                Descargar
            </Button>
        </div>
    );
};
