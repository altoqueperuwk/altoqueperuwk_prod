import { useEffect, useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { FileUpload } from "@/components/application/file-upload/file-upload-base";
import { Button } from "@/components/base/buttons/button";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";

export const CaptacionAdjuntoDialog = ({ initial, onClose, onApply }: { initial: File | null; onClose: () => void; onApply: (file: File | null) => void }) => {
    const [file, setFile] = useState(initial);
    const [error, setError] = useState("");
    const notify = useAlert();
    const shown = useRef(false);
    useEffect(() => {
        if (error) {
            shown.current = true;
            notify("validation", error);
        } else if (shown.current) {
            shown.current = false;
            notify("validation", null);
        }
    }, [error, notify]);
    return (
        <CompensacionSurface title="Adjuntar Captura TikTok Live" onClose={onClose}>
            <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>Adjuntar Captura TikTok Live</>} onClose={onClose} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <FileUpload.DropZone
                        labels={{ upload: "Adjuntar captura", attach: "", drag: "o arrástrala aquí" }}
                        accept="image/jpeg,image/png,image/webp"
                        allowsMultiple={false}
                        maxSize={5 * 1024 * 1024}
                        hint="JPG, PNG o WEBP hasta 5 MB · obligatoria"
                        onDropFiles={(files) => {
                            const next = files[0];
                            if (!next) return;
                            if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
                                setError("Adjunta una imagen JPG, PNG o WEBP");
                                return;
                            }
                            if (next.size > 5 * 1024 * 1024) {
                                setError("La captura supera los 5 MB");
                                return;
                            }
                            setFile(next);
                            setError("");
                        }}
                        onDropUnacceptedFiles={() => setError("Adjunta una imagen JPG, PNG o WEBP")}
                        onSizeLimitExceed={() => setError("La captura supera los 5 MB")}
                    />
                    {file && (
                        <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-secondary p-3">
                            <p className="min-w-0 text-xs break-words text-secondary">{file.name}</p>
                            <Button
                                size="sm"
                                color="tertiary"
                                iconLeading={XClose}
                                onClick={() => {
                                    setFile(null);
                                    setError("");
                                }}
                            >
                                Quitar
                            </Button>
                        </div>
                    )}
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button size="sm" color="primary" iconLeading={Save01} isDisabled={!!error} onClick={() => onApply(file)}>
                        Guardar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
