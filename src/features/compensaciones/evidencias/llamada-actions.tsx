import { useRef, useState } from "react";
import { Check, Edit03, Eye, Trash01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { useAlert } from "@/components/shared/alert-center";
import { adminRevisionService } from "../administracion/admin-revision.service";
import { CompensacionDeleteDialog } from "../shared/compensacion-delete-dialog";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { CapturaEditDialog } from "./captura-edit-dialog";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento, LlamadaContexto } from "./evidencias.types";

// Contrato con el mapper compartido: id_colaborador_beneficiario → idColaboradorBeneficiario.
const beneficiaryId = (item: EvidenciaEvento) => ("idColaboradorBeneficiario" in item ? Number(item.idColaboradorBeneficiario) : 0);

export const isEvidenceBeneficiary = (item: EvidenciaEvento, contexto: LlamadaContexto | null) =>
    Boolean(contexto && Number(contexto.idColaborador) > 0 && beneficiaryId(item) === contexto.idColaborador);

export const isOwnEvidence = (item: EvidenciaEvento, contexto: LlamadaContexto | null) =>
    Boolean(
        contexto &&
        (item.usuarioRegistraId === contexto.idUsuario ||
            isEvidenceBeneficiary(item, contexto) ||
            (Number(contexto.idColaborador) > 0 && item.idColaboradorResponsable === contexto.idColaborador)),
    );

export const canReviewEvidence = (item: EvidenciaEvento, contexto: LlamadaContexto | null) =>
    Boolean(
        contexto &&
        !isOwnEvidence(item, contexto) &&
        // Sin el beneficiario de una calificación no se puede descartar un bono propio.
        (item.categoria !== "CALIFICACION" || !contexto.idColaborador || beneficiaryId(item) > 0),
    );

export const LlamadaActions = ({
    item,
    contexto,
    onChanged,
    onDetail,
    compact = false,
    iconOnly = false,
}: {
    item: EvidenciaEvento;
    contexto: LlamadaContexto | null;
    onChanged: () => void;
    onDetail: () => void;
    compact?: boolean;
    iconOnly?: boolean;
}) => {
    const notify = useAlert();
    const { isAdministrator, isAdvisor: isAtc, isStoreManager } = useCompensacionPerfil();
    // ATC y Jefe de Sede corrigen solo lo propio; la supervisión del equipo no concede edición.
    const isAdvisor = isAtc || isStoreManager;
    const beginRequest = useCompensacionRequestScope();
    const traceable = ["LLAMADA", "TARJETA_TERCERO"].includes(item.categoria);
    const savedProof = (item.evidencia ?? []).find(
        (value) => value && typeof value === "object" && (value as Record<string, unknown>).tipo === "SUSTENTO_ATC",
    ) as Record<string, unknown> | undefined;
    const proofUrl = typeof savedProof?.url === "string" && /^https:\/\/\S+$/.test(savedProof.url) ? savedProof.url : "";
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const lock = useRef(false);
    // ATC y Jefe de Sede corrigen o eliminan lo propio mientras nadie lo haya revisado (Esquema 12).
    const canManageOwn =
        isAdvisor &&
        traceable &&
        Boolean(contexto?.puedeRegistrar) &&
        item.usuarioRegistraId === contexto?.idUsuario &&
        ["BORRADOR", "PENDIENTE"].includes(item.estado);
    const noun = item.categoria === "TARJETA_TERCERO" ? "tarjeta" : "llamada";
    const manage = canManageOwn ? (
        <>
            <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Edit03}
                tooltip={`Editar ${noun}`}
                className={compensationTableActionClass}
                onClick={() => setEditing(true)}
            />
            <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Trash01}
                tooltip={`Eliminar ${noun}`}
                className={compensationTableActionClass}
                onClick={() => setDeleting(true)}
            />
            {editing && (
                <CapturaEditDialog
                    item={item}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        notify("success", "Registro actualizado.");
                        onChanged();
                    }}
                />
            )}
            {deleting && (
                <CompensacionDeleteDialog
                    title={`Eliminar ${noun}`}
                    message={`Se anulará tu registro de ${noun} y dejará de contar. Esta acción queda auditada.`}
                    requireReason
                    onClose={() => setDeleting(false)}
                    onConfirm={async (reason) => {
                        await evidenciasService.annul(item.id, reason);
                        setDeleting(false);
                        notify("success", "Registro eliminado.");
                        onChanged();
                    }}
                />
            )}
        </>
    ) : null;
    const pending = item.estado === "PENDIENTE" && canReviewEvidence(item, contexto);
    const canApprove = pending && contexto?.puedeAprobar && item.calificacionValida !== false;
    const canReject = pending && contexto?.puedeRevisar;
    const resolve = async (decision: "APROBADO" | "RECHAZADO") => {
        if (!(decision === "APROBADO" ? canApprove : canReject) || lock.current) return;
        lock.current = true;
        setBusy(true);
        const isCurrent = beginRequest();
        try {
            if (isAdministrator) {
                const revision = await adminRevisionService.get(item.id);
                if (!isCurrent()) return;
                if (!(decision === "APROBADO" ? revision.puede_aprobar : revision.puede_revisar))
                    throw new Error(revision.motivo || "El registro ya no admite esta acción. Actualiza la tabla.");
                await adminRevisionService.resolve({
                    id: item.id,
                    version: revision.version,
                    action: decision,
                    reason: "",
                    quantity: decision === "APROBADO" && item.tarifaRegistro?.tipoCalculo === "POR_UNIDAD" ? 1 : null,
                });
            } else
                await evidenciasService.resolve(
                    item.id,
                    decision,
                    "",
                    null,
                    decision === "APROBADO" && item.tarifaRegistro?.tipoCalculo === "POR_UNIDAD" ? 1 : null,
                );
            if (!isCurrent()) return;
            const label = item.categoria === "CALIFICACION" ? "Calificación" : item.categoria === "TARJETA_TERCERO" ? "Tarjeta" : "Llamada";
            notify("success", `${label} ${decision === "APROBADO" ? "aprobada" : "rechazada"}`);
            onChanged();
        } catch (error) {
            if (isCurrent())
                notify("error", error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo actualizar el registro");
        } finally {
            lock.current = false;
            if (isCurrent()) setBusy(false);
        }
    };
    const iconClass = compensationTableActionClass;
    const detailTooltip = isOwnEvidence(item, contexto) ? "Registro propio: solo consulta, sin aprobar ni rechazar" : "Ver detalle";
    if (!canApprove && !canReject && !proofUrl)
        return iconOnly ? (
            <div className="flex items-center gap-1">
                <ButtonUtility size="xs" color="tertiary" icon={Eye} tooltip={detailTooltip} className={iconClass} onClick={onDetail} />
                {manage}
            </div>
        ) : (
            <Button size="xs" color="tertiary" title={detailTooltip} onClick={onDetail}>
                Ver detalle
            </Button>
        );
    return (
        <div className={`flex flex-wrap items-end gap-2 ${compact ? "min-w-0" : "min-w-40"}`}>
            {!canApprove && !canReject && (
                <ButtonUtility size="xs" color="tertiary" icon={Eye} tooltip={detailTooltip} className={iconClass} onClick={onDetail} />
            )}
            {traceable && proofUrl && (
                <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-secondary underline">
                    Ver Evidencia
                </a>
            )}
            {(canApprove || canReject) && ["CALIFICACION", "TARJETA_TERCERO"].includes(item.categoria) && (
                <ButtonUtility size="xs" color="tertiary" icon={Eye} tooltip="Ver detalle" className={iconClass} onClick={onDetail} />
            )}
            {canApprove && (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={Check}
                    tooltip="Aprobar"
                    className={iconClass}
                    isDisabled={busy}
                    onClick={() => void resolve("APROBADO")}
                />
            )}
            {canReject && (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={XClose}
                    tooltip="Rechazar"
                    className={iconClass}
                    isDisabled={busy}
                    onClick={() => void resolve("RECHAZADO")}
                />
            )}
            {manage}
        </div>
    );
};
