import { useEffect, useRef, useState } from "react";
import { Check, Edit03, RefreshCw01, Save01, Send01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { estadoVisual } from "@/features/compensaciones/shared/compensacion-estados";
import { NombreCell, missingAmountLabel } from "../shared/compensacion-cells";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { HallazgoExpedienteDialog } from "./hallazgo-expediente-dialog";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaEvento } from "./incidencias.types";

interface Props {
    item: IncidenciaEvento | null;
    onClose: () => void;
    onChanged: () => void;
    actorCollaboratorId?: number;
}
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const humanize = (value: string) => estadoVisual("registro", value).label;
const color = (value: string): "success" | "warning" | "error" | "brand" | "gray" =>
    ["APROBADO", "LIQUIDADO", "ENVIADO"].includes(value)
        ? "success"
        : ["PENDIENTE", "OBSERVADO"].includes(value)
          ? "warning"
          : ["RECHAZADO", "ANULADO"].includes(value)
            ? "error"
            : value === "BORRADOR"
              ? "brand"
              : "gray";

type AdministrativeReview = Awaited<ReturnType<typeof incidenciasService.reviewContext>>;
const jefePenaltyOptions = [
    ["JEFE_ERROR_SUPERVISION", "Error Supervisión"],
    ["JEFE_ABANDONO_SOLIDARIO", "Abandono Chat (Solidario)"],
    ["JEFE_QUEJA_TARDIA", "Queja Tardía / Omisión de Reporte"],
    ["JEFE_UNIFORME", "Falta de Uniforme (Jefatura)"],
    ["JEFE_ERROR_CUADRO", "Error en Cuadro de Comisiones"],
    ["JEFE_INDISCIPLINA", "Indisciplina Recurrente Activa"],
] as const;

export const IncidenciaDetailModal = (props: Props) => {
    const { userId, isAdministrator, isResolving } = useCompensacionPerfil();
    return <IncidenciaDetailContent key={`${props.item?.id ?? "closed"}:${userId}:${isAdministrator}:${isResolving}`} {...props} />;
};

const IncidenciaDetailContent = ({ item, onClose, onChanged, actorCollaboratorId = 0 }: Props) => {
    const notify = useAlert();
    const { isAdvisor: isAtc, isFacturacion, isPagos, isMarketing, isStoreManager, isResolving, isAdministrator, userId } = useCompensacionPerfil();
    const isAdvisor = isAtc || isFacturacion || isPagos || isMarketing;
    const canReview = !isAdvisor && !isStoreManager && !isResolving;
    const canManageDraft =
        !isResolving &&
        ((!isAdvisor && !isStoreManager) ||
            (userId > 0 && item?.usuarioRegistraId === userId) ||
            (actorCollaboratorId > 0 && item?.reportanteId === actorCollaboratorId));
    const canDischarge = !isResolving && actorCollaboratorId > 0 && item?.responsableId === actorCollaboratorId;
    const savingLock = useRef(false);
    const mounted = useRef(false);
    const contextRequest = useRef(0);
    const [review, setReview] = useState<AdministrativeReview | null>(null);
    // La excepcion de independencia (Queja Tardia registrada y decidida por Administracion) la confirma el servidor; solo exime al registrador.
    const registrarException = isAdministrator && review?.id === item?.id && review?.excepcion_independencia === true;
    const ownParticipation =
        (item?.usuarioRegistraId === userId && !registrarException) ||
        (actorCollaboratorId > 0 && [item?.reportanteId, item?.responsableId].includes(actorCollaboratorId));
    const [reviewBusy, setReviewBusy] = useState(true);
    const [reviewError, setReviewError] = useState("");
    const [reviewRetry, setReviewRetry] = useState(0);
    const [decisionComment, setDecisionComment] = useState("");

    const [jefePenaltyCode, setJefePenaltyCode] = useState("");
    const [jefePenaltyReason, setJefePenaltyReason] = useState("");
    const [showExpediente, setShowExpediente] = useState(false);
    const [linkedConsequences, setLinkedConsequences] = useState<Awaited<ReturnType<typeof incidenciasService.getCazaConsequences>>>([]);
    const isCazaErrores = item?.datos?.flujo === "CAZA_ERRORES_V1";
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            contextRequest.current++;
        };
    }, []);
    useEffect(() => {
        if (!isAdministrator || isResolving || !item) return;
        const version = ++contextRequest.current;
        setReview(null);
        setReviewBusy(true);
        setReviewError("");
        void (async () => {
            try {
                const data = await incidenciasService.reviewContext(item.id);
                if (version !== contextRequest.current || !mounted.current) return;
                if (
                    data?.id !== item.id ||
                    data.version == null ||
                    String(data.version).trim() === "" ||
                    ![data.puede_aprobar, data.puede_revisar, data.puede_observar, data.bloqueado].every((value) => typeof value === "boolean") ||
                    ![data.requiere_descargo, data.descargo_presentado].every((value) => typeof value === "boolean") ||
                    !Array.isArray(data.fuentes)
                )
                    throw new Error("No se recibió un contexto completo de revisión administrativa.");
                setReview(data);
            } catch (cause) {
                if (version === contextRequest.current && mounted.current)
                    setReviewError(
                        cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No fue posible cargar la revisión administrativa.",
                    );
            } finally {
                if (version === contextRequest.current && mounted.current) setReviewBusy(false);
            }
        })();
        return () => {
            contextRequest.current++;
        };
    }, [isAdministrator, isResolving, item?.id, item?.estado, reviewRetry]);
    useEffect(() => {
        let active = true;
        setLinkedConsequences([]);
        if (isAdministrator && isCazaErrores && item) {
            void incidenciasService
                .getCazaConsequences(item.id)
                .then((value) => {
                    if (active) setLinkedConsequences(value);
                })
                .catch(() => {
                    if (active) setLinkedConsequences([]);
                });
        }
        return () => {
            active = false;
        };
    }, [isAdministrator, isCazaErrores, item?.id]);
    const adminReady =
        isAdministrator &&
        !isResolving &&
        userId > 0 &&
        !ownParticipation &&
        !reviewBusy &&
        !reviewError &&
        review?.id === item?.id &&
        review?.bloqueado === false;
    const adminAllowed = (decision: "APROBADO" | "RECHAZADO" | "OBSERVADO") =>
        Boolean(
            adminReady &&
            (decision === "APROBADO"
                ? review?.puede_aprobar === true
                : decision === "RECHAZADO"
                  ? review?.puede_revisar === true
                  : review?.puede_observar === true),
        );
    const decide = async (decision: "APROBADO" | "RECHAZADO" | "OBSERVADO") => {
        if (!item || !review || !adminAllowed(decision) || savingLock.current) return;
        const reason = decisionComment.trim();
        if (reason.length < 10) {
            notify("validation", "Ingresa un motivo de al menos 10 caracteres.");
            return;
        }
        savingLock.current = true;
        setIsSaving(true);

        try {
            const result = await incidenciasService.reviewDecision(item.id, review.version, decision, reason);
            if (!mounted.current) return;
            if (Number(result?.id) !== item.id) throw new Error("El servidor no confirmó la decisión sobre esta incidencia.");
            setReview(null);
            setReviewRetry((value) => value + 1);
            notify("success", "Incidencia actualizada.");
            onChanged();
        } catch (cause) {
            if (!mounted.current) return;
            setReview(null);
            setReviewError(
                cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No fue posible guardar la revisión administrativa.",
            );
        } finally {
            savingLock.current = false;
            if (mounted.current) setIsSaving(false);
        }
    };
    const addJefePenalty = async () => {
        if (!item || !adminReady || !isCazaErrores || !jefePenaltyCode || jefePenaltyReason.trim().length < 10 || savingLock.current) return;
        savingLock.current = true;
        setIsSaving(true);
        try {
            await incidenciasService.createJefePenalty(item.id, jefePenaltyCode, jefePenaltyReason);
            notify("success", "Penalidad de Jefatura vinculada y enviada a revisión.");
            onChanged();
        } catch (cause) {
            notify("error", cause instanceof Error ? cause.message : "No se pudo vincular la penalidad de Jefatura");
        } finally {
            savingLock.current = false;
            if (mounted.current) setIsSaving(false);
        }
    };
    const [comment, setComment] = useState("");
    const [editing, setEditing] = useState(false);
    const [draftTitle, setDraftTitle] = useState("");
    const [draftReason, setDraftReason] = useState("");
    const [draftEvidenceUrl, setDraftEvidenceUrl] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    useEffect(() => {
        if (item) {
            setComment("");
            setEditing(false);
            setDraftTitle(item.titulo ?? "");
            setDraftReason(item.motivo ?? "");
            const evidence = item.evidencia.find((entry) => entry && typeof entry === "object" && "url" in entry) as { url?: string } | undefined;
            setDraftEvidenceUrl(evidence?.url ?? "");
        }
    }, [item]);
    const execute = async (action: "SEND" | "DISCHARGE" | "APPROVE" | "REJECT" | "OBSERVE" | "ANNUL") => {
        if (
            !item ||
            savingLock.current ||
            isResolving ||
            (isAdministrator && ["APPROVE", "REJECT", "OBSERVE"].includes(action)) ||
            (!canReview && ["APPROVE", "REJECT", "OBSERVE"].includes(action)) ||
            (!canManageDraft && ["SEND", "ANNUL"].includes(action)) ||
            (!canDischarge && action === "DISCHARGE")
        )
            return;
        if (action === "DISCHARGE" && (!requiresDischarge || dischargePresented)) return;
        if (["DISCHARGE", "REJECT", "OBSERVE", "ANNUL"].includes(action) && !comment.trim()) return notify("validation", "Ingresa el comentario o motivo.");
        savingLock.current = true;
        setIsSaving(true);
        try {
            if (action === "SEND") await incidenciasService.send(item.id, comment);
            if (action === "DISCHARGE") await incidenciasService.discharge(item.id, comment, "");
            if (action === "APPROVE") await incidenciasService.resolve(item.id, "APROBADO", comment);
            if (action === "REJECT") await incidenciasService.resolve(item.id, "RECHAZADO", comment);
            if (action === "OBSERVE") await incidenciasService.observe(item.id, comment);
            if (action === "ANNUL") await incidenciasService.annul(item.id, comment);
            if (!mounted.current) return;
            if (isAdministrator) {
                setReview(null);
                setReviewRetry((value) => value + 1);
            }
            notify("success", "Incidencia actualizada.");
            onChanged();
        } catch (error) {
            if (!mounted.current) return;
            notify("error", error instanceof Error ? error.message : "No fue posible actualizar la incidencia");
        } finally {
            savingLock.current = false;
            if (mounted.current) setIsSaving(false);
        }
    };
    const saveCorrection = async () => {
        if (!item || savingLock.current || !canManageDraft || item.estado !== "BORRADOR") return;
        if (!draftReason.trim()) return notify("validation", "El motivo es obligatorio.");
        savingLock.current = true;
        setIsSaving(true);
        try {
            await incidenciasService.updateDraft(item.id, { titulo: draftTitle, motivo: draftReason, evidenciaUrl: draftEvidenceUrl });
            if (!mounted.current) return;
            notify("success", "Corrección guardada. Puedes volver a enviar el reporte.");
            setEditing(false);
            onChanged();
        } catch (error) {
            if (!mounted.current) return;
            notify("error", error instanceof Error ? error.message : "No fue posible guardar la corrección");
        } finally {
            savingLock.current = false;
            if (mounted.current) setIsSaving(false);
        }
    };
    const latestSendStep =
        item?.revisiones.reduce((latest, revision) => (revision.decision === "ENVIADO" ? Math.max(latest, revision.numeroPaso) : latest), 0) ?? 0;
    const hasDischarge = item?.revisiones.some((revision) => revision.etapa === "DESCARGO" && revision.numeroPaso > latestSendStep) ?? false;

    const requiresDischarge = isAdministrator ? review?.requiere_descargo === true : item?.requiereRespuesta;
    const dischargePresented = isAdministrator ? review?.descargo_presentado === true : hasDischarge;

    return (
        <AnimatePresence>
            {item && (
                <CompensacionSurface title="Detalle de incidencia" onClose={onClose} busy={isSaving}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl"
                    >
                        <CompensacionDialogHeader title={<>{item.penalidadNombre}</>} onClose={onClose} busy={isSaving}>
                            <div>
                                <div className="flex items-center gap-2">
                                    <CompensacionEstado dominio="registro" valor={item.estado} />
                                </div>
                                <div className="mt-1 text-xs text-tertiary">
                                    <CompensacionFechaCell value={item.fechaEvento} />
                                </div>
                            </div>
                        </CompensacionDialogHeader>
                        <div className="flex-1 space-y-4 overflow-y-auto p-4">
                            <div className="grid gap-4 rounded-lg border border-secondary bg-secondary p-4 sm:grid-cols-2">
                                <div>
                                    <p className="text-xs text-tertiary">Reportante</p>
                                    <p className="mt-1 text-sm">
                                        <NombreCell value={item.reportanteNombre} />
                                    </p>
                                    <p className="text-xs text-tertiary">{item.sucursalOrigenNombre ?? "—"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-tertiary">Responsable</p>
                                    <p className="mt-1 text-sm">
                                        <NombreCell value={item.responsableNombre} />
                                    </p>
                                    <p className="text-xs text-tertiary">{item.sucursalResponsableNombre ?? "—"}</p>
                                </div>
                                {!isAdministrator && (
                                    <>
                                        <div>
                                            <p className="text-xs text-tertiary">Descuento previsto</p>
                                            <p className="mt-1 text-sm font-semibold text-error-primary">{money.format(item.montoReferencia)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-tertiary">Bono previsto al reportante</p>
                                            <p className="mt-1 text-sm font-semibold text-success-primary">
                                                {item.montoBonoReportante === null ? "No aplica" : money.format(item.montoBonoReportante)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-tertiary">Descuento aprobado</p>
                                            <p className="mt-1 text-sm font-semibold text-error-primary">
                                                {item.importeAprobado === null ? missingAmountLabel(item.estado) : money.format(item.importeAprobado)}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                            {isAdministrator && (
                                <CompensacionPanel title="Revisión Administrativa">
                                    {reviewBusy ? (
                                        <p role="status" className="text-xs text-tertiary">
                                            Cargando revisión administrativa…
                                        </p>
                                    ) : reviewError ? (
                                        <div className="space-y-3">
                                            <AlertMessage tone="error">{reviewError}</AlertMessage>
                                            <Button
                                                size="sm"
                                                color="primary"
                                                iconLeading={RefreshCw01}
                                                isDisabled={isSaving}
                                                onClick={() => setReviewRetry((value) => value + 1)}
                                            >
                                                Reintentar Revisión
                                            </Button>
                                        </div>
                                    ) : (
                                        review && (
                                            <div className="space-y-3">
                                                <dl className="grid gap-3 text-xs sm:grid-cols-2">
                                                    <div>
                                                        <dt className="font-medium text-tertiary">Estado de Revisión</dt>
                                                        <dd className="mt-1 text-primary">{humanize(review.estado)}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="font-medium text-tertiary">Efecto Económico</dt>
                                                        <dd className="mt-1 whitespace-pre-wrap text-primary">{review.efecto || "No informado"}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="font-medium text-tertiary">Descuento Estimado</dt>
                                                        <dd className="mt-1 text-primary tabular-nums">
                                                            {review.descuento_estimado == null ? "No determinado" : money.format(review.descuento_estimado)}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="font-medium text-tertiary">Descargo del Responsable</dt>
                                                        <dd className="mt-1 text-primary">
                                                            {review.descargo_presentado
                                                                ? "Presentado"
                                                                : review.requiere_descargo
                                                                  ? "Requerido, pendiente"
                                                                  : "No requerido"}
                                                        </dd>
                                                    </div>
                                                </dl>
                                                {review.motivo && <p className="text-xs whitespace-pre-wrap text-secondary">{review.motivo}</p>}
                                                {review.bloqueado && (
                                                    <AlertMessage tone="notice">
                                                        {review.motivo || "El servidor bloqueó las decisiones de esta incidencia."}
                                                    </AlertMessage>
                                                )}
                                                {ownParticipation && (
                                                    <AlertMessage tone="notice">
                                                        {"Participas como autor, reportante o responsable. No puedes decidir sobre esta incidencia."}
                                                    </AlertMessage>
                                                )}
                                                {(isCazaErrores || item.datos?.flujo === "CAZA_ERRORES_CONSECUENCIA_V1") && (
                                                    <Button size="sm" color="secondary" isDisabled={isSaving} onClick={() => setShowExpediente(true)}>
                                                        Ver Expediente y Corrección
                                                    </Button>
                                                )}
                                                {isCazaErrores && (
                                                    <div className="space-y-3 rounded-lg border border-secondary bg-secondary p-3">
                                                        <h3 className="text-xs font-medium text-tertiary">Consecuencias Vinculadas</h3>
                                                        {linkedConsequences.length ? (
                                                            <ul className="space-y-2">
                                                                {linkedConsequences.map((value) => (
                                                                    <li
                                                                        key={value.id}
                                                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-secondary bg-primary px-3 py-2 text-xs"
                                                                    >
                                                                        <span className="text-primary">
                                                                            {value.tipo === "COMISION_JEFE" ? "Comisión Jefe" : "Penalidad Jefe"}:{" "}
                                                                            {value.concepto}
                                                                        </span>
                                                                        <CompensacionEstado dominio="registro" valor={value.estado} />
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="text-xs text-tertiary">Sin consecuencias adicionales registradas.</p>
                                                        )}
                                                        {!linkedConsequences.some((value) => value.tipo === "PENALIDAD_JEFE") && (
                                                            <>
                                                                <p className="text-xs text-secondary">
                                                                    Si corresponde según el caso y el PDF, vincula la penalidad del Jefe. Quedará pendiente para
                                                                    una decisión administrativa independiente.
                                                                </p>
                                                                <div className="grid gap-3 sm:grid-cols-2">
                                                                    <Select
                                                                        label="Penalidad del Jefe"
                                                                        placeholder="Seleccionar penalidad"
                                                                        size="sm"
                                                                        isRequired
                                                                        selectedKey={jefePenaltyCode || null}
                                                                        isDisabled={!adminReady || isSaving}
                                                                        items={jefePenaltyOptions.map(([id, label]) => ({ id, label }))}
                                                                        onSelectionChange={(key) => setJefePenaltyCode(String(key ?? ""))}
                                                                    >
                                                                        {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                                                    </Select>
                                                                    <TextArea
                                                                        label="Motivo de vinculación"
                                                                        size="sm"
                                                                        rows={2}
                                                                        value={jefePenaltyReason}
                                                                        onChange={setJefePenaltyReason}
                                                                        isDisabled={!adminReady || isSaving}
                                                                        hint="Mínimo 10 caracteres."
                                                                    />
                                                                </div>
                                                                <div className="flex justify-end">
                                                                    <Button
                                                                        size="sm"
                                                                        color="secondary"
                                                                        isDisabled={
                                                                            !adminReady || isSaving || !jefePenaltyCode || jefePenaltyReason.trim().length < 10
                                                                        }
                                                                        isLoading={isSaving}
                                                                        onClick={() => void addJefePenalty()}
                                                                    >
                                                                        Vincular Penalidad
                                                                    </Button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="space-y-2">
                                                    <h3 className="text-xs font-medium text-tertiary">Fuentes del Efecto Económico</h3>
                                                    {review.fuentes.length ? (
                                                        <ul className="space-y-2">
                                                            {review.fuentes.map((source, index) => (
                                                                <li
                                                                    key={`${source.tipo}:${source.codigo}:${index}`}
                                                                    className="flex flex-wrap justify-between gap-2 rounded-lg border border-secondary p-2 text-xs"
                                                                >
                                                                    <span className="min-w-0 break-words text-secondary">
                                                                        {source.tipo} · {source.codigo}
                                                                    </span>
                                                                    <span className="text-tertiary">{source.estado}</span>
                                                                    <span className="whitespace-nowrap text-primary tabular-nums">
                                                                        {source.monto == null ? "No determinado" : money.format(source.monto)}
                                                                    </span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <p className="text-xs text-tertiary">Sin fuentes informadas.</p>
                                                    )}
                                                </div>
                                                <TextArea
                                                    label="Motivo de la Decisión"
                                                    size="sm"
                                                    rows={3}
                                                    value={decisionComment}
                                                    onChange={(value) => {
                                                        setDecisionComment(value);
                                                    }}
                                                    isDisabled={!adminReady || isSaving}
                                                    hint="Mínimo 10 caracteres."
                                                />

                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        color="secondary"
                                                        iconLeading={Edit03}
                                                        isDisabled={!adminAllowed("OBSERVADO") || isSaving}
                                                        isLoading={isSaving}
                                                        onClick={() => void decide("OBSERVADO")}
                                                    >
                                                        Observar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        color="secondary-destructive"
                                                        iconLeading={XClose}
                                                        isDisabled={!adminAllowed("RECHAZADO") || isSaving}
                                                        isLoading={isSaving}
                                                        onClick={() => void decide("RECHAZADO")}
                                                    >
                                                        Rechazar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        color="primary"
                                                        iconLeading={Check}
                                                        isDisabled={!adminAllowed("APROBADO") || isSaving}
                                                        isLoading={isSaving}
                                                        onClick={() => void decide("APROBADO")}
                                                    >
                                                        Aprobar
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </CompensacionPanel>
                            )}
                            <div>
                                <h3 className="text-sm font-semibold text-primary">Motivo</h3>
                                <p className="mt-2 text-sm break-words whitespace-pre-wrap text-secondary">{item.motivo ?? "—"}</p>
                            </div>
                            {item.evidencia.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-primary">Evidencia</h3>
                                    <div className="mt-2 space-y-2">
                                        {item.evidencia.map((entry, index) => {
                                            const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
                                            const url = String(row.url ?? "");
                                            return (
                                                <div key={`${url}-${index}`} className="rounded-lg border border-secondary px-3 py-2">
                                                    {url ? (
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-sm font-medium text-brand-secondary hover:underline"
                                                        >
                                                            Abrir sustento {index + 1}
                                                        </a>
                                                    ) : (
                                                        <span className="text-sm text-tertiary">Sustento {index + 1}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {item.revisiones.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-primary">Trazabilidad</h3>
                                    <div className="mt-2 space-y-2">
                                        {item.revisiones.map((revision) => (
                                            <div key={revision.id} className="flex gap-3 rounded-lg border border-secondary p-3">
                                                <CompensacionEstado dominio="aprobacion" valor={revision.decision} />
                                                <div>
                                                    <p className="text-sm font-medium text-primary">{revision.usuarioRevisorNombre}</p>
                                                    <div className="mt-0.5 text-xs text-tertiary">
                                                        <CompensacionFechaCell value={revision.fechaRegistro} />
                                                        {revision.comentario && <p className="mt-1 whitespace-pre-wrap">{revision.comentario}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {editing && item.estado === "BORRADOR" && canManageDraft ? (
                                <div className="space-y-4 border-t border-secondary pt-5">
                                    <Input label="Título" size="sm" value={draftTitle} onChange={setDraftTitle} />
                                    <TextArea label="Motivo del reporte" size="sm" rows={4} value={draftReason} onChange={setDraftReason} />
                                </div>
                            ) : (
                                ((item.estado === "BORRADOR" && canManageDraft) ||
                                    (item.estado === "PENDIENTE" &&
                                        ((!isAdministrator && canReview) || (canDischarge && requiresDischarge && !dischargePresented)))) && (
                                    <div className="space-y-4 border-t border-secondary pt-5">
                                        <TextArea label="Comentario" size="sm" rows={3} value={comment} onChange={setComment} />
                                    </div>
                                )
                            )}
                        </div>
                        <CompensacionDialogFooter>
                            {item.estado === "BORRADOR" && canManageDraft && (
                                <>
                                    {editing ? (
                                        <>
                                            <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={isSaving} onClick={() => setEditing(false)}>
                                                Cancelar corrección
                                            </Button>
                                            <Button size="sm" color="primary" iconLeading={Save01} isLoading={isSaving} onClick={() => void saveCorrection()}>
                                                Guardar corrección
                                            </Button>
                                        </>
                                    ) : (
                                        <Button size="sm" color="secondary" isDisabled={isSaving} onClick={() => setEditing(true)}>
                                            Corregir
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        color="secondary-destructive"
                                        iconLeading={XClose}
                                        isLoading={isSaving}
                                        onClick={() => void execute("ANNUL")}
                                    >
                                        Anular
                                    </Button>
                                    {!editing && (
                                        <Button size="sm" color="primary" iconLeading={Send01} isLoading={isSaving} onClick={() => void execute("SEND")}>
                                            Enviar
                                        </Button>
                                    )}
                                </>
                            )}
                            {item.estado === "PENDIENTE" && (
                                <>
                                    {canDischarge && requiresDischarge && (
                                        <Button
                                            size="sm"
                                            color="secondary"
                                            isDisabled={dischargePresented || isSaving}
                                            isLoading={isSaving}
                                            onClick={() => void execute("DISCHARGE")}
                                        >
                                            {dischargePresented ? "Descargo presentado" : "Presentar descargo"}
                                        </Button>
                                    )}
                                    {!isAdministrator && canReview && (
                                        <>
                                            <Button size="sm" color="secondary" isLoading={isSaving} onClick={() => void execute("OBSERVE")}>
                                                Observar
                                            </Button>
                                            <Button
                                                size="sm"
                                                color="secondary-destructive"
                                                iconLeading={XClose}
                                                isLoading={isSaving}
                                                onClick={() => void execute("REJECT")}
                                            >
                                                Rechazar
                                            </Button>
                                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void execute("APPROVE")}>
                                                Aprobar
                                            </Button>
                                        </>
                                    )}
                                </>
                            )}
                        </CompensacionDialogFooter>
                    </motion.div>
                    {showExpediente && (
                        <HallazgoExpedienteDialog
                            id={item.id}
                            onClose={() => setShowExpediente(false)}
                            onChanged={() => {
                                setReviewRetry((value) => value + 1);
                                onChanged();
                            }}
                        />
                    )}
                </CompensacionSurface>
            )}
        </AnimatePresence>
    );
};
