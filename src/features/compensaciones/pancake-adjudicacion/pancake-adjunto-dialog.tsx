import { useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { FileUploadDropZone } from "@/components/application/file-upload/file-upload-base";
import { Button } from "@/components/base/buttons/button";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";

/** Selección local; solo Importar envía el original al servicio existente. */
export const PancakeAdjuntoDialog = ({ initial, onApply, onClose }: { initial: File | null; onApply: (file: File | null) => void; onClose: () => void }) => {
    const [file, setFile] = useState(initial);
    const notify = useAlert();
    return (
        <CompensacionSurface title="Adjuntar Original de Pancake" onClose={onClose}>
            <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title="Adjuntar Original de Pancake" onClose={onClose} />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    <FileUploadDropZone
                        accept=".json,.csv"
                        allowsMultiple={false}
                        maxSize={10_000_000}
                        hint="Exportación original UTF-8 JSON o CSV, hasta 10 MB"
                        labels={{ upload: "Elegir archivo", attach: "original de Pancake", drag: "o arrástralo aquí" }}
                        onDropFiles={(files) => setFile(files[0] ?? null)}
                        onSizeLimitExceed={() => notify("validation", "El archivo supera 10 MB.")}
                        onDropUnacceptedFiles={() => notify("validation", "Selecciona una exportación JSON o CSV.")}
                    />
                    {file && (
                        <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 text-sm break-words text-secondary">{file.name}</p>
                            <Button size="sm" color="tertiary" iconLeading={XClose} onClick={() => setFile(null)}>
                                Quitar
                            </Button>
                        </div>
                    )}
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button size="sm" color="primary" iconLeading={Save01} onClick={() => onApply(file)}>
                        Aplicar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
