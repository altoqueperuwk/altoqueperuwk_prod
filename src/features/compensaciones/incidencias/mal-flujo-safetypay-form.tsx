import { CazaErroresForm } from "./caza-errores-form";
import type { IncidenciaCatalogo } from "./incidencias.types";

export const MalFlujoSafetyPayForm = (props: { catalog: IncidenciaCatalogo; onCancel: () => void; onSave: () => void }) => (
    <CazaErroresForm option="MAL_FLUJO_SAFETYPAY" {...props} />
);
