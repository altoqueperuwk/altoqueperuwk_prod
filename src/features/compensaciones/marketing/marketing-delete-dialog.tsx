import { Trash01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import type { MarketingCaso } from "./marketing.service";

export const MarketingDeleteDialog = ({
    record,
    saving,
    onClose,
    onConfirm,
}: {
    record: MarketingCaso;
    saving: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) => (
    <CompensacionSurface title="Eliminar Registro" busy={saving} onClose={onClose}>
        <div className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
            <CompensacionDialogHeader title="Eliminar Registro" onClose={onClose} busy={saving} />
            <p className="p-4 text-sm text-secondary">Se eliminará «{record.titulo}». Esta acción no se puede deshacer.</p>
            <CompensacionDialogFooter>
                <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={saving} onClick={onClose}>
                    Cancelar
                </Button>
                <Button size="sm" color="primary-destructive" iconLeading={Trash01} isDisabled={saving} onClick={onConfirm}>
                    Eliminar
                </Button>
            </CompensacionDialogFooter>
        </div>
    </CompensacionSurface>
);
