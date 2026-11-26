import { CazaErroresForm } from "./caza-errores-form";
import type { IncidenciaCatalogo } from "./incidencias.types";

export const ErrorRegistroForm = (props: { catalog: IncidenciaCatalogo; onCancel: () => void; onSave: () => void }) => (
    <CazaErroresForm option="ERROR_REGISTRO" {...props} />
);
