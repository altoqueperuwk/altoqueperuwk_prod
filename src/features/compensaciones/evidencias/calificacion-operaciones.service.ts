import { supabase } from "@/lib/supabase";
import type { OperacionAtencion } from "../atenciones/atenciones.service";

export interface CalificacionOperacion extends OperacionAtencion {
    estado: string;
    paso: number | null;
    vinculada: boolean;
}
export interface CalificacionOperaciones {
    items: CalificacionOperacion[];
    dni: string;
    guardadas: boolean;
    puede_guardar: boolean;
    pancake: string | null;
}
export const calificacionOperacionesService = {
    async list(id: number): Promise<CalificacionOperaciones> {
        const { data, error } = await supabase.rpc("f_get_compensacion_calificacion_operaciones", { p_id_evento: id });
        if (error) throw error;
        if (!data || !Array.isArray(data.items) || typeof data.guardadas !== "boolean" || typeof data.puede_guardar !== "boolean") {
            throw new Error("No se confirmó la consulta de operaciones de la calificación");
        }
        return data as CalificacionOperaciones;
    },
    async save(id: number, ids: number[], pancake: string) {
        const { data, error } = await supabase.rpc("f_post_compensacion_calificacion_operaciones", {
            p_id_evento: id,
            p_ids: ids,
            p_pancake: pancake.trim() || null,
        });
        if (error) throw error;
        if (data?.guardadas !== true || Number(data.cantidad) !== new Set(ids).size) throw new Error("No se confirmó el vínculo de todas las operaciones");
    },
};
