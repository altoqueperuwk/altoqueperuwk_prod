import { CheckCircle, ClockRewind, Edit03, Plus, RefreshCcw01, Trash01, XCircle } from "@untitledui/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import type { LlamadaContexto } from "./evidencias.types";
import { isOtherReferral } from "./referido-permissions";
import type { ReferidoReviewMode } from "./referido-review";
import type { Referido } from "./referidos.service";

export const ReferidoRowActions = ({
    item,
    context,
    onOpen,
    onEdit,
    onDelete,
    busy = false,
}: {
    item: Referido;
    context: LlamadaContexto | null;
    onOpen: (mode: ReferidoReviewMode) => void;
    /** Solo ATC sobre su propio referido pendiente. */
    onEdit?: () => void;
    onDelete?: () => void;
    busy?: boolean;
}) => {
    const own = Boolean(context && Number(item.id_usuario_registra) === context.idUsuario);
    const canManage = own && item.estado_referido === "PENDIENTE" && item.estado_evento === "PENDIENTE";
    const pending = item.estado_referido === "PENDIENTE" && item.estado_evento === "PENDIENTE";
    const other = isOtherReferral(item, context);
    const actions: { mode: ReferidoReviewMode; label: string; icon: typeof ClockRewind; visible: boolean }[] = [
        { mode: "VALIDAR", label: "Validar", icon: CheckCircle, visible: pending && other && !!context?.puedeAprobar },
        { mode: "RECHAZAR", label: "Rechazar", icon: XCircle, visible: pending && other && !!context?.puedeRevisar },
        {
            mode: "AGREGAR",
            label: "Agregar efectivización",
            icon: Plus,
            visible: false, // Otra visita requiere una nueva declaración y su propio plazo.
        },
        {
            mode: "REVERTIR",
            label: "Revertir validación",
            icon: RefreshCcw01,
            visible:
                item.estado_referido === "VALIDADO" && item.estado_evento === "APROBADO" && other && !!context?.puedeRevisar && context?.puedeRevertir === true,
        },
        { mode: "HISTORIAL", label: "Historial", icon: ClockRewind, visible: true },
    ];
    return (
        <div className="flex items-center gap-1">
            {actions
                .filter((action) => action.visible)
                .map((action) => (
                    <ButtonUtility
                        key={action.mode}
                        size="xs"
                        color="tertiary"
                        icon={action.icon}
                        tooltip={action.label}
                        isDisabled={busy || (action.mode === "VALIDAR" && !!item.coincidencia && item.coincidencia.estado !== "ENCONTRADO")}
                        aria-busy={busy || undefined}
                        className={compensationTableActionClass}
                        onClick={() => onOpen(action.mode)}
                    />
                ))}
            {canManage && onEdit && (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={Edit03}
                    tooltip="Editar referido"
                    isDisabled={busy}
                    className={compensationTableActionClass}
                    onClick={onEdit}
                />
            )}
            {canManage && onDelete && (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={Trash01}
                    tooltip="Eliminar referido"
                    isDisabled={busy}
                    className={compensationTableActionClass}
                    onClick={onDelete}
                />
            )}
        </div>
    );
};
