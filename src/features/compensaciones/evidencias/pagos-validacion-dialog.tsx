import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { pagosDeteccionesError } from "./pagos-detecciones-form";
import { type PagosValidacionItem, pagosValidacionService } from "./pagos-validacion.service";

export const estadoValidacion = (decision: "APROBADO" | "RECHAZADO" | null) =>
    decision === "APROBADO" ? "Validado" : decision === "RECHAZADO" ? "No conforme" : "Por validar";

/**
 * Validación del Jefe de Sede (Esquema 12): los reportes de Pagos de su sede pasan por él antes de la aprobación de
 * Administración.
 */
export const PagosValidacionDialog = ({ item, onClose, onDone }: { item: PagosValidacionItem; onClose: () => void; onDone: () => void }) => {
    const notify = useAlert();
    const [comentario, setComentario] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const decide = async (decision: "APROBADO" | "RECHAZADO") => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await pagosValidacionService.validar(item.id, decision, comentario.trim());
            onClose();
            onDone();
            notify("success", decision === "APROBADO" ? "Reporte validado. Pasa a Administración." : "Reporte rechazado.");
        } catch (cause) {
            setError(pagosDeteccionesError(cause));
        } finally {
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title="Validar reporte de Pagos" busy={busy} onClose={onClose}>
            <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                <CompensacionDialogHeader title="Validar reporte de Pagos" busy={busy} onClose={onClose} />
                <div className="space-y-3 p-4 text-sm text-secondary">
                    <p>
                        <strong>{item.tipoNombre}</strong> · {item.beneficiario}
                    </p>
                    <p>{item.descripcion}</p>
                    <p>{item.operacion ? `Operación ${item.operacion}` : "Sin operación"}</p>
                    {item.evidencia && (
                        <a className="text-brand-secondary underline" href={item.evidencia} target="_blank" rel="noreferrer">
                            Ver evidencia
                        </a>
                    )}
                    {item.decision ? (
                        <p>Estado de tu validación: {estadoValidacion(item.decision)}</p>
                    ) : (
                        <>
                            <CompensacionNoteField label="Comentario de validación" value={comentario} onChange={setComentario} isDisabled={busy} isRequired />
                            {error && <AlertMessage tone="validation">{error}</AlertMessage>}
                            <div className="flex gap-2">
                                <Button size="sm" color="primary" isDisabled={busy || comentario.trim().length < 10} onClick={() => decide("APROBADO")}>
                                    Validar
                                </Button>
                                <Button
                                    size="sm"
                                    color="primary-destructive"
                                    isDisabled={busy || comentario.trim().length < 10}
                                    onClick={() => decide("RECHAZADO")}
                                >
                                    Rechazar
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </CompensacionSurface>
    );
};
