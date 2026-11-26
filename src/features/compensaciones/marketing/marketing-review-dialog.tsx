import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import type { MarketingCaso } from "./marketing.service";

export const MarketingReviewDialog = ({
    review,
    mode,
    saving,
    decision,
    reason,
    onDecision,
    onReason,
    onClose,
    onSave,
}: {
    review: MarketingCaso;
    mode: "revision" | "anulacion";
    saving: boolean;
    decision: string;
    reason: string;
    onDecision: (value: string) => void;
    onReason: (value: string) => void;
    onClose: () => void;
    onSave: () => void;
}) => {
    const title = mode === "anulacion" ? "Anular Registro" : "Revisar Registro";
    return (
        <CompensacionSurface title={title} busy={saving} onClose={onClose}>
            <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>{title}</>} onClose={onClose} busy={saving} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    <p className="text-sm text-secondary">
                        {review.titulo} · <NombreCell value={review.usuario} />
                    </p>
                    <p className="text-sm text-secondary">{review.descripcion}</p>
                    {review.captura?.publicacion && (
                        <p className="text-sm text-secondary">
                            {review.captura.vistas} vistas · {review.captura.likes} reacciones · {review.captura.comentarios} comentarios ·{" "}
                            <a href={review.captura.publicacion} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                                Ver video
                            </a>
                        </p>
                    )}
                    {review.operacion && (
                        <p className="text-sm text-secondary">
                            Operación {review.operacion}
                            {review.dias_inactivo != null && ` · ${review.dias_inactivo} días sin actividad`}
                        </p>
                    )}
                    {review.evidencia && (
                        <a href={review.evidencia} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                            Abrir evidencia
                        </a>
                    )}
                    <Select
                        label="Decisión"
                        selectedKey={decision}
                        onSelectionChange={(v) => onDecision(String(v))}
                        items={
                            mode === "anulacion"
                                ? [{ id: "ANULADO", label: "Anular" }]
                                : [
                                      { id: "APROBADO", label: "Aprobar" },
                                      { id: "RECHAZADO", label: "Rechazar" },
                                  ]
                        }
                    >
                        {(item) => <Select.Item {...item} />}
                    </Select>
                    <TextArea label="Motivo" value={reason} onChange={onReason} rows={4} />
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={saving} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button size="sm" color="primary" iconLeading={Save01} isDisabled={saving || reason.trim().length < 10} onClick={onSave}>
                        Guardar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
