/** Legacy grouped concept remains compatible; criterion is a separate server filter. */
export const dashboardConcepto = (value: string) => {
    const code = value.trim().toUpperCase();
    if (["COLABORADOR_MES_ATENCIONES", "COLABORADOR_MES_CALIFICACIONES"].includes(code)) return "BONO_COLABORADOR_MES";
    return code;
};

export const dashboardConceptoNotice = (value: string) => {
    const code = value.trim().toUpperCase();
    if (["COLABORADOR_MES_ATENCIONES", "COLABORADOR_MES_CALIFICACIONES"].includes(code))
        return "Atenciones y Calificaciones son premios independientes. Administración revisa y adjudica cada premio al finalizar el mes.";
    return "";
};

export const dashboardCriterio = (value: string): "" | "ATENCIONES" | "CALIFICACIONES" => {
    const code = value.trim().toUpperCase();
    if (code === "COLABORADOR_MES_ATENCIONES") return "ATENCIONES";
    if (code === "COLABORADOR_MES_CALIFICACIONES") return "CALIFICACIONES";
    return "";
};
