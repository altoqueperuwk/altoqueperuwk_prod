import { useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "./compensacion-dialog-chrome";
import { CompensacionSurface } from "./compensacion-surface";

/** Confirmación de eliminación; con `requireReason` exige el motivo que la anulación auditada necesita. */
export const CompensacionDeleteDialog = ({
    title,
    message,
    requireReason = false,
    onConfirm,
    onClose,
}: {
    title: string;
    message: string;
    requireReason?: boolean;
    onConfirm: (reason: string) => Promise<void>;
    onClose: () => void;
}) => {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const submit = async () => {
        if (lock.current) return;
        if (requireReason && reason.trim().length < 3) {
            setError("Indica el motivo (mínimo 3 caracteres).");
            return;
        }
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            await onConfirm(reason.trim());
        } catch (cause) {
            setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo eliminar el registro");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title={title} busy={busy} onClose={onClose}>
            <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={title} onClose={onClose} busy={busy} />
                <div className="min-h-0 flex-1 space-y-3 p-4">
                    <p className="text-sm text-secondary">{message}</p>
                    {requireReason && <Input label="Motivo" size="sm" value={reason} onChange={setReason} maxLength={500} isRequired isDisabled={busy} />}
                    {error && (
                        <p role="alert" className="text-xs text-error-primary">
                            {error}
                        </p>
                    )}
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" isDisabled={busy} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button size="sm" color="primary-destructive" isLoading={busy} onClick={() => void submit()}>
                        Eliminar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
