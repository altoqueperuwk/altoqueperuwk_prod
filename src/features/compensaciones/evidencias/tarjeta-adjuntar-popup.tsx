import { useState } from "react";
import { Save01, Trash01, XClose } from "@untitledui/icons";
import { FileUploadDropZone } from "@/components/application/file-upload/file-upload-base";
import { Button } from "@/components/base/buttons/button";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";

/** Selección local; el formulario sube la imagen al guardar. */
export const TarjetaAdjuntarPopup = ({
    file,
    isLocked = false,
    onApply,
    onClose,
}: {
    file: File | null;
    isLocked?: boolean;
    onApply: (file: File | null) => void;
    onClose: () => void;
}) => {
    const notify = useAlert();

    const [draftFile, setDraftFile] = useState(file);

    const apply = () => {
        onApply(draftFile);
        onClose();
    };
    return (
        <CompensacionSurface title="Adjuntar Imagen" onClose={onClose}>
            <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>Adjuntar Imagen</>} onClose={onClose} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <FileUploadDropZone
                        labels={{ upload: "Seleccionar archivo", attach: "y adjuntar", drag: "o arrastrar aquí" }}
                        hint="JPG, PNG o WEBP, hasta 5 MB"
                        accept="image/jpeg,image/png,image/webp"
                        allowsMultiple={false}
                        maxSize={5 * 1024 * 1024}
                        isDisabled={isLocked}
                        onDropFiles={(files) => {
                            const next = files[0];
                            if (!next || !["image/jpeg", "image/png", "image/webp"].includes(next.type) || !next.size || next.size > 5 * 1024 * 1024) {
                                notify("validation", "Selecciona una imagen JPG, PNG o WEBP de hasta 5 MB.");
                                return;
                            }
                            setDraftFile(next);
                        }}
                        onDropUnacceptedFiles={() => notify("validation", "Selecciona una imagen JPG, PNG o WEBP.")}
                        onSizeLimitExceed={() => notify("validation", "El archivo debe tener hasta 5 MB.")}
                    />
                    {draftFile && <p className="text-sm break-words text-primary">{draftFile.name}</p>}
                    {draftFile && (
                        <Button
                            size="sm"
                            color="tertiary"
                            iconLeading={Trash01}
                            isDisabled={isLocked}
                            onClick={() => {
                                setDraftFile(null);
                            }}
                        >
                            Quitar
                        </Button>
                    )}
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="primary" iconLeading={Save01} onClick={apply}>
                        Aplicar
                    </Button>
                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClose}>
                        Cancelar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
