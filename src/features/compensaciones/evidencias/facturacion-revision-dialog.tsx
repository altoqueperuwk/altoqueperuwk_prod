import { useEffect, useRef } from "react";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { FacturacionAuditoriaForm } from "./facturacion-auditoria-form";
import type { FacturacionReporte } from "./facturacion-auditoria.service";
import { useFacturacionAuditoria } from "./use-facturacion-auditoria";

/** Revisión de un reporte de Facturación fuera de su pantalla, con las mismas reglas y acciones. */
export const FacturacionRevisionDialog = ({ record, onClose }: { record: FacturacionReporte; onClose: () => void }) => {
    const c = useFacturacionAuditoria();
    const opened = useRef(false);
    useEffect(() => {
        if (!c.context) return;
        if (!opened.current) {
            opened.current = true;
            c.open(record);
        } else if (!c.editing) {
            // Cerrar o decidir limpia el reporte abierto: la pantalla de origen recarga su listado.
            onClose();
        }
    }, [c.context, c.editing]);
    const cerrar = () => (c.editing ? c.clear() : onClose());
    return (
        <CompensacionSurface title="Reporte de Facturación" busy={c.busy} onClose={cerrar}>
            <div className="overflow-hidden rounded-xl border border-secondary bg-primary">
                <CompensacionDialogHeader title="Reporte de Facturación" busy={c.busy} onClose={cerrar} />
                <div className="space-y-4 p-4">
                    {c.editing ? (
                        <FacturacionAuditoriaForm c={c} />
                    ) : (
                        <p role="status" className="text-sm text-tertiary">
                            {c.contextError || "Cargando reporte…"}
                        </p>
                    )}
                </div>
            </div>
        </CompensacionSurface>
    );
};
