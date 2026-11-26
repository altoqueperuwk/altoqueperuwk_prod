import { CompensacionInfoDialog } from "../shared/compensacion-info-dialog";

/** Fuente: contexto-actual/fuentes/roles/02-jefe-de-tienda.md, Llamada / Contacto. */
export const LlamadaInfoDialog = ({ onClose }: { onClose: () => void }) => (
    <CompensacionInfoDialog
        title="Información de Llamadas"
        resumen={[
            {
                concepto: "Llamada / Contacto",
                tipo: { label: "Bono (+)", tone: "success" },
                monto: "S/ 0.20",
                observacion: "Aplica por cada llamada entrante contestada vía Pancake.",
            },
        ]}
        pasos={[
            "Registras cada llamada entrante que contestas por Pancake.",
            "La llamada queda disponible para la revisión autorizada.",
            "Administración confirma si corresponde la comisión.",
        ]}
        onClose={onClose}
    />
);
