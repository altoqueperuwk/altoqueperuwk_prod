import { useEffect, useRef, useState } from "react";
import { CheckCircle, Plus, RefreshCcw01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { compensationDate, compensationMoney } from "../shared/compensacion-cells";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import type { LlamadaContexto } from "./evidencias.types";
import { ReferidoHistorialTable } from "./referido-historial";
import { ReferidoOperaciones } from "./referido-operaciones";
import { isOtherReferral } from "./referido-permissions";
import { ReferidoTrazabilidad } from "./referido-trazabilidad";
import { type Referido, type ReferidoOperacion, referidoError, referidosService } from "./referidos.service";

export type ReferidoReviewMode = "REVISION" | "HISTORIAL" | "AGREGAR" | "VALIDAR" | "RECHAZAR" | "REVERTIR";

export const ReferidoReview = ({
    item,
    context,
    onClose,
    onChanged,
    mode = "REVISION",
}: {
    item: Referido;
    context: LlamadaContexto | null;
    onClose: () => void;
    onChanged: () => void;
    mode?: ReferidoReviewMode;
}) => {
    const [operation, setOperation] = useState<ReferidoOperacion | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [reason, setReason] = useState("");
    const [conversation, setConversation] = useState("");
    const [rejecting, setRejecting] = useState(false);
    const lock = useRef(false);
    const notify = useAlert();
    const pending = item.estado_referido === "PENDIENTE" && item.estado_evento === "PENDIENTE";
    const other = isOtherReferral(item, context);
    const admin = Boolean(context?.puedeAprobar || context?.puedeRevisar);
    const consult = admin && mode !== "HISTORIAL" && mode !== "RECHAZAR" && mode !== "REVERTIR";
    const title = {
        REVISION: "Validar efectivización del referido",
        HISTORIAL: "Historial del referido",
        AGREGAR: "Agregar efectivización",
        VALIDAR: "Validar referido",
        RECHAZAR: "Rechazar referido",
        REVERTIR: "Revertir validación",
    }[mode];
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setOperation(null);
        setError("");
        setReason("");
        setConversation("");
        setRejecting(mode === "RECHAZAR");
        if (!consult) {
            setLoading(false);
            return;
        }
        referidosService
            .operation(item.id)
            .then((value) => {
                if (!cancelled) {
                    setOperation(value);
                    setConversation(value?.conversacion ?? "");
                }
            })
            .catch((cause) => {
                if (!cancelled) setError(referidoError(cause));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [item.id, consult, mode]);
    const resolve = async (decision: "APROBADO" | "RECHAZADO") => {
        if (
            lock.current ||
            !pending ||
            !other ||
            (decision === "APROBADO"
                ? !context?.puedeAprobar || !operation || loading || Boolean(error) || Number(operation.monto) <= 0
                : !context?.puedeRevisar)
        )
            return;
        const problemasDeCampos1: string[] = [];
        if (decision === "RECHAZADO" && !reason.trim()) problemasDeCampos1.push("Ingresa el motivo del rechazo.");
        if (decision === "APROBADO" && conversation.trim() && (!/^https:\/\/\S+$/.test(conversation.trim()) || conversation.trim().length > 250))
            problemasDeCampos1.push("El enlace debe ser HTTPS.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        lock.current = true;
        setBusy(true);
        try {
            if (decision === "APROBADO") await referidosService.resolve(item.id, decision, operation!.id, reason, conversation);
            else await referidosService.resolve(item.id, decision, null, reason);
            notify("success", decision === "APROBADO" ? "Referido validado" : "Referido rechazado");
            onChanged();
        } catch (cause) {
            notify("error", referidoError(cause));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const revert = async () => {
        if (
            lock.current ||
            !context?.puedeRevisar ||
            context.puedeRevertir !== true ||
            !other ||
            item.estado_referido !== "VALIDADO" ||
            item.estado_evento !== "APROBADO"
        )
            return;
        if (!reason.trim()) return notify("validation", "Ingresa el motivo de la reversión.");
        lock.current = true;
        setBusy(true);
        try {
            await referidosService.revert(item, reason);
            notify("success", "Validación revertida. Referido pendiente de revisión.");
            onChanged();
        } catch (cause) {
            notify("error", referidoError(cause));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const addOperation = async () => {
        if (
            lock.current ||
            !admin ||
            !context?.puedeRegistrar ||
            context.puedeAgregarEfectivizacion !== true ||
            !other ||
            item.estado_referido !== "VALIDADO" ||
            !operation ||
            loading ||
            error
        )
            return;
        lock.current = true;
        setBusy(true);
        try {
            await referidosService.addOperation(item.id, operation.id);
            notify("success", "Efectivización enviada a revisión.");
            onChanged();
        } catch (cause) {
            notify("error", referidoError(cause));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title={title} busy={busy} onClose={onClose}>
            <div className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden! rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={title} onClose={onClose} busy={busy} />
                <div className="min-h-0 flex-1 shrink! overflow-y-auto p-4">
                    <p className="mt-2 text-sm text-secondary">
                        {item.nombre_referido_snapshot} · DNI {item.documento_referido_snapshot}
                    </p>
                    <p className="mt-1 text-xs text-tertiary">
                        Subido por {item.referente_nombre} · {item.sucursal_nombre}
                    </p>
                    {item.observacion && <p className="mt-2 text-sm break-words text-secondary">{item.observacion}</p>}
                    <ReferidoTrazabilidad eventId={item.id_evento} onChanged={onChanged} />
                    {mode === "REVERTIR" && context?.puedeRevisar && context.puedeRevertir === true && other && (
                        <div className="mt-4 space-y-4">
                            <p className="text-sm text-warning-primary">
                                El referido y todas sus efectivizaciones aprobadas volverán a pendiente y se retirará su comisión aprobada. Se conservarán las
                                operaciones vinculadas y el historial. Si existe una liquidación vigente o un periodo aprobado/cerrado, no se permitirá
                                revertir.
                            </p>
                            <Input label="Motivo de la reversión" size="sm" value={reason} maxLength={2000} isDisabled={busy} onChange={setReason} />
                            <div className="flex justify-end gap-2">
                                <Button color="secondary" iconLeading={XClose} isDisabled={busy} onClick={onClose}>
                                    Cancelar
                                </Button>
                                <Button color="primary-destructive" iconLeading={RefreshCcw01} isLoading={busy} onClick={() => void revert()}>
                                    Confirmar reversión
                                </Button>
                            </div>
                        </div>
                    )}
                    {consult && <ReferidoOperaciones id={item.id} />}
                    {consult &&
                        (loading ? (
                            <p className="mt-4 text-sm text-tertiary">Buscando operación…</p>
                        ) : error ? (
                            <AlertMessage tone="error">{error}</AlertMessage>
                        ) : operation ? (
                            <div className="mt-4 grid gap-3 rounded-lg border border-secondary bg-secondary p-4 sm:grid-cols-3">
                                <p className="text-sm font-semibold text-primary sm:col-span-3">Operación elegible para validar el bono</p>
                                <p className="text-sm text-primary">{operation.banco || "Sin banco"}</p>
                                <p className="text-sm font-semibold text-success-primary">{compensationMoney.format(Number(operation.monto))}</p>
                                <p className="text-sm text-secondary">{compensationDate(operation.fecha)}</p>
                                <p className="text-sm break-all text-tertiary sm:col-span-3">Operación: {operation.codigo || "Sin código"}</p>
                            </div>
                        ) : pending || item.estado_referido === "VALIDADO" ? (
                            <p className="mt-4 text-sm text-warning-primary">
                                {item.coincidencia?.estado === "AMBIGUO"
                                    ? "Hay varias operaciones coincidentes. Revisa la declaración antes de aprobar; el sistema no elige una automáticamente."
                                    : "Sin nuevas operaciones elegibles para bono. Debe coincidir DNI, banco y monto, con pago al 1% dentro de siete días. No aplica a Pago Deuda, POS ni Link Pago."}
                            </p>
                        ) : (
                            <p className="mt-4 text-sm text-secondary">
                                {item.operaciones.length} efectivización vinculada · Comisión:{" "}
                                {item.importe_aprobado == null ? "—" : compensationMoney.format(Number(item.importe_aprobado))}
                            </p>
                        ))}
                    {consult && pending && (
                        <div className="mt-3 space-y-2">
                            <Input
                                label="Conversación (Opcional)"
                                placeholder="https://..."
                                size="sm"
                                type="url"
                                maxLength={250}
                                value={conversation}
                                onChange={setConversation}
                                isDisabled={busy || Boolean(operation?.conversacion)}
                            />
                            <p className="text-xs text-tertiary">
                                Coincidencia por DNI, banco y monto: efectivización pagada al 1% dentro de siete días. La comisión se calcula al aprobar.
                            </p>
                        </div>
                    )}
                    {!admin && mode !== "HISTORIAL" && (
                        <p className="mt-4 text-sm text-secondary">La validación corresponde al revisor autorizado del equipo o a Administración.</p>
                    )}
                    {mode === "HISTORIAL" && (
                        <ReferidoHistorialTable key={item.id} id={item.id} originalEvent={item.id_evento} context={context} onChanged={onChanged} />
                    )}
                </div>
                <CompensacionDialogFooter>
                    {consult &&
                        ["AGREGAR", "REVISION"].includes(mode) &&
                        item.estado_referido === "VALIDADO" &&
                        context?.puedeRegistrar &&
                        context.puedeAgregarEfectivizacion === true &&
                        other && (
                            <Button
                                size="sm"
                                iconLeading={Plus}
                                isLoading={busy}
                                isDisabled={loading || Boolean(error) || !operation}
                                onClick={() => void addOperation()}
                            >
                                Enviar efectivización a revisión
                            </Button>
                        )}
                    {consult && pending && other && context?.puedeAprobar && (
                        <Button
                            size="sm"
                            iconLeading={CheckCircle}
                            isDisabled={loading || Boolean(error) || !operation || Number(operation?.monto) <= 0 || rejecting}
                            isLoading={busy}
                            onClick={() => void resolve("APROBADO")}
                        >
                            Validar referido
                        </Button>
                    )}
                    {mode !== "HISTORIAL" &&
                        mode !== "AGREGAR" &&
                        pending &&
                        other &&
                        context?.puedeRevisar &&
                        (rejecting ? (
                            <>
                                <Input label="Motivo del rechazo" size="sm" value={reason} maxLength={2000} isDisabled={busy} onChange={setReason} />
                                <Button size="sm" color="primary-destructive" iconLeading={XClose} isLoading={busy} onClick={() => void resolve("RECHAZADO")}>
                                    Confirmar rechazo
                                </Button>
                                <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={() => setRejecting(false)}>
                                    Cancelar
                                </Button>
                            </>
                        ) : (
                            <Button size="sm" color="secondary-destructive" iconLeading={XClose} isDisabled={busy} onClick={() => setRejecting(true)}>
                                Rechazar
                            </Button>
                        ))}
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
