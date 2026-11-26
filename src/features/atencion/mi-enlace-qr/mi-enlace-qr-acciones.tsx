import { useEffect, useRef, useState } from "react";
import { Copy01, QrCode01, RefreshCw01, XClose } from "@untitledui/icons";
import QRCodeStyling from "qr-code-styling";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { useAlert } from "@/components/shared/alert-center";
import { type CalificacionPropia, calificacionPublicaService, calificacionUrl } from "@/features/compensaciones/evidencias/calificacion-publica.service";

const errorMessage = (cause: unknown) => (cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo cargar tu enlace");

/** Botones "Mostrar QR" y "Copiar enlace" del asesor. El QR, copiarlo y renovar el enlace viven en el popup. */
export const MiEnlaceQrAcciones = () => {
    const notify = useAlert();
    const [link, setLink] = useState<CalificacionPropia | null>(null);
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(true);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const qrBox = useRef<HTMLDivElement>(null);
    const qr = useRef<QRCodeStyling | null>(null);
    const generationLock = useRef(false);
    const origin = import.meta.env.VITE_CALIFICACIONES_PUBLIC_ORIGIN || window.location.origin;

    useEffect(() => {
        let cancelled = false;
        setBusy(true);
        setFailed(false);
        const load = async () => {
            calificacionUrl("0".repeat(64), origin);
            const value = await calificacionPublicaService.propia();
            if (!cancelled) {
                setLink(value);
                setUrl(calificacionUrl(value.token, origin));
            }
        };
        load()
            .catch((cause) => {
                if (cancelled) return;
                setFailed(true);
                notify("error", errorMessage(cause));
            })
            .finally(() => {
                if (!cancelled) setBusy(false);
            });
        return () => {
            cancelled = true;
        };
        // notify no cambia el enlace: solo se recarga al reintentar o cambiar el origen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [origin, retry]);

    useEffect(() => {
        if (!open || !url || !qrBox.current) return;
        const element = qrBox.current;
        qr.current = new QRCodeStyling({ width: 360, height: 360, margin: 15, dotsOptions: { type: "square", roundSize: false }, data: url, type: "svg" });
        qr.current.append(element);
        return () => {
            element.replaceChildren();
            qr.current = null;
        };
    }, [open, url]);

    const close = (value: boolean) => {
        setOpen(value);
        if (!value) setConfirm(false);
    };
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(url);
            notify("success", "Enlace copiado");
        } catch {
            notify("error", "No se pudo copiar el enlace.");
        }
    };
    const copyQr = async () => {
        try {
            if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Copia de imágenes no disponible");
            const image = await qr.current?.getRawData("png");
            if (!(image instanceof Blob)) throw new Error("QR no disponible");
            await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
            notify("success", "QR copiado");
        } catch {
            notify("error", "Este navegador no pudo copiar la imagen del QR.");
        }
    };
    const regenerate = async () => {
        if (generationLock.current) return;
        generationLock.current = true;
        setBusy(true);
        try {
            calificacionUrl("0".repeat(64), origin);
            const value = await calificacionPublicaService.propia(true);
            setLink(value);
            setUrl(calificacionUrl(value.token, origin));
            setConfirm(false);
            notify("success", "Nuevo enlace y QR disponibles. El anterior ya no funciona.");
        } catch (cause) {
            notify("error", errorMessage(cause));
        } finally {
            generationLock.current = false;
            setBusy(false);
        }
    };

    if (failed && !link)
        return (
            <Button size="sm" color="secondary" iconLeading={RefreshCw01} isDisabled={busy} onClick={() => setRetry((value) => value + 1)}>
                Reintentar enlace
            </Button>
        );
    return (
        <>
            <div className="flex flex-wrap gap-2">
                <Button size="sm" color="secondary" iconLeading={QrCode01} isDisabled={busy || !link} onClick={() => setOpen(true)}>
                    Mostrar QR
                </Button>
                <Button size="sm" color="secondary" iconLeading={Copy01} isDisabled={busy || !link} onClick={() => void copyLink()}>
                    Copiar enlace
                </Button>
            </div>
            <ModalOverlay isOpen={open} isDismissable onOpenChange={close} className="items-center p-4">
                <Modal className="max-w-md">
                    <Dialog aria-label="QR de Calificación" className="relative flex-col rounded-2xl bg-primary p-6 pt-12 shadow-xl outline-hidden">
                        <ButtonUtility
                            icon={XClose}
                            tooltip="Cerrar QR"
                            color="tertiary"
                            size="xs"
                            className="absolute top-3 right-3"
                            onClick={() => close(false)}
                        />
                        <div
                            ref={qrBox}
                            role="img"
                            aria-label="QR de calificación para escanear"
                            className="mx-auto aspect-square w-full max-w-90 overflow-hidden rounded-xl [&>svg]:size-full"
                        />
                        {confirm ? (
                            <div className="mt-4 space-y-3">
                                <p className="text-xs text-warning-primary">¿Regenerar? Los enlaces y QR que compartiste antes dejarán de funcionar.</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Button size="sm" isLoading={busy} isDisabled={busy} onClick={() => void regenerate()}>
                                        Confirmar regeneración
                                    </Button>
                                    <Button size="sm" color="secondary" isDisabled={busy} onClick={() => setConfirm(false)}>
                                        Cancelar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                <Button size="sm" color="secondary" iconLeading={Copy01} isDisabled={busy} onClick={() => void copyQr()}>
                                    Copiar QR
                                </Button>
                                <Button size="sm" color="secondary" iconLeading={RefreshCw01} isDisabled={busy} onClick={() => setConfirm(true)}>
                                    Renovar QR/Enlace
                                </Button>
                            </div>
                        )}
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </>
    );
};
