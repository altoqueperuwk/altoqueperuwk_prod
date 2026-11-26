import { useRef, useState } from "react";
import { Save01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento } from "./evidencias.types";

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Modal para corregir una llamada o una tarjeta propia mientras sigue pendiente de revisión. */
export const CapturaEditDialog = ({ item, onClose, onSaved }: { item: EvidenciaEvento; onClose: () => void; onSaved: () => void }) => {
    const isCard = item.categoria === "TARJETA_TERCERO";
    const [dni, setDni] = useState(text(item.datos.cliente_documento) || item.beneficiarioDocumento || "");
    const [nombre, setNombre] = useState(text(item.datos.cliente_nombre));
    const [ultimos4, setUltimos4] = useState(text(item.datos.tarjeta_ultimos4));
    const [celular, setCelular] = useState(text(item.datos.cliente_celular));
    const [fecha, setFecha] = useState(text(item.datos.fecha_detectada) || item.fechaEvento.slice(0, 10));
    const [notas, setNotas] = useState(item.descripcion ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const title = isCard ? "Editar tarjeta" : "Editar llamada";
    const submit = async () => {
        if (lock.current) return;
        if (!/^\d{8}$/.test(dni.trim())) return setError("Ingresa un DNI de 8 dígitos.");
        if (!nombre.trim()) return setError("Ingresa el nombre del cliente.");
        if (isCard && !/^\d{4}$/.test(ultimos4.trim())) return setError("Ingresa los 4 últimos dígitos de la tarjeta.");
        if (isCard && !fecha) return setError("Ingresa la fecha de detección.");
        if (!isCard && celular.trim() && !/^\d{7,15}$/.test(celular.trim())) return setError("Ingresa un celular de 7 a 15 dígitos o déjalo vacío.");
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            await evidenciasService.updateCapture(item.id, {
                dni,
                nombre,
                fecha: isCard ? fecha : undefined,
                notas: isCard ? notas : undefined,
                ultimos4: isCard ? ultimos4 : undefined,
                celular: isCard ? undefined : celular,
            });
            onSaved();
        } catch (cause) {
            setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo guardar los cambios");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title={title} busy={busy} onClose={onClose}>
            <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={title} onClose={onClose} busy={busy} />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    <Input label="DNI" size="sm" value={dni} onChange={setDni} maxLength={8} inputMode="numeric" isRequired isDisabled={busy} />
                    <Input label="Cliente" size="sm" value={nombre} onChange={setNombre} maxLength={200} isRequired isDisabled={busy} />
                    {isCard ? (
                        <>
                            <Input
                                label="Nro tarjeta (4 últimos dígitos)"
                                size="sm"
                                value={ultimos4}
                                onChange={(v) => setUltimos4(v.replace(/\D/g, "").slice(0, 4))}
                                maxLength={4}
                                inputMode="numeric"
                                isRequired
                                isDisabled={busy}
                            />
                            <CompensacionDatePicker label="Fecha de detección" value={fecha} onChange={setFecha} isRequired isDisabled={busy} />
                            <CompensacionNoteField value={notas} onChange={setNotas} isDisabled={busy} />
                        </>
                    ) : (
                        <Input label="Celular" size="sm" value={celular} onChange={setCelular} maxLength={15} inputMode="numeric" isDisabled={busy} />
                    )}
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
