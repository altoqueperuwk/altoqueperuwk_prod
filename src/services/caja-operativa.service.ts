import { supabase } from "@/lib/supabase";

const rpc = async <T>(fn: string, params: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, params);

    if (error) throw error;
    if (data && !Array.isArray(data) && typeof data === "object" && "error" in data) {
        throw new Error(String((data as Record<string, unknown>).error));
    }

    return data as T;
};

export const cajaOperativaService = {
    getList(filters: Record<string, unknown> = {}) {
        return rpc<Record<string, unknown>[]>("f_get_tb_caja_operativa", filters);
    },

    create(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_post_tb_caja_operativa", params);
    },

    update(id: number, params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_patch_tb_caja_operativa", { p_id: id, ...params });
    },

    patchSaldoInicial(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_patch_tb_caja_operativa_saldo_inicial", params);
    },

    reconcileSaldoBancario(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_patch_tb_caja_operativa_reconciliar_saldo_bancario", params);
    },

    getRutas(filters: Record<string, unknown> = {}) {
        return rpc<Record<string, unknown>[]>("f_get_tb_ruta_operacion_caja", filters);
    },

    createRuta(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_post_tb_ruta_operacion_caja", params);
    },

    updateRuta(id: number, params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_patch_tb_ruta_operacion_caja", { p_id: id, ...params });
    },
};
