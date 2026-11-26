import { useRef, useState } from "react";
import { Save01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useSessionCache } from "@/providers/session-cache-provider";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { type Referido, referidosService } from "./referidos.service";

/** Modal para corregir un referido propio pendiente de validación. */
export const ReferidoEditDialog = ({ item, onClose, onSaved }: { item: Referido; onClose: () => void; onSaved: () => void }) => {
    const { bancos } = useSessionCache();
    const bankItems = (bancos ?? []).filter((bank) => Number(bank.id_estado) === 1).map((bank) => ({ id: String(bank.id), label: String(bank.nombre) }));
    const [nombre, setNombre] = useState(item.nombre_referido_snapshot ?? "");
    const [monto, setMonto] = useState(item.monto_declarado != null ? String(item.monto_declarado) : "");
    const [banco, setBanco] = useState<string | null>(bankItems.find((bank) => bank.label === item.banco_declarado)?.id ?? null);
    const [notas, setNotas] = useState(item.observacion ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const submit = async () => {
        if (lock.current) return;
        if (!nombre.trim()) return setError("Ingresa el nombre del referido.");
        if (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) return setError("Ingresa un monto mayor a cero, con hasta dos decimales.");
        if (!banco) return setError("Selecciona un banco.");
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            await referidosService.update(item.id, { notas, nombre, monto: Number(monto), idBanco: Number(banco) });
            onSaved();
        } catch (cause) {
            setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo guardar los cambios");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title="Editar referido" busy={busy} onClose={onClose}>
            <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title="Editar referido" onClose={onClose} busy={busy} />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    <Input
                        label="DNI"
                        size="sm"
                        value={item.documento_referido_snapshot}
                        isDisabled
                        hint="El DNI no se cambia: elimina el referido y regístralo de nuevo."
                    />
                    <Input label="Nombre" size="sm" value={nombre} onChange={setNombre} maxLength={250} isRequired isDisabled={busy} />
                    <Input label="Monto" size="sm" value={monto} onChange={setMonto} inputMode="decimal" isRequired isDisabled={busy} />
                    <Select
                        label="Banco"
                        size="sm"
                        items={bankItems}
                        selectedKey={banco}
                        onSelectionChange={(key) => setBanco(key == null ? null : String(key))}
                        isDisabled={busy}
                    >
                        {(bank) => <Select.Item id={bank.id}>{bank.label}</Select.Item>}
                    </Select>
                    <CompensacionNoteField value={notas} onChange={setNotas} isDisabled={busy} />
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
                    <Button size="sm" color="primary" iconLeading={Save01} isLoading={busy} onClick={() => void submit()}>
                        Guardar cambios
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
