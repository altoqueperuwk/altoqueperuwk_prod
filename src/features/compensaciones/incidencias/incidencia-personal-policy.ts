export type IncidenciaPersonalConcept = "UNIFORME" | "INDISCIPLINA";

/** Son vistas del expediente común; no crean una penalidad ni un permiso nuevo. */
export const personalIncidenceConcept = (value: string | null): IncidenciaPersonalConcept | undefined =>
    value === "uniforme" ? "UNIFORME" : value === "indisciplina" ? "INDISCIPLINA" : undefined;

export const personalIncidenceTitle = (concept: IncidenciaPersonalConcept) =>
    concept === "UNIFORME" ? "Falta de Uniforme Completo" : "Indisciplina Recurrente Activa";

export const matchesPersonalIncidence = (code: string, concept?: IncidenciaPersonalConcept) => !concept || code.toUpperCase().includes(concept);
