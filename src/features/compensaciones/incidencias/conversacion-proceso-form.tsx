import { CazaErroresForm } from "./caza-errores-form";
import type { IncidenciaCatalogo } from "./incidencias.types";

export const ConversacionProcesoForm = (props: { catalog: IncidenciaCatalogo; onCancel: () => void; onSave: () => void }) => (
    <CazaErroresForm option="CONVERSACION_PROCESO" {...props} />
);
