import { CompensacionInfoDialog } from "../shared/compensacion-info-dialog";

/** Fuentes: contexto-actual/01-reglas-y-flujos.md y fuentes/roles/02-jefe-de-tienda.md (concepto Referido). */
export const ReferidoInfoDialog = ({ onClose }: { onClose: () => void }) => (
    <CompensacionInfoDialog
        title="Información de Referidos"
        resumen={[
            {
                concepto: "Referido",
                tipo: { label: "Bono (+)", tone: "success" },
                monto: "0.40% del monto elegible",
                observacion: "Sujeto a una efectivización pagada al 1% dentro de las primeras 168 horas.",
            },
        ]}
        pasos={[
            "Registras al cliente referido e indicas el monto y el banco.",
            "El sistema busca una efectivización pagada que cumpla las condiciones del referido.",
            "La revisión autorizada confirma si corresponde la comisión.",
        ]}
        nota="No aplica a Pago Deuda, POS ni Link. Una operación no genera dos comisiones por el mismo referido."
        onClose={onClose}
    />
);
