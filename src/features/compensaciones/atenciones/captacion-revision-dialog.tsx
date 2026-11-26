import { useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { type ClienteNuevo, clientesNuevosService } from "./clientes-nuevos.service";

/** La nota es independiente de la decisión directa de la tabla. */
export const CaptacionRevisionDialog = ({ row, onClose, onSaved }: { row: ClienteNuevo; onClose: () => void; onSaved: () => void }) => {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const notify = useAlert();
    const save = async () => {
        if (lock.current || !note.trim() || !row.id_colaborador) return;
        lock.current = true;
        setBusy(true);
        try {
            await clientesNuevosService.note(row.id, row.id_colaborador, note, row.concepto_codigo ?? "COMISION_REGISTRO_EFECTIVIZACION");
            notify("success", "Nota guardada.");
            onSaved();
        } catch (cause) {
            notify("error", cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo guardar la nota");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title="Agregar Nota" busy={busy} onClose={onClose}>
            <div className="mx-auto flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>Agregar Nota</>} onClose={onClose} busy={busy} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <p className="text-sm text-secondary">
                        {row.nombre} · {row.documento}
                    </p>
                    <TextArea label="Nota" isRequired value={note} onChange={setNote} maxLength={2000} isDisabled={busy} placeholder="Escribe una nota" />
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button size="sm" color="primary" iconLeading={Save01} isLoading={busy} isDisabled={!note.trim()} onClick={() => void save()}>
                        Guardar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
