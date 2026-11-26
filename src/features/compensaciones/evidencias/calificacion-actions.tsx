import { useRef, useState } from "react";
import { Check, Edit03, Eye, RefreshCw01, Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useAlert } from "@/components/shared/alert-center";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento, LlamadaContexto } from "./evidencias.types";
import { LlamadaActions, canReviewEvidence } from "./llamada-actions";

export const CalificacionActions = ({
    item,
    contexto,
    admin,
    onChanged,
    onDetail,
}: {
    item: EvidenciaEvento;
    contexto: LlamadaContexto | null;
    admin: boolean;
    onChanged: () => void;
    onDetail: () => void;
}) => {
    const [action, setAction] = useState<"EDITAR" | "PENDIENTE" | null>(null);
    const [stars, setStars] = useState(Number(item.datos.estrellas) || 5);
    const [dni, setDni] = useState(String(item.datos.cliente_documento ?? ""));
    const [comment, setComment] = useState(item.descripcion ?? "");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);

    const lock = useRef(false);
    const beginRequest = useCompensacionRequestScope();
    const notify = useAlert();
    const { isAdministrator } = useCompensacionPerfil();
    // Las calificaciones del formulario público se evalúan solas: el servidor rechaza que Administración las resuelva o edite.
    if (isAdministrator && item.datos.autor_externo === true)
        return <ButtonUtility size="xs" color="tertiary" icon={Eye} tooltip="Ver detalle" className={compensationTableActionClass} onClick={onDetail} />;
    if (!admin || !["PENDIENTE", "APROBADO", "RECHAZADO"].includes(item.estado))
        return <LlamadaActions compact iconOnly item={item} contexto={contexto} onChanged={onChanged} onDetail={onDetail} />;
    const canResolve = canReviewEvidence(item, contexto) && contexto?.puedeRevisar === true;
    const iconClass = compensationTableActionClass;
    const open = (next: NonNullable<typeof action>) => {
        if (next !== "EDITAR" && !canResolve) return;
        setStars(Number(item.datos.estrellas) || 5);
        setDni(String(item.datos.cliente_documento ?? ""));
        setComment(item.descripcion ?? "");
        setReason("");

        setAction(next);
    };
    const reject = async () => {
        if (!canResolve || item.estado !== "APROBADO" || lock.current) return;
        lock.current = true;
        setBusy(true);
        const isCurrent = beginRequest();
        try {
            await evidenciasService.administerRating(item, "RECHAZADO", "");
            if (!isCurrent()) return;
            notify("success", "Calificación rechazada.");
            onChanged();
        } catch (cause) {
            if (!isCurrent()) return;
            notify("error", cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo rechazar la calificación");
            onChanged();
        } finally {
            lock.current = false;
            if (isCurrent()) setBusy(false);
        }
    };
    const save = async () => {
        if (!action || lock.current || (action !== "EDITAR" && !canResolve)) return;
        if (!reason.trim()) {
            notify("validation", "Indica el motivo del cambio para el historial.");
            return;
        }
        lock.current = true;
        setBusy(true);

        const isCurrent = beginRequest();
        try {
            await evidenciasService.administerRating(item, action, reason, action === "EDITAR" ? { stars, dni, comment } : undefined);
            if (!isCurrent()) return;
            notify("success", "Calificación pendiente de aprobación.");
            setAction(null);
            onChanged();
        } catch (cause) {
            if (isCurrent())
                notify("error", cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo actualizar la calificación");
        } finally {
            lock.current = false;
            if (isCurrent()) setBusy(false);
        }
    };
    return (
        <>
            <div className="flex flex-wrap items-center gap-1">
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={Edit03}
                    tooltip="Editar"
                    className={iconClass}
                    isDisabled={busy}
                    onClick={() => open("EDITAR")}
                />
                {item.estado === "PENDIENTE" ? (
                    <LlamadaActions compact iconOnly item={item} contexto={contexto} onChanged={onChanged} onDetail={onDetail} />
                ) : (
                    <>
                        {canResolve && item.estado === "APROBADO" && (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={XClose}
                                tooltip="Rechazar"
                                className={iconClass}
                                isDisabled={busy}
                                onClick={() => void reject()}
                            />
                        )}
                        {canResolve && (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={RefreshCw01}
                                tooltip="Volver pendiente"
                                className={iconClass}
                                isDisabled={busy}
                                onClick={() => open("PENDIENTE")}
                            />
                        )}
                    </>
                )}
            </div>
            {action && (action === "EDITAR" || canResolve) && (
                <CompensacionSurface title={action === "EDITAR" ? "Editar calificación" : "Volver a pendiente"} busy={busy} onClose={() => setAction(null)}>
                    <div className="mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                        <CompensacionDialogHeader
                            title={<>{action === "EDITAR" ? "Editar calificación" : "Volver a pendiente"}</>}
                            onClose={() => setAction(null)}
                            busy={busy}
                        />
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                            <p className="text-sm font-medium text-secondary">
                                {item.beneficiarioNombre} · {item.sucursalOrigenNombre ?? "Sin sede"}
                            </p>
                            {action === "EDITAR" && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Select
                                            label="Estrellas"
                                            size="sm"
                                            selectedKey={stars}
                                            items={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: `${n} ${n === 1 ? "estrella" : "estrellas"}` }))}
                                            onSelectionChange={(key) => setStars(Number(key))}
                                        >
                                            {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                                        </Select>
                                        <Input label="DNI del cliente" size="sm" value={dni} onChange={setDni} maxLength={8} isDisabled={busy} />
                                    </div>
                                    <TextArea label="Comentario" value={comment} onChange={setComment} rows={3} maxLength={2000} isDisabled={busy} />
                                </>
                            )}
                            <Input label="Motivo del cambio" size="sm" value={reason} onChange={setReason} isRequired isDisabled={busy} />
                        </div>
                        <CompensacionDialogFooter>
                            <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={() => setAction(null)}>
                                Cancelar
                            </Button>
                            <Button size="sm" iconLeading={action === "EDITAR" ? Save01 : Check} isLoading={busy} onClick={() => void save()}>
                                {action === "EDITAR" ? "Guardar" : "Confirmar"}
                            </Button>
                        </CompensacionDialogFooter>
                    </div>
                </CompensacionSurface>
            )}
        </>
    );
};
