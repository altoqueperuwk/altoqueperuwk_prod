import { supabase } from "@/lib/supabase";

export interface BonoSeguimiento {
    estado: string;
    mensaje?: string;
    fuente?: string;
    atenciones_validas?: number;
    meta?: { objetivo: number | null; acumulado: number; operaciones: number; porcentaje: number | null; heredada: boolean; periodo_origen: string | null };
    importe_provisional?: number | null;
    pendientes?: Array<{ codigo: string; mensaje: string }>;
}
export interface BonoMesCandidato {
    id_colaborador: number;
    nombre: string;
    documento: string;
    sede: string;
    atenciones: number;
    calificaciones_4_5: number;
    minutos_tarde: number;
    estado_puntualidad: string;
    motivo_elegibilidad?: string;
    importe_referencia: number | null;
    elegible: boolean;
    puesto: number | null;
    es_preseleccionado: boolean;
    requiere_desempate: boolean;
}
export interface SeleccionBonoMes {
    periodo: string;
    codigo: string;
    estado: "SIN_CANDIDATOS" | "ASISTENCIA_PENDIENTE" | "DESEMPATE_ADMINISTRATIVO" | "PRESELECCION_VALIDABLE";
    criterio_principal: string;
    desempate: string;
    elegibilidad: string;
    importe_referencia: number | null;
    candidatos: BonoMesCandidato[];
}
export const getBonoSeguimiento = async (code: string, month: string): Promise<BonoSeguimiento> => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Selecciona un mes válido");
    const { data, error } = await supabase.rpc("f_get_compensacion_atc_bono_seguimiento", { p_codigo: code, p_mes: `${month}-01` });
    if (error) throw error;
    if (!data || typeof data !== "object" || !data.estado) throw new Error("Respuesta de seguimiento no disponible");
    return data as BonoSeguimiento;
};

export const getSeleccionBonoMes = async (code: string, month: string): Promise<SeleccionBonoMes> => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Selecciona un mes válido");
    const { data, error } = await supabase.rpc("f_get_compensacion_colaborador_mes_admin", {
        p_mes: `${month}-01`,
        p_codigo: code,
    });
    if (error) throw error;
    if (!data || typeof data !== "object" || !data.estado || !Array.isArray(data.candidatos)) {
        throw new Error("Respuesta de selección mensual no disponible");
    }
    return data as SeleccionBonoMes;
};

export const validarSeleccionBonoMes = async (code: string, month: string, collaboratorId: number, justification: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Selecciona un mes válido");
    if (!Number.isSafeInteger(collaboratorId) || collaboratorId <= 0) throw new Error("Colaborador inválido");
    const { data, error } = await supabase.rpc("f_post_compensacion_colaborador_mes_validar", {
        p_mes: `${month}-01`,
        p_codigo: code,
        p_id_colaborador: collaboratorId,
        p_justificacion: justification.trim() || null,
    });
    if (error) throw error;
    if (!data || typeof data !== "object" || !data.id_evento) throw new Error("No se confirmó la validación del bono");
    return data as { id_evento: number; estado: string; importe: number; idempotente: boolean };
};
