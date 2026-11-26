import { CompensacionInfoDialog } from "../shared/compensacion-info-dialog";

/** Fuente: contexto-actual/01-reglas-y-flujos.md y SQL120 (importe variable para Jefatura). */
export const InnovacionInfoDialog = ({ onClose }: { onClose: () => void }) => (
    <CompensacionInfoDialog
        title="Información de Propuesta de Innovación"
        resumen={[
            {
                concepto: "Bono por Aporte e Innovación Operativa",
                tipo: { label: "Bono (+)", tone: "success" },
                observacion:
                    "La propuesta debe validarse e implementarse. Administración define el monto para Jefatura y confirma la implementación antes del pago.",
            },
        ]}
        pasos={[
            "Registras un título y describes la mejora propuesta.",
            "Administración revisa y decide si la propuesta se aprueba.",
            "El pago queda sujeto a comprobar que la propuesta fue implementada.",
        ]}
        nota="Aprobar una propuesta no significa que ya esté implementada ni pagada."
        onClose={onClose}
    />
);
