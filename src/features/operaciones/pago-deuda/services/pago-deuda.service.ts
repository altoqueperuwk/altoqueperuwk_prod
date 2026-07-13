import { supabase } from "@/lib/supabase";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

const rpc = async <T>(fn: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, params);

    if (error) throw error;
    if (data && !Array.isArray(data) && typeof data === "object" && "error" in data) {
        throw new Error(String((data as Record<string, unknown>).error));
    }

    return data as T;
};

export const pagoDeudaService = {
    getSolicitudes(params: Record<string, unknown>) {
        return rpc<OperacionProceso[]>("f_get_tb_pago_deuda", params);
    },

    getMatches(params: Record<string, unknown>) {
        return rpc<OperacionProceso[]>("f_get_tb_pago_deuda_match", params);
    },

    postSolicitud(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_post_tb_pago_deuda_solicitud", params);
    },

    patchSalida(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_pago_deuda_salida", params);
    },

    patchMatch(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_pago_deuda_match", params);
    },

    patchPagado(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_pago_deuda_pagado", params);
    },
};
