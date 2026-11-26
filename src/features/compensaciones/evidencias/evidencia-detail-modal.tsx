import { useEffect, useRef, useState } from "react";
import { Check, Save01, Send01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { type AdminRevision, adminRevisionService } from "../administracion/admin-revision.service";
import { EstrellasCell, NombreCell, missingAmountLabel } from "../shared/compensacion-cells";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { EvidenciaCompactDetail } from "./evidencia-compact-detail";
import { camposTarifa, textoTarifa } from "./evidencia-tarifa";
import { type TiktokCuotaContexto, evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento, InnovacionImplementacion, LlamadaContexto } from "./evidencias.types";
import { OperacionTrazabilidad } from "./operacion-trazabilidad";

interface EvidenciaDetailModalProps {
    item: EvidenciaEvento | null;
    onClose: () => void;
    onChanged: () => void;
    llamadaContexto?: LlamadaContexto | null;
    readOnly?: boolean;
    allowOwnDraft?: boolean;
}

const moneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export const EvidenciaDetailModal = (props: EvidenciaDetailModalProps) => {
    if (props.item && ["LLAMADA", "CALIFICACION", "TARJETA_TERCERO"].includes(props.item.categoria)) {
        return (
            <EvidenciaCompactDetail
                key={`${props.item.id}:${props.item.fechaActualizacion ?? ""}`}
                item={props.item}
                onClose={props.onClose}
                onChanged={props.onChanged}
            />
        );
    }
    return <EvidenciaReviewModal {...props} />;
};

const EvidenciaReviewModal = ({
    item,
    onClose,
    onChanged,
    llamadaContexto,
    readOnly: requestedReadOnly = false,
    allowOwnDraft: requestedOwnDraft = false,
}: EvidenciaDetailModalProps) => {
    const { isAdvisor: isAtc, isFacturacion, isPagos, isStoreManager, isAdministrator, userId } = useCompensacionPerfil();
    const isAdvisor = isAtc || isFacturacion || isPagos;
    const ownForManager =
        isStoreManager &&
        (item?.usuarioRegistraId === userId ||
            (llamadaContexto?.idColaborador && [item?.idColaboradorBeneficiario, item?.idColaboradorResponsable].includes(llamadaContexto.idColaborador)));
    const readOnly = requestedReadOnly || isAdvisor || Boolean(ownForManager);
    const allowOwnDraft = requestedOwnDraft && (!isAdvisor || item?.usuarioRegistraId === userId);
    const notify = useAlert();
    const adminKey = `${item?.id ?? 0}:${item?.fechaActualizacion ?? ""}`;
    const currentKey = useRef(adminKey);
    currentKey.current = adminKey;
    const [adminResult, setAdminResult] = useState<{ key: string; data?: AdminRevision; error?: string } | null>(null);
    const [adminRetry, setAdminRetry] = useState(0);
    const adminRevision = adminResult?.key === adminKey ? adminResult.data : undefined;
    const adminError = adminResult?.key === adminKey ? adminResult.error : undefined;
    const adminLoading = isAdministrator && !!item && !adminRevision && !adminError;
    const decisionLock = useRef(false);
    useEffect(() => {
        if (!isAdministrator || !item) return;
        let active = true;
        setAdminResult(null);
        void adminRevisionService
            .get(item.id)
            .then((data) => {
                if (active) setAdminResult({ key: adminKey, data });
            })
            .catch((cause: unknown) => {
                if (active)
                    setAdminResult({
                        key: adminKey,
                        error:
                            cause && typeof cause === "object" && "message" in cause
                                ? String(cause.message)
                                : "No se pudo verificar la revisión administrativa.",
                    });
            });
        return () => {
            active = false;
        };
    }, [isAdministrator, item?.id, adminKey, adminRetry]);
    const [comment, setComment] = useState("");
    const [base, setBase] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [isSaving, setIsSaving] = useState(false);
    const [signedTiktokUrls, setSignedTiktokUrls] = useState<Record<string, string>>({});
    const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
    const [leadershipChecks, setLeadershipChecks] = useState({ chats: false });
    const [quota, setQuota] = useState<TiktokCuotaContexto | null>(null);
    const [quotaMet, setQuotaMet] = useState(false);
    const [quotaError, setQuotaError] = useState("");
    const [quotaRetry, setQuotaRetry] = useState(0);
    const quotaSaving = useRef(false);
    const innovationSaving = useRef(false);
    const [innovationResult, setInnovationResult] = useState<{ id: number; data: InnovacionImplementacion } | null>(null);
    const innovation = innovationResult?.id === item?.id ? (innovationResult?.data ?? null) : null;
    const [innovationError, setInnovationError] = useState("");
    const [innovationRetry, setInnovationRetry] = useState(0);
    const [implementationDate, setImplementationDate] = useState("");
    const [implementationAmount, setImplementationAmount] = useState("");
    const isInnovation = item?.tipoCodigo === "PROPUESTA_INNOVACION";
    const isAutoTiktok = item?.tipoCodigo === "TIKTOK_LIVE" && item.datos?.flujo === "TIKTOK_CLIENTE_NUEVO_7_DIAS";
    const isLeadership = item?.tipoCodigo === "META_SEDE_SAFETYPAY";
    const isCard = item?.categoria === "TARJETA_TERCERO";
    const isRating = item?.categoria === "CALIFICACION";
    const campos = camposTarifa(item?.tarifaRegistro?.tipoCalculo);
    const restrictedCall = llamadaContexto !== undefined;
    const otherAuthor = Boolean(llamadaContexto && item?.usuarioRegistraId !== llamadaContexto.idUsuario);
    const innovationReviewAllowed = !isInnovation || (isAdministrator && innovation?.puedeRevisar === true && !innovation.bloqueado);
    const canApprove =
        innovationReviewAllowed &&
        !isAutoTiktok &&
        !readOnly &&
        (!isAdministrator || adminRevision?.puede_aprobar === true) &&
        (!restrictedCall || (otherAuthor && llamadaContexto?.puedeAprobar === true));
    const canReview =
        innovationReviewAllowed &&
        !isAutoTiktok &&
        !readOnly &&
        (!isAdministrator || adminRevision?.puede_revisar === true) &&
        (!restrictedCall || (otherAuthor && llamadaContexto?.puedeRevisar === true));
    const canImplement = isInnovation && canApprove && item?.estado === "APROBADO" && !innovation?.comprobada;
    const canReviewQuota =
        isAutoTiktok && isAdministrator && !readOnly && quota?.requiereCuota === true && item?.estado === "PENDIENTE" && item.usuarioRegistraId !== userId;

    useEffect(() => {
        let active = true;
        setInnovationResult(null);
        setInnovationError("");
        setImplementationDate("");
        setImplementationAmount("");
        if (isInnovation && item) {
            void evidenciasService
                .getInnovationImplementation(item.id)
                .then((result) => {
                    if (active) setInnovationResult({ id: item.id, data: result });
                })
                .catch((error: unknown) => {
                    if (active)
                        setInnovationError(
                            error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo consultar la implementación",
                        );
                });
        }
        return () => {
            active = false;
        };
    }, [isInnovation, item, innovationRetry]);

    const implementInnovation = async () => {
        if (!item || !innovation || !canImplement || innovationSaving.current) return;
        if (!implementationDate || !comment.trim()) return notify("validation", "Completa la fecha y el motivo de implementación.");
        const amountText = implementationAmount.trim();
        const amount = innovation.importeVariable && amountText ? Number(amountText) : undefined;
        if (amount !== undefined && (!/^\d+(\.\d{1,2})?$/.test(amountText) || !(amount > 0)))
            return notify("validation", "El importe debe ser mayor que cero y tener como máximo dos decimales.");
        innovationSaving.current = true;
        const openedKey = adminKey;
        setIsSaving(true);
        try {
            await (amount === undefined
                ? evidenciasService.implementInnovation(item.id, innovation.version, implementationDate, "", comment)
                : evidenciasService.implementInnovation(item.id, innovation.version, implementationDate, "", comment, amount));
            if (currentKey.current !== openedKey) return;
            setInnovationResult((current) =>
                current?.id === item.id
                    ? {
                          id: current.id,
                          data: {
                              ...current.data,
                              comprobada: true,
                              constancia: {
                                  fecha: implementationDate,
                                  evidencia: "",
                                  motivo: comment.trim(),
                              },
                          },
                      }
                    : current,
            );
            notify("success", "Implementación comprobada; importe evaluado según la regla y los topes.");
            onChanged();
        } catch (error) {
            if (currentKey.current === openedKey)
                notify(
                    "error",
                    error && typeof error === "object" && "message" in error ? String(error.message) : "No fue posible comprobar la implementación",
                );
        } finally {
            innovationSaving.current = false;
            setIsSaving(false);
        }
    };

    useEffect(() => {
        let active = true;
        setQuota(null);
        setQuotaMet(false);
        setQuotaError("");
        if (isAutoTiktok && isAdministrator && item) {
            void evidenciasService
                .getTiktokQuota(item.id)
                .then((result) => {
                    if (active) {
                        setQuota(result);
                        setQuotaMet(result.cuotaCumplida === true);
                    }
                })
                .catch((error: unknown) => {
                    if (active)
                        setQuotaError(
                            error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo consultar la revisión de cuota",
                        );
                });
        }
        return () => {
            active = false;
        };
    }, [item, isAutoTiktok, isAdministrator, quotaRetry]);

    const reviewQuota = async () => {
        if (!item || !canReviewQuota || quotaSaving.current) return;
        if (!comment.trim()) return notify("validation", "Añade un comentario para registrar la revisión de cuota.");
        quotaSaving.current = true;
        setIsSaving(true);
        try {
            await evidenciasService.reviewTiktokQuota(item.id, comment, quotaMet);
            notify("success", quotaMet ? "Cuota confirmada; la conversión se evalúa automáticamente" : "Revisión guardada; la cuota continúa pendiente");
            onChanged();
        } catch (error) {
            notify("error", error && typeof error === "object" && "message" in error ? String(error.message) : "No fue posible guardar la revisión de cuota");
        } finally {
            quotaSaving.current = false;
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (item) {
            setPreviewImage(null);
            setComment("");
            setBase("");
            setQuantity("1");
            setLeadershipChecks({ chats: false });
        }
    }, [item]);

    useEffect(() => {
        let active = true;
        setSignedTiktokUrls({});
        if (!item)
            return () => {
                active = false;
            };
        const stored = item.evidencia.flatMap((entry) => {
            const value = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
            return value.bucket === "compensaciones-tiktok-live" && typeof value.path === "string" ? [value.path] : [];
        });
        void Promise.all(stored.map(async (path) => [path, await evidenciasService.getTiktokEvidenceUrl(path)] as const))
            .then((entries) => {
                if (active) setSignedTiktokUrls(Object.fromEntries(entries));
            })
            .catch((error: unknown) => {
                if (active) notify("error", error instanceof Error ? error.message : "No se pudo abrir la imagen de evidencia");
            });
        return () => {
            active = false;
        };
    }, [item, notify]);

    const run = async (action: "SEND" | "APPROVE" | "REJECT" | "OBSERVE" | "ANNUL") => {
        if (!item || decisionLock.current) return;
        if (isAutoTiktok) return;
        if (isAdministrator && action !== "SEND") {
            if (!adminRevision || adminLoading || adminError || requestedReadOnly) return;
            const allowed =
                action === "APPROVE"
                    ? adminRevision.puede_aprobar
                    : action === "REJECT"
                      ? adminRevision.puede_revisar
                      : action === "OBSERVE"
                        ? adminRevision.puede_observar
                        : adminRevision.puede_anular;
            if (!allowed) return;
            if (comment.trim().length < 10) return notify("validation", "Explica el motivo de la decisión (mínimo diez caracteres).");
        }
        if (isInnovation && ["APPROVE", "REJECT", "OBSERVE"].includes(action) && !innovationReviewAllowed) return;
        if (isInnovation && action === "APPROVE" && !comment.trim()) return notify("validation", "Indica el motivo de aprobación.");
        if (readOnly && !(allowOwnDraft && item.estado === "BORRADOR" && ["SEND", "ANNUL"].includes(action))) return;
        if (restrictedCall && ((action === "APPROVE" && !canApprove) || (action === "REJECT" && !canReview) || ["SEND", "ANNUL", "OBSERVE"].includes(action)))
            return;
        if (action === "APPROVE" && isLeadership && (!comment.trim() || !Object.values(leadershipChecks).every(Boolean)))
            return notify("validation", "Confirma las condiciones y añade un comentario.");
        if (["REJECT", "OBSERVE", "ANNUL"].includes(action) && !comment.trim()) return notify("validation", "Ingresa el motivo o comentario.");
        decisionLock.current = true;
        const openedKey = adminKey;
        setIsSaving(true);
        try {
            if (isAdministrator && action !== "SEND" && adminRevision) {
                await adminRevisionService.resolve({
                    id: item.id,
                    version: adminRevision.version,
                    action: ({ APPROVE: "APROBADO", REJECT: "RECHAZADO", OBSERVE: "OBSERVADO", ANNUL: "ANULADO" } as const)[action],
                    reason: comment,
                    base: campos.base && base ? Number(base) : null,
                    quantity: campos.cantidad && quantity ? Number(quantity) : null,
                    chats: leadershipChecks.chats,
                });
            } else {
                if (action === "SEND") await evidenciasService.send(item.id, comment);
                if (action === "APPROVE" && isLeadership) await evidenciasService.approveLeadership(item.id, comment, leadershipChecks);
                if (action === "APPROVE" && !isLeadership)
                    await evidenciasService.resolve(
                        item.id,
                        "APROBADO",
                        comment,
                        campos.base && base ? Number(base) : null,
                        campos.cantidad && quantity ? Number(quantity) : null,
                    );
                if (action === "REJECT") await evidenciasService.resolve(item.id, "RECHAZADO", comment, null, null);
                if (action === "OBSERVE") await evidenciasService.observe(item.id, comment);
                if (action === "ANNUL") await evidenciasService.annul(item.id, comment);
            }
            if (currentKey.current !== openedKey) return;
            notify(
                "success",
                isInnovation && action === "APPROVE"
                    ? "Propuesta aprobada; implementación pendiente"
                    : action === "SEND"
                      ? "Evidencia enviada a revisión"
                      : "Evidencia actualizada correctamente",
            );
            onChanged();
        } catch (error) {
            if (currentKey.current === openedKey) {
                const message = error && typeof error === "object" && "message" in error ? String(error.message) : "No fue posible actualizar la evidencia";
                notify("error", message);
                if (isAdministrator) setAdminResult({ key: openedKey, error: `${message}. Actualiza el contexto antes de reintentar.` });
            }
        } finally {
            decisionLock.current = false;
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {item && (
                <>
                    <CompensacionSurface
                        title={
                            isInnovation
                                ? "Propuesta de Innovación"
                                : isCard
                                  ? "Detalle de tarjeta reportada"
                                  : isRating
                                    ? "Detalle de Atención Calificada"
                                    : "Detalle de evidencia"
                        }
                        onClose={onClose}
                        busy={isSaving}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 10 }}
                            transition={{ duration: 0.18 }}
                            className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl"
                        >
                            <CompensacionDialogHeader
                                title={
                                    <>
                                        {isInnovation
                                            ? "Revisar Propuesta"
                                            : isCard
                                              ? "Detalle de tarjeta reportada"
                                              : isRating
                                                ? "Detalle de Atención Calificada"
                                                : item.tipoNombre}
                                    </>
                                }
                                onClose={onClose}
                                busy={isSaving}
                            >
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <CompensacionEstado dominio="registro" valor={item.estado} />
                                    </div>
                                    <div className="mt-1 text-xs text-tertiary">
                                        <CompensacionFechaCell value={item.fechaEvento} includeTime={!isCard} />
                                    </div>
                                </div>
                            </CompensacionDialogHeader>
                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                                {isAdministrator && (
                                    <CompensacionPanel title="Revisión Administrativa">
                                        {adminLoading ? (
                                            <p role="status" className="text-xs text-tertiary">
                                                Verificando expediente y fuentes…
                                            </p>
                                        ) : adminError ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <AlertMessage tone="error">{adminError}</AlertMessage>
                                                <Button size="sm" color="primary" onClick={() => setAdminRetry((value) => value + 1)}>
                                                    Reintentar
                                                </Button>
                                            </div>
                                        ) : (
                                            adminRevision && (
                                                <div className="space-y-2 text-xs text-secondary">
                                                    <p>
                                                        {adminRevision.motivo ||
                                                            "Revisión independiente disponible. La decisión revalida las fuentes y requiere un motivo."}
                                                    </p>
                                                    {adminRevision.requiere_implementacion && (
                                                        <p>Aprobar la propuesta no habilita su comisión: falta comprobar la implementación.</p>
                                                    )}
                                                    {adminRevision.fuentes.map((source, index) => (
                                                        <p key={`${source.codigo}:${index}`} className="break-words">
                                                            {source.tipo} · {source.codigo} · {source.estado}
                                                            {source.monto !== null ? ` · ${moneyFormatter.format(source.monto)}` : ""}
                                                        </p>
                                                    ))}
                                                    {!adminRevision.fuentes.length && <p>Sin operación enlazada. Se aplican los requisitos del concepto.</p>}
                                                </div>
                                            )
                                        )}
                                    </CompensacionPanel>
                                )}
                                {!isAutoTiktok && !isCard && !isRating && (item.categoria === "REFERIDO" || item.tipoCodigo === "TIKTOK_LIVE") && (
                                    <OperacionTrazabilidad key={`${item.id}-${item.fechaActualizacion}`} item={item} onChanged={onChanged} />
                                )}
                                <div className="grid gap-4 rounded-lg border border-secondary bg-secondary p-4 sm:grid-cols-2">
                                    <div>
                                        <p className="text-xs text-tertiary">Colaborador</p>
                                        <p className="mt-1 text-sm text-primary">
                                            <NombreCell value={item.beneficiarioNombre} />
                                        </p>
                                        <p className="text-xs whitespace-nowrap text-tertiary tabular-nums">{item.beneficiarioDocumento ?? ""}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-tertiary">Sede</p>
                                        <p className="mt-1 text-sm font-medium text-primary">{item.sucursalOrigenNombre ?? "—"}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-tertiary">Registrado por</p>
                                        <p className="mt-1 text-sm text-primary">
                                            <NombreCell value={item.usuarioRegistraNombre} />
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-tertiary">Importe aprobado</p>
                                        <p className="mt-1 text-sm font-semibold text-success-primary">
                                            {isInnovation && !innovation?.comprobada
                                                ? "Pendiente de implementación comprobada"
                                                : item.importeAprobado === null
                                                  ? missingAmountLabel(item.estado)
                                                  : moneyFormatter.format(item.importeAprobado)}
                                        </p>
                                    </div>
                                    {item.tarifaRegistro && (
                                        <div>
                                            <p className="text-xs text-tertiary">Tarifa al registro</p>
                                            <p className="mt-1 text-sm font-medium text-primary">{textoTarifa(item.tarifaRegistro)}</p>
                                            <p className="text-xs text-tertiary">
                                                {isInnovation
                                                    ? "Aprobar la propuesta no habilita la comisión."
                                                    : isAutoTiktok
                                                      ? "La comisión se evalúa automáticamente al convertir."
                                                      : "Se conserva al aprobar."}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {["CALIFICACION", "LLAMADA", "TARJETA_TERCERO", "REFERIDO"].includes(item.categoria) && (
                                    <section className="rounded-xl border border-secondary bg-primary p-4">
                                        <h3 className="text-sm font-semibold text-primary">{item.categoria === "REFERIDO" ? "Referido" : "Cliente"}</h3>
                                        <p className="mt-2 text-sm break-words text-secondary">
                                            {String(item.datos.cliente_nombre ?? "Sin nombre registrado")}
                                        </p>
                                        <p className="mt-1 text-xs text-tertiary">DNI: {String(item.datos.cliente_documento ?? "Sin documento")}</p>
                                        {item.categoria === "CALIFICACION" && (
                                            <div className="mt-2">
                                                <EstrellasCell value={item.datos.estrellas} />
                                            </div>
                                        )}
                                    </section>
                                )}
                                {isRating &&
                                    (isAdvisor ? (
                                        <p className="text-xs text-tertiary">
                                            Consulta las operaciones desde la columna Operaciones de Atención Calificada. ATC no aprueba su propia comisión.
                                        </p>
                                    ) : (
                                        <OperacionTrazabilidad key={`${item.id}-${item.fechaActualizacion}`} item={item} onChanged={onChanged} />
                                    ))}
                                {isCard && <OperacionTrazabilidad key={`${item.id}-${item.fechaActualizacion}`} item={item} onChanged={onChanged} />}
                                {item.datos?.flujo === "PAGOS_DETECCION_V1" && item.datos.captura != null && typeof item.datos.captura === "object" && (
                                    <dl className="grid gap-3 rounded-xl border border-secondary bg-secondary p-4 sm:grid-cols-2">
                                        {Object.entries(item.datos.captura)
                                            .filter(([key]) => key !== "motivo" && key !== "fecha")
                                            .map(([key, value]) => (
                                                <div key={key}>
                                                    <dt className="text-xs font-medium text-tertiary">
                                                        {(
                                                            {
                                                                dni: "DNI del Cliente",
                                                                original: "Dato Original",
                                                                corregido: "Dato Corregido",
                                                                chat: "Conversación",
                                                                sin_respuesta_desde: "Sin Respuesta Desde",
                                                                atencion_asumida: "Atención Asumida",
                                                            } as Record<string, string>
                                                        )[key] ?? key}
                                                    </dt>
                                                    <dd className="mt-1 text-sm break-words text-primary">
                                                        {key === "sin_respuesta_desde" || key === "atencion_asumida" ? (
                                                            <CompensacionFechaCell value={String(value)} />
                                                        ) : (
                                                            String(value)
                                                        )}
                                                    </dd>
                                                </div>
                                            ))}
                                    </dl>
                                )}
                                {(item.titulo || item.descripcion) && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-primary">{isCard ? "Notas del reporte" : "Detalle"}</h3>
                                        <p className="mt-2 text-sm font-medium break-words text-primary">{item.titulo}</p>
                                        <p className="mt-1 text-sm break-words whitespace-pre-wrap text-secondary">{item.descripcion}</p>
                                    </div>
                                )}
                                {item.evidencia.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-primary">Sustentos ({item.evidencia.length})</h3>
                                        <div className="mt-2 space-y-2">
                                            {item.evidencia.map((entry, index) => {
                                                const value = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
                                                const storedPath =
                                                    value.bucket === "compensaciones-tiktok-live" && typeof value.path === "string" ? value.path : null;
                                                const url = storedPath ? (signedTiktokUrls[storedPath] ?? "") : String(value.url ?? "");
                                                return (
                                                    <div key={`${url}-${index}`} className="rounded-lg border border-secondary px-3 py-2 text-sm">
                                                        {url ? (
                                                            storedPath ? (
                                                                <button
                                                                    type="button"
                                                                    className="w-full text-left font-medium text-brand-secondary hover:underline"
                                                                    aria-label={`Ver imagen ${String(value.nombre ?? `Captura de TikTok Live ${index + 1}`)}`}
                                                                    onClick={() =>
                                                                        setPreviewImage({
                                                                            url,
                                                                            name: String(value.nombre ?? `Captura de TikTok Live ${index + 1}`),
                                                                        })
                                                                    }
                                                                >
                                                                    <span className="flex items-center gap-3">
                                                                        <img
                                                                            className="size-14 rounded-md border border-secondary object-cover"
                                                                            src={url}
                                                                            alt=""
                                                                        />
                                                                        <span>
                                                                            {String(value.nombre ?? `Captura de TikTok Live ${index + 1}`)} · Ver imagen
                                                                        </span>
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                <a
                                                                    className="font-medium text-brand-secondary hover:underline"
                                                                    href={url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                >
                                                                    Abrir evidencia {index + 1}
                                                                </a>
                                                            )
                                                        ) : storedPath ? (
                                                            <span className="text-tertiary">Cargando evidencia…</span>
                                                        ) : isRating && value.tipo === "FORMULARIO_PUBLICO" ? (
                                                            <p className="text-xs text-secondary">
                                                                Respuesta recibida desde el enlace o QR del asesor. Las estrellas y el comentario fueron
                                                                enviados por el cliente.
                                                            </p>
                                                        ) : ["REGISTRO_LLAMADA", "REGISTRO_TARJETA_TERCERO"].includes(String(value.tipo)) ? (
                                                            <div>
                                                                <p className="font-medium text-secondary">
                                                                    {value.tipo === "REGISTRO_LLAMADA"
                                                                        ? "Registro de llamada"
                                                                        : "Registro de tarjeta de terceros"}
                                                                </p>
                                                                <p className="mt-1 text-xs text-tertiary">
                                                                    Datos declarados por el usuario. No incluye adjuntos ni verificación externa.
                                                                </p>
                                                            </div>
                                                        ) : (
                                                            <span className="text-tertiary">Evidencia {index + 1}</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {item.revisiones.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-semibold text-primary">Historial de revisión</h3>
                                        <div className="mt-2 space-y-2">
                                            {item.revisiones.map((revision) => (
                                                <div key={revision.id} className="flex gap-3 rounded-lg border border-secondary p-3">
                                                    <CompensacionEstado dominio="aprobacion" valor={revision.decision} />
                                                    <div>
                                                        <p className="text-sm font-medium text-primary">{revision.usuarioRevisorNombre}</p>
                                                        <div className="mt-1 space-y-1 text-xs text-tertiary">
                                                            {revision.fechaRegistro && <CompensacionFechaCell value={revision.fechaRegistro} />}
                                                            {revision.comentario && <p className="break-words whitespace-pre-wrap">{revision.comentario}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {isInnovation && (
                                    <section className="rounded-2xl border border-secondary bg-secondary">
                                        <h3 className="px-4 pt-3 pb-5 text-xs font-medium text-tertiary">Implementación de la Propuesta</h3>
                                        <div className="relative -mx-px -mt-2 -mb-px space-y-3 rounded-xl border border-secondary bg-primary p-4">
                                            <p className="text-xs text-tertiary">
                                                La comisión requiere aprobación e implementación comprobada por un administrador independiente. Habilitada no
                                                significa pagada.
                                            </p>
                                            {innovationError ? (
                                                <>
                                                    <AlertMessage tone="error">{innovationError}</AlertMessage>
                                                    <Button size="sm" color="secondary" onClick={() => setInnovationRetry((value) => value + 1)}>
                                                        Reintentar
                                                    </Button>
                                                </>
                                            ) : !innovation ? (
                                                <p role="status" className="text-xs text-tertiary">
                                                    Consultando implementación…
                                                </p>
                                            ) : innovation.comprobada && innovation.constancia ? (
                                                <>
                                                    <p className="text-sm font-medium text-success-primary">Implementación Comprobada</p>
                                                    <CompensacionFechaCell value={`${innovation.constancia.fecha}T12:00:00-05:00`} />
                                                    {innovation.constancia.evidencia && (
                                                        <p className="text-xs break-words whitespace-pre-wrap text-secondary">
                                                            {innovation.constancia.evidencia}
                                                        </p>
                                                    )}
                                                    <p className="text-xs break-words whitespace-pre-wrap text-secondary">{innovation.constancia.motivo}</p>
                                                </>
                                            ) : (
                                                <p className="text-xs text-secondary">
                                                    {innovation.bloqueado
                                                        ? "Periodo bloqueado. Cualquier corrección requiere un ajuste auditado."
                                                        : "Implementación Pendiente"}
                                                </p>
                                            )}
                                            {canImplement && (
                                                <>
                                                    <Input
                                                        label="Fecha de Implementación"
                                                        size="sm"
                                                        type="date"
                                                        value={implementationDate}
                                                        onChange={setImplementationDate}
                                                        isDisabled={isSaving}
                                                    />
                                                    {innovation?.importeVariable && (
                                                        <Input
                                                            label="Importe de la innovación (S/)"
                                                            size="sm"
                                                            type="number"
                                                            value={implementationAmount}
                                                            onChange={setImplementationAmount}
                                                            isDisabled={isSaving}
                                                            hint="Opcional. Sin importe se aplica la tarifa de la regla. El sistema limita el total mensual de meta e innovación al tope configurado."
                                                        />
                                                    )}
                                                    <TextArea
                                                        label="Motivo de Confirmación"
                                                        size="sm"
                                                        rows={2}
                                                        value={comment}
                                                        onChange={setComment}
                                                        isDisabled={isSaving}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    </section>
                                )}
                                {isAutoTiktok && isAdministrator && (
                                    <section className="space-y-3 rounded-xl border border-secondary bg-secondary p-4">
                                        <h3 className="text-xs font-medium text-tertiary">Revisión de Cuota de Sede</h3>
                                        {quotaError ? (
                                            <>
                                                <AlertMessage tone="error">{quotaError}</AlertMessage>
                                                <Button size="sm" color="secondary" onClick={() => setQuotaRetry((value) => value + 1)}>
                                                    Reintentar
                                                </Button>
                                            </>
                                        ) : !quota ? (
                                            <p role="status" className="text-xs text-tertiary">
                                                Consultando revisión de cuota…
                                            </p>
                                        ) : quota.requiereCuota ? (
                                            <>
                                                <p className="text-xs text-tertiary">
                                                    Confirma la cuota de efectivizaciones de sede con el sustento adjunto. La comisión depende también de una
                                                    operación final pagada dentro de siete días.
                                                </p>
                                                <p className="text-xs text-secondary">
                                                    {quota.cuotaCumplida === true
                                                        ? "Cuota confirmada"
                                                        : quota.cuotaCumplida === false
                                                          ? "Cuota no confirmada como cumplida; pendiente de revisión"
                                                          : "Cuota pendiente de revisión administrativa"}
                                                </p>
                                                {quota.comentario && (
                                                    <p className="text-xs break-words whitespace-pre-wrap text-secondary">{quota.comentario}</p>
                                                )}
                                                {quota.fecha && <CompensacionFechaCell value={quota.fecha} />}
                                                {canReviewQuota && (
                                                    <Checkbox
                                                        label="Cuota de Efectivizaciones Cumplida"
                                                        isSelected={quotaMet}
                                                        isDisabled={isSaving}
                                                        onChange={setQuotaMet}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-xs text-tertiary">Este registro no requiere revisión de cuota de Jefatura.</p>
                                        )}
                                    </section>
                                )}
                                {canApprove && !isInnovation && item.estado === "PENDIENTE" && (campos.base || campos.cantidad) && (
                                    <div className="grid gap-4 border-t border-secondary pt-5 sm:grid-cols-2">
                                        {campos.base && (
                                            <Input
                                                label="Monto base (S/)"
                                                size="sm"
                                                type="number"
                                                value={base}
                                                onChange={setBase}
                                                hint={item.tarifaRegistro ? undefined : "Solo para tarifas porcentuales."}
                                            />
                                        )}
                                        {campos.cantidad && (
                                            <Input label={campos.etiquetaCantidad} size="sm" type="number" value={quantity} onChange={setQuantity} />
                                        )}
                                    </div>
                                )}
                                {canApprove && isLeadership && item.estado === "PENDIENTE" && (
                                    <section className="space-y-3 rounded-xl border border-secondary bg-secondary p-4">
                                        <h3 className="text-sm font-semibold text-primary">Revisión de jefatura</h3>
                                        <p className="text-xs text-tertiary">
                                            El sistema exige el 100% de la meta mensual. Confirma con evidencia la ausencia de descuido de chats. Los reportes
                                            pendientes mantienen el bono en revisión; un descuido confirmado impide habilitarlo.
                                        </p>
                                        <Checkbox
                                            label="Sin chats descuidados"
                                            isSelected={leadershipChecks.chats}
                                            onChange={(chats) => setLeadershipChecks((current) => ({ ...current, chats }))}
                                        />
                                    </section>
                                )}
                                {(canApprove || canReview || canReviewQuota || allowOwnDraft) &&
                                    ["BORRADOR", "PENDIENTE"].includes(item.estado) &&
                                    (!readOnly || item.estado === "BORRADOR") && (
                                        <TextArea
                                            label={item.estado === "BORRADOR" ? "Comentario de envío o motivo de anulación" : "Comentario de revisión"}
                                            size="sm"
                                            rows={3}
                                            value={comment}
                                            onChange={setComment}
                                        />
                                    )}
                            </div>
                            <CompensacionDialogFooter>
                                {canImplement && (
                                    <Button size="sm" color="primary" iconLeading={Save01} isLoading={isSaving} onClick={() => void implementInnovation()}>
                                        Comprobar Implementación
                                    </Button>
                                )}
                                {!isAutoTiktok && !restrictedCall && (!readOnly || allowOwnDraft) && item.estado === "BORRADOR" && (
                                    <>
                                        {(!isAdministrator || adminRevision?.puede_anular) && (
                                            <Button
                                                size="sm"
                                                color="secondary-destructive"
                                                iconLeading={XClose}
                                                isLoading={isSaving}
                                                onClick={() => void run("ANNUL")}
                                            >
                                                Anular
                                            </Button>
                                        )}
                                        <Button size="sm" color="primary" iconLeading={Send01} isLoading={isSaving} onClick={() => void run("SEND")}>
                                            Enviar a revisión
                                        </Button>
                                    </>
                                )}
                                {item.estado === "PENDIENTE" && (
                                    <>
                                        {canReviewQuota && (
                                            <Button size="sm" color="primary" iconLeading={Save01} isLoading={isSaving} onClick={() => void reviewQuota()}>
                                                Guardar Revisión de Cuota
                                            </Button>
                                        )}
                                        {!restrictedCall && canReview && (!isAdministrator || adminRevision?.puede_observar) && (
                                            <Button size="sm" color="secondary" isLoading={isSaving} onClick={() => void run("OBSERVE")}>
                                                Observar
                                            </Button>
                                        )}
                                        {canReview && (
                                            <Button
                                                size="sm"
                                                color="secondary-destructive"
                                                iconLeading={XClose}
                                                isLoading={isSaving}
                                                onClick={() => void run("REJECT")}
                                            >
                                                Rechazar
                                            </Button>
                                        )}
                                        {canApprove && (
                                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void run("APPROVE")}>
                                                Aprobar
                                            </Button>
                                        )}
                                    </>
                                )}
                            </CompensacionDialogFooter>
                        </motion.div>
                    </CompensacionSurface>
                    {previewImage && (
                        <CompensacionSurface title="Evidencia de TikTok Live" onClose={() => setPreviewImage(null)}>
                            <div className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
                                <CompensacionDialogHeader title={<>{previewImage.name}</>} onClose={() => setPreviewImage(null)} closeLabel="Cerrar imagen" />
                                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-secondary p-4">
                                    <img className="max-h-[75vh] max-w-full rounded-lg object-contain" src={previewImage.url} alt={previewImage.name} />
                                </div>
                            </div>
                        </CompensacionSurface>
                    )}
                </>
            )}
        </AnimatePresence>
    );
};
