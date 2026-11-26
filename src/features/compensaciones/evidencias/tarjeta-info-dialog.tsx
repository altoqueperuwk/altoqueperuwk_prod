import { CompensacionInfoDialog } from "../shared/compensacion-info-dialog";

/** Fuente: contexto-actual/05-cobertura-pdf-legacy.md, C05 Seguridad Tarjeta. */
export const TarjetaInfoDialog = ({ onClose }: { onClose: () => void }) => (
    <CompensacionInfoDialog
        title="Información de Auditoría Operaciones"
        resumen={[
            {
                concepto: "Seguridad Tarjeta",
                tipo: { label: "Bono (+)", tone: "success" },
                monto: "S/ 10.00",
                observacion: "Se reconoce la detección de los últimos cuatro dígitos de una tarjeta de terceros.",
            },
        ]}
        pasos={[
            "Registras la detección con sus datos y sustento.",
            "La evidencia queda disponible para la revisión autorizada.",
            "Administración confirma si corresponde el bono.",
        ]}
        nota="Un intento bloqueado puede revisarse sin operación pagada cuando el contrato lo permite."
        onClose={onClose}
    />
);
