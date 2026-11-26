import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { estadoValidacion } from "../evidencias/pagos-validacion-dialog";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { marketingMessage } from "./marketing-form-state";
import { type MarketingAlertaPorValidar, marketingService } from "./marketing.service";

export const motivoAlerta = (motivo: string) => (motivo === "CHAT_SIN_RESPUESTA" ? "Chat sin respuesta" : "Error de datos");

/** El Jefe de Tienda valida las alertas de su sede antes de la aprobación de Administración. */
export const AlertaValidacionDialog = ({ item, onClose, onDone }: { item: MarketingAlertaPorValidar; onClose: () => void; onDone: () => void }) => {
    const notify = useAlert();
    const [comment, setComment] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const decide = async (decision: "APROBADO" | "RECHAZADO") => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await marketingService.validateAlert(item.id, decision, comment);
            onClose();
            onDone();
            notify("success", decision === "APROBADO" ? "Alerta validada. Pasa a Administración." : "Alerta rechazada.");
        } catch (cause) {
            setError(marketingMessage(cause));
        } finally {
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title="Validar alerta" busy={busy} onClose={onClose}>
            <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                <CompensacionDialogHeader title="Validar alerta" busy={busy} onClose={onClose} />
                <div className="space-y-3 p-4 text-sm text-secondary">
                    <p>
                        <strong>{motivoAlerta(item.motivo)}</strong> · {item.responsable}
                    </p>
                    <p>
                        {item.titulo}: {item.descripcion}
                    </p>
                    <p>
                        Registró {item.beneficiario} · Conversación {item.conversacion}
                    </p>
                    <p>{item.operacion ? `Operación ${item.operacion}` : "Sin operación"}</p>
                    {item.evidencia && (
                        <a className="text-brand-secondary underline" href={item.evidencia} target="_blank" rel="noopener noreferrer">
                            Ver evidencia
                        </a>
                    )}
                    {item.decision ? (
                        <p>Estado de tu validación: {estadoValidacion(item.decision)}</p>
                    ) : (
                        <>
                            <CompensacionNoteField label="Comentario de validación" value={comment} onChange={setComment} isDisabled={busy} isRequired />
                            {error && <AlertMessage tone="validation">{error}</AlertMessage>}
                            <div className="flex gap-2">
                                <Button size="sm" color="primary" isDisabled={busy || comment.trim().length < 10} onClick={() => decide("APROBADO")}>
                                    Validar
                                </Button>
                                <Button
                                    size="sm"
                                    color="primary-destructive"
                                    isDisabled={busy || comment.trim().length < 10}
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
