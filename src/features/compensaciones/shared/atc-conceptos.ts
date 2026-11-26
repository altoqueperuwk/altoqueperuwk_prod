/** Conceptos del esquema ATC. Los enlaces son consultas derivadas de permisos existentes. */
export const atcDescuentos = [
    { codigo: "ATC_ERROR_DATOS", nombre: "Error de Datos" },
    { codigo: "ATC_ABANDONO_CHAT", nombre: "Abandono Chat" },
    { codigo: "ATC_MAL_FLUJO", nombre: "Mal Flujo CMR / Safety" },
    { codigo: "ATC_PROCESO_AIRE", nombre: "Dejar Conversación / Proceso al Aire" },
    { codigo: "ATC_ERROR_REGISTRO", nombre: "Error en Registro Manual o Código" },
    { codigo: "ATC_UNIFORME", nombre: "Falta de Uniforme Completo" },
    { codigo: "ATC_INDISCIPLINA", nombre: "Indisciplina Recurrente Activa" },
    { codigo: "ATC_FRAUDE_DIGITAL", nombre: "Tolerancia Cero Digital" },
] as const;

export const atcConceptLabels: Record<string, string> = {
    "/compensaciones/otros-bonos/propuesta_innovacion": "Bono por Propuesta de Innovación. (Toda Área)",
    "/compensaciones/auditoria-operaciones": "Auditorías registradas y penalidades de auditoría",
    "/compensaciones/indisciplina-colaborador": "Falta de Uniforme e Indisciplina Recurrente",
    "/compensaciones/atenciones": "Registro Nuevo y efectivización",
    "/compensaciones/calificaciones": "Atención Presencial Calificada",
    "/compensaciones/referidos": "Referido",
    "/compensaciones/llamadas": "Llamada / Contacto",
    "/compensaciones/otros-bonos/tiktok_live": "TIKTOK LIVE",
};
