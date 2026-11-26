import { useRef, useState } from "react";
import { Send01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { useAlert } from "@/components/shared/alert-center";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaEvento } from "./incidencias.types";

type Props = { item: IncidenciaEvento; onClose: () => void; onChanged: () => void };
type Response = { postura?: string; comentario?: string };

const responseOf = (item: IncidenciaEvento): Response =>
    item.datos?.respuesta_jefe_sede && typeof item.datos.respuesta_jefe_sede === "object" ? (item.datos.respuesta_jefe_sede as Response) : {};
const stanceLabel = (value?: string) => (value === "CONFORME" ? "Conforme" : value === "DESCARGO" ? "Descargo" : "Sin respuesta");
const message = (cause: unknown, fallback: string) => (cause && typeof cause === "object" && "message" in cause ? String(cause.message) : fallback);

export const IncidenciaEquipoDetail = ({ item, onClose, onChanged }: Props) => {
    const notify = useAlert();
    const answered = responseOf(item);
    const { userId } = useCompensacionPerfil();
    const canAnswer = item.direccion === "RECIBIDAS" && item.estado === "PENDIENTE";
    /** El autor retira su propia incidencia mientras Administración no la haya decidido (se envía al crearla). */
    const canAnnul = item.direccion === "ENVIADAS" && item.estado === "PENDIENTE" && userId > 0 && item.usuarioRegistraId === userId;
    const [annulReason, setAnnulReason] = useState("");
    const [stance, setStance] = useState<"CONFORME" | "DESCARGO" | "">(
        answered.postura === "CONFORME" || answered.postura === "DESCARGO" ? answered.postura : "",
    );
    const [comment, setComment] = useState(answered.comentario ?? "");
    const [saving, setSaving] = useState(false);
    const lock = useRef(false);
    const send = async () => {
        if (lock.current || !stance) return;
        if (comment.trim().length < 10) return notify("validation", "Explica tu respuesta con al menos 10 caracteres.");
        lock.current = true;
        setSaving(true);
        try {
            await incidenciasService.respondTeam(item.id, stance, comment);
            notify("success", "Respuesta registrada. La decisión final es del Administrador.");
            onChanged();
        } catch (cause) {
            notify("error", message(cause, "No fue posible registrar la respuesta"));
        } finally {
            lock.current = false;
            setSaving(false);
        }
    };
    const annul = async () => {
        if (lock.current || !canAnnul) return;
        if (annulReason.trim().length < 10) return notify("validation", "Explica el motivo de la anulación con al menos 10 caracteres.");
        lock.current = true;
        setSaving(true);
        try {
            await incidenciasService.annul(item.id, annulReason);
            notify("success", "Incidencia anulada.");
            onChanged();
        } catch (cause) {
            notify("error", message(cause, "No fue posible anular la incidencia"));
        } finally {
            lock.current = false;
            setSaving(false);
        }
    };
    const evidence = item.evidencia
        .map((entry) => (entry && typeof entry === "object" && "url" in entry ? String((entry as { url: unknown }).url) : ""))
        .filter(Boolean);
    const field = (label: string, value: React.ReactNode) => (
        <div>
            <dt className="text-xs text-tertiary">{label}</dt>
            <dd className="text-sm text-primary">{value || "—"}</dd>
        </div>
    );
    return (
        <CompensacionSurface title="Detalle de la Incidencia" onClose={onClose} busy={saving}>
            <div className="flex w-full flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>{item.penalidadNombre}</>} onClose={onClose} busy={saving}>
                    <CompensacionEstado dominio="registro" valor={item.estado} />
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {field(
                            "Trabajador",
                            <>
                                <NombreCell value={item.responsableNombre} />
                                <p className="text-xs whitespace-nowrap text-tertiary">{item.responsableDocumento}</p>
                            </>,
                        )}
                        {field("Dirección", item.direccion === "RECIBIDAS" ? "Recibida" : "Enviada")}
                        {field("Enviado por", <NombreCell value={item.usuarioRegistraNombre} />)}
                        {field("Fecha", <CompensacionFechaCell value={item.fechaEvento} />)}
                        {field("Motivo", <span className="whitespace-pre-line">{item.motivo}</span>)}
                        {field(
                            "Evidencia",
                            evidence.length
                                ? evidence.map((url) => (
                                      <a key={url} className="block break-all text-brand-secondary underline" href={url} target="_blank" rel="noreferrer">
                                          {url}
                                      </a>
                                  ))
                                : null,
                        )}
                    </dl>
                    {item.revisiones.length > 0 && (
                        <div>
                            <p className="text-xs text-tertiary">Decisiones de Administración</p>
                            <ul className="mt-1 space-y-1 text-sm text-primary">
                                {item.revisiones.map((review) => (
                                    <li key={review.id}>
                                        <CompensacionEstado dominio="registro" valor={review.decision} />
                                        {review.comentario ? `: ${review.comentario}` : ""}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {canAnnul && (
                        <div className="space-y-2 rounded-lg border border-secondary p-3">
                            <p className="text-sm font-semibold text-primary">Anular mi incidencia</p>
                            <p className="text-xs text-tertiary">
                                Puedes retirarla mientras Administración no la haya decidido. Queda el registro de la anulación.
                            </p>
                            <CompensacionNoteField label="Motivo de la anulación" value={annulReason} onChange={setAnnulReason} isDisabled={saving} />
                        </div>
                    )}
                    {item.direccion === "RECIBIDAS" && (
                        <div className="space-y-2 rounded-lg border border-secondary p-3">
                            <p className="text-sm font-semibold text-primary">Tu respuesta como Jefe de Sede</p>
                            <p className="text-xs text-tertiary">Tu respuesta queda registrada para Administración. No aprueba ni rechaza la incidencia.</p>
                            {canAnswer ? (
                                <>
                                    <Select
                                        label="Postura"
                                        size="sm"
                                        placeholder="Seleccionar"
                                        isDisabled={saving}
                                        selectedKey={stance || null}
                                        items={[
                                            { id: "CONFORME", label: "Conforme" },
                                            { id: "DESCARGO", label: "Presentar descargo" },
                                        ]}
                                        onSelectionChange={(key) => setStance(key === "CONFORME" || key === "DESCARGO" ? key : "")}
                                    >
                                        {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                    </Select>
                                    <CompensacionNoteField
                                        label="Motivo"
                                        placeholder="Explica tu conformidad o tu descargo"
                                        value={comment}
                                        onChange={setComment}
                                        isDisabled={saving}
                                    />
                                </>
                            ) : (
                                <p className="text-sm text-primary">
                                    {stanceLabel(answered.postura)}
                                    {answered.comentario ? `: ${answered.comentario}` : ""}
                                </p>
                            )}
                        </div>
                    )}
                </div>
                <CompensacionDialogFooter>
                    {canAnnul && (
                        <Button
                            size="sm"
                            color="secondary-destructive"
                            iconLeading={XClose}
                            isLoading={saving}
                            isDisabled={saving}
                            onClick={() => void annul()}
                        >
                            Anular
                        </Button>
                    )}
                    {canAnswer && (
                        <Button size="sm" iconLeading={Send01} isLoading={saving} isDisabled={saving || !stance} onClick={() => void send()}>
                            Enviar respuesta
                        </Button>
                    )}
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
