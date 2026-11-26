import { useEffect, useRef, useState } from "react";
import { Check, Save01, Send01, Trash01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { type AdminRevision, adminRevisionService } from "../administracion/admin-revision.service";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento, InnovacionImplementacion } from "./evidencias.types";

export const InnovacionRevisionActions = ({ item, userId, onChanged }: { item: EvidenciaEvento; userId: number; onChanged: () => void }) => {
    const [context, setContext] = useState<{ revision: AdminRevision; implementation: InnovacionImplementacion } | null>(null);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const beginRequest = useCompensacionRequestScope();
    const notify = useAlert();
    const own = item.usuarioRegistraId === userId;
    useEffect(() => {
        let active = true;
        setContext(null);
        setError("");
        if (own || item.estado !== "PENDIENTE") return;
        void Promise.all([adminRevisionService.get(item.id), evidenciasService.getInnovationImplementation(item.id)])
            .then(([revision, implementation]) => {
                if (active) setContext({ revision, implementation });
            })
            .catch((cause) => {
                if (active)
                    setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron verificar los permisos");
            });
        return () => {
            active = false;
        };
    }, [item.id, item.estado, item.fechaActualizacion, own, retry]);
    const allowed = (revision: AdminRevision, implementation: InnovacionImplementacion, decision: "APROBADO" | "RECHAZADO") =>
        revision.id === item.id &&
        revision.estado === "PENDIENTE" &&
        !revision.bloqueado &&
        !implementation.bloqueado &&
        implementation.puedeRevisar &&
        (decision === "APROBADO" ? revision.puede_aprobar : revision.puede_revisar);
    const resolve = async (decision: "APROBADO" | "RECHAZADO") => {
        if (lock.current || own || item.estado !== "PENDIENTE" || !context || !allowed(context.revision, context.implementation, decision)) return;
        lock.current = true;
        setBusy(true);
        const isCurrent = beginRequest();
        try {
            const [revision, implementation] = await Promise.all([adminRevisionService.get(item.id), evidenciasService.getInnovationImplementation(item.id)]);
            if (!isCurrent()) return;
            if (!allowed(revision, implementation, decision)) throw new Error("La propuesta ya no admite esta decisión. Actualiza el listado.");
            await adminRevisionService.resolve({ id: item.id, version: revision.version, action: decision, reason: "" });
            if (!isCurrent()) return;
            notify("success", decision === "APROBADO" ? "Propuesta aprobada; implementación pendiente de comprobar." : "Propuesta rechazada.");
            onChanged();
        } catch (cause) {
            if (!isCurrent()) return;
            notify("error", cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo resolver la propuesta");
            setContext(null);
            setRetry((value) => value + 1);
            onChanged();
        } finally {
            lock.current = false;
            if (isCurrent()) setBusy(false);
        }
    };
    if (own || item.estado !== "PENDIENTE") return null;
    if (error)
        return (
            <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Check}
                tooltip={`Reintentar revisión: ${error}`}
                className={compensationTableActionClass}
                onClick={() => setRetry((value) => value + 1)}
            />
        );
    return (
        <>
            {!context && (
                <span role="status" className="text-xs text-tertiary">
                    Verificando revisión…
                </span>
            )}
            {context && allowed(context.revision, context.implementation, "APROBADO") && (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={Check}
                    tooltip="Aprobar propuesta"
                    className={compensationTableActionClass}
                    isDisabled={busy}
                    onClick={() => void resolve("APROBADO")}
                />
            )}
            {context && allowed(context.revision, context.implementation, "RECHAZADO") && (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={XClose}
                    tooltip="Rechazar propuesta"
                    className={compensationTableActionClass}
                    isDisabled={busy}
                    onClick={() => void resolve("RECHAZADO")}
                />
            )}
        </>
    );
};

export type InnovacionPropuestaAction = "DETALLE" | "EDITAR" | "ENVIAR" | "ELIMINAR";
const titles = { DETALLE: "Detalle de propuesta", EDITAR: "Editar propuesta", ENVIAR: "Enviar propuesta", ELIMINAR: "Eliminar propuesta" };

export const InnovacionPropuestaDialog = ({
    item,
    action,
    onClose,
    onChanged,
}: {
    item: EvidenciaEvento;
    action: InnovacionPropuestaAction;
    onClose: () => void;
    onChanged: () => void;
}) => {
    const [title, setTitle] = useState(item.titulo ?? "");
    const [description, setDescription] = useState(item.descripcion ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const beginRequest = useCompensacionRequestScope();
    const notify = useAlert();
    const edit = action === "EDITAR";
    const detail = action === "DETALLE";
    // Pendiente de revisión: el autor aún puede corregirla o eliminarla; enviar solo aplica al borrador.
    const canAct = item.estado === "BORRADOR" || (item.estado === "PENDIENTE" && action !== "ENVIAR");
    const save = async () => {
        if (lock.current || detail || !canAct || (edit && (!title.trim() || !description.trim()))) return;
        lock.current = true;
        setBusy(true);
        setError("");
        const isCurrent = beginRequest();
        try {
            const result = edit
                ? await (item.estado === "BORRADOR" ? evidenciasService.updateInnovationDraft : evidenciasService.updateInnovationPending)(
                      item.id,
                      title,
                      description,
                  )
                : action === "ENVIAR"
                  ? await evidenciasService.send(item.id)
                  : await evidenciasService.annul(item.id, "Borrador eliminado por su autor");
            if (!isCurrent()) return;
            const expected = edit ? item.estado : action === "ENVIAR" ? "PENDIENTE" : "ANULADO";
            if (Number(result.id) !== item.id || result.estado_evento !== expected) throw new Error("No se confirmó el cambio. Actualiza el listado.");
            notify("success", edit ? "Propuesta actualizada." : action === "ENVIAR" ? "Propuesta enviada a revisión." : "Propuesta eliminada.");
            onChanged();
        } catch (cause) {
            if (isCurrent()) setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo completar la acción");
        } finally {
            lock.current = false;
            if (isCurrent()) setBusy(false);
        }
    };
    return (
        <CompensacionSurface title={titles[action]} onClose={onClose} busy={busy}>
            <div className="mx-auto flex w-full max-w-lg flex-col overflow-hidden! rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={titles[action]} onClose={onClose} busy={busy} />
                <div className="min-h-0 flex-1 shrink! space-y-3 overflow-y-auto p-4">
                    {detail && <CompensacionEstado dominio="registro" valor={item.estado} />}
                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                    {edit ? (
                        <>
                            <Input label="Título" isRequired size="sm" maxLength={250} value={title} onChange={setTitle} isDisabled={busy} />
                            <CompensacionNoteField
                                label="Descripción"
                                isRequired
                                maxLength={2000}
                                value={description}
                                onChange={setDescription}
                                isDisabled={busy}
                            />
                        </>
                    ) : (
                        <>
                            <h3 className="text-sm font-medium break-words text-primary">{item.titulo || "Sin título"}</h3>
                            {detail ? (
                                <>
                                    <div className="text-xs text-tertiary">
                                        <CompensacionFechaCell value={item.fechaEvento} />
                                    </div>
                                    <p className="text-sm break-words whitespace-pre-wrap text-secondary">{item.descripcion || "Sin descripción"}</p>
                                    <div className="flex justify-between gap-3 border-t border-secondary pt-3 text-sm">
                                        <span className="text-tertiary">Comisión</span>
                                        <span className="font-medium text-primary">
                                            {Number(item.importeAprobado) > 0 && ["APROBADO", "LIQUIDADO"].includes(item.estado)
                                                ? new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(item.importeAprobado))
                                                : "Pendiente"}
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-secondary">
                                    {action === "ENVIAR"
                                        ? "¿Enviar esta propuesta a revisión? Después del envío no podrás editarla."
                                        : "¿Eliminar este borrador? Quedará anulado y se conservará su historial."}
                                </p>
                            )}
                        </>
                    )}
                </div>
                {!detail && (
                    <CompensacionDialogFooter>
                        <Button size="xs" className="h-9" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={onClose}>
                            Cancelar
                        </Button>
                        {!detail && (
                            <Button
                                size="xs"
                                className="h-9"
                                color={action === "ELIMINAR" ? "primary-destructive" : "primary"}
                                iconLeading={edit ? Save01 : action === "ENVIAR" ? Send01 : Trash01}
                                isLoading={busy}
                                isDisabled={!canAct || (edit && (!title.trim() || !description.trim()))}
                                onClick={() => void save()}
                            >
                                {edit ? "Guardar" : action === "ENVIAR" ? "Enviar" : "Eliminar"}
                            </Button>
                        )}
                    </CompensacionDialogFooter>
                )}
            </div>
        </CompensacionSurface>
    );
};
