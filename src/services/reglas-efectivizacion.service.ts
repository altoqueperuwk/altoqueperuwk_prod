import { supabase } from "@/lib/supabase";

const assertRpcSuccess = (data: unknown) => {
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
};

export const reglasEfectivizacionService = {
  async getList(filters = {}) {
    const { data, error } = await supabase.rpc("f_get_tb_reglas_efectivizacion", filters);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async getById(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_reglas_efectivizacion", { p_id: id });
    if (error) throw error;
    return (data?.[0] || null) as Record<string, unknown> | null;
  },

  async create(params: Record<string, unknown>) {
    const { data, error } = await supabase.rpc("f_post_tb_reglas_efectivizacion", params);
    if (error) throw error;
    assertRpcSuccess(data);
    return data as Record<string, unknown>;
  },

  async update(id: number, params: Record<string, unknown>) {
    const { data, error } = await supabase.rpc("f_patch_tb_reglas_efectivizacion", { p_id: id, ...params });
    if (error) throw error;
    assertRpcSuccess(data);
    return data as Record<string, unknown>;
  },

  async getHistory(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_reglas_efectivizacion_his", { p_id: id });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },
};
