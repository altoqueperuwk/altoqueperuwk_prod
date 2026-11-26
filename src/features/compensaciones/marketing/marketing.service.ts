import { supabase } from "@/lib/supabase";

export type MarketingTipo = "VIDEO_VIRAL" | "RECUPERACION_CLIENTE" | "ALERTA_TEMPRANA";
export interface MarketingCaso extends Record<string, unknown> {
    id: number;
    fecha: string;
    titulo: string;
    descripcion: string;
    estado: string;
    importe: number | null;
    estado_calculo: string;
    motivo_calculo: string;
    aviso_fecha?: string | null;
    captura: Record<string, string>;
    evidencia: string | null;
    usuario: string;
    responsable: string | null;
    puede_editar: boolean;
    puede_revisar: boolean;
    puede_anular: boolean;
    validacion?: string | null;
    operacion?: string | null;
    dias_inactivo?: number | null;
    resultado: string | null;
}
export interface MarketingAlertaPorValidar {
    id: number;
    fecha: string;
    titulo: string;
    descripcion: string;
    estado: string;
    beneficiario: string;
    responsable: string;
    motivo: string;
    conversacion: string;
    operacion: string | null;
    evidencia: string | null;
    decision: "APROBADO" | "RECHAZADO" | null;
}
export interface MarketingPanel {
    es_admin: boolean;
    puede_registrar?: boolean;
    es_revisor?: boolean;
    id_colaborador: number;
    total: number;
    total_paginas: number;
    items: MarketingCaso[];
    responsables: { id: number; nombre: string; sede: string }[];
    kpis: { pendientes: number; aprobados: number; rechazados: number };
}
export interface MarketingOperacion {
    id: number;
    dni: string;
    cliente: string;
    codigo: string;
    servicio: string;
    monto: number;
    fecha_pago: string;
    estado: string;
    dias_inactivo?: number | null;
    recuperable?: boolean;
}
const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    if (!data) throw new Error("No se confirmó la solicitud de Marketing");
    return data as T;
};
export const marketingService = {
    list: (type: MarketingTipo, month: string, search: string, state: string, page: number, size: number) =>
        rpc<MarketingPanel>("f_get_compensacion_marketing", {
            p_tipo: type,
            p_mes: month + "-01",
            p_buscar: search.trim(),
            p_estado: state,
            p_pagina: page,
            p_tamano: size,
        }),
    save: (type: MarketingTipo, values: Record<string, string>, key: string, send: boolean, id: number | null) =>
        rpc<{ id: number; estado: string }>("f_post_compensacion_marketing_captura", {
            p_tipo: type,
            p_valores: values,
            p_clave: key,
            p_enviar: send,
            p_id: id,
        }),
    operations: (dni: string) => rpc<{ items: MarketingOperacion[] }>("f_get_compensacion_marketing_operaciones", { p_dni: dni }),
    remove: (id: number) => rpc<{ id: number }>("f_post_compensacion_marketing_captura_eliminar", { p_id: id }),
    alertsToValidate: () => rpc<{ items: MarketingAlertaPorValidar[] }>("f_get_compensacion_marketing_alertas_validacion", {}),
    validateAlert: (id: number, decision: "APROBADO" | "RECHAZADO", comment: string) =>
        rpc("f_post_compensacion_marketing_alerta_validar", { p_id: id, p_decision: decision, p_comentario: comment.trim() }),
    review: (id: number, decision: string, reason: string) =>
        rpc("f_post_compensacion_marketing_revision", { p_id: id, p_decision: decision, p_motivo: reason.trim() }),
};
