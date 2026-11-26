import { supabase } from "@/lib/supabase";

export type PagosDeteccionTipo = "REPORTE_ABANDONO" | "DETECCION_ERROR_MANUAL";
export interface PagosOperacion {
    id: number;
    dni: string;
    cliente: string;
    codigo: string;
    estado: string;
    monto: number;
    pagada: boolean;
}
export const pagosDeteccionesService = {
    async operaciones(dni: string, tipo: PagosDeteccionTipo): Promise<PagosOperacion[]> {
        const { data, error } = await supabase.rpc("f_get_compensacion_pagos_operaciones", { p_dni: dni, p_tipo: tipo });
        if (error) throw error;
        if (!Array.isArray(data?.items)) throw new Error("No se confirmó la búsqueda de operaciones");
        return data.items;
    },
    async guardar(tipo: PagosDeteccionTipo, operacion: number | null, datos: Record<string, string>, clave: string) {
        const { data, error } = await supabase.rpc("f_post_compensacion_pagos_deteccion", {
            p_tipo: tipo,
            p_id_operacion: operacion,
            p_datos: datos,
            p_evidencia: "",
            p_clave: clave,
        });
        if (error) throw error;
        if (!data?.id) throw new Error("No se confirmó el registro. Reintenta con los mismos datos.");
        return data;
    },
    async anular(id: number, motivo: string) {
        const { data, error } = await supabase.rpc("f_post_compensacion_pagos_deteccion_anular", { p_id: id, p_motivo: motivo });
        if (error) throw error;
        if (data?.estado_evento !== "ANULADO") throw new Error("No se confirmó la anulación del reporte.");
        return data;
    },
};
