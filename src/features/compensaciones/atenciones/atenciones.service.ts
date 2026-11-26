import { supabase } from "@/lib/supabase";

export interface OperacionAtencion {
    id: number;
    raiz: number;
    codigo: string;
    cliente: string;
    dni: string;
    servicio: string;
    monto: number;
    fecha: string;
}
export interface Atencion {
    id: number;
    asesor: string;
    estado: string;
    fecha_atencion: string;
    fecha_registro: string;
    contabiliza: boolean;
    motivo_liberacion: string | null;
    fecha_liberacion?: string;
    usuario_libera?: string;
    operacion_snapshot: OperacionAtencion;
}
export interface AtencionesResult {
    items: Atencion[];
    total: number;
    validas: number;
    liberadas: number;
}
const rpc = async <T>(name: string, params: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};
export const atencionesService = {
    context: () => rpc<{ es_admin: boolean; puede_registrar: boolean }>("f_get_compensacion_atencion_contexto"),
    search: (code: string, dni = "") =>
        rpc<OperacionAtencion[]>("f_get_compensacion_atencion_operaciones", { p_codigo: code.trim() || null, p_dni: dni.trim() || null }),
    register: (id: number, pancake: string) => rpc<Atencion>("f_post_compensacion_atencion_trazable", { p_id_operacion: id, p_pancake: pancake.trim() }),
    release: (id: number, reason: string) => rpc<Atencion>("f_patch_compensacion_atencion_liberar", { p_id: id, p_motivo: reason.trim() }),
    list: (month: string, page: number, size: number) =>
        rpc<AtencionesResult>("f_get_compensacion_atenciones", { p_mes: `${month}-01`, p_pagina: page, p_tamano: size }),
};
