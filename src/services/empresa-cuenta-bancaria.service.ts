import { supabase } from "@/lib/supabase";

export const empresaCuentaBancariaService = {
  async getList(filters = {}) {
    const { data, error } = await supabase.rpc("f_get_tb_empresa_cuenta_bancaria", filters);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async getById(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_empresa_cuenta_bancaria", { p_id: id });
    if (error) throw error;
    return (data?.[0] || null) as Record<string, unknown> | null;
  },

  async create(params: Record<string, unknown>) {
    const { data, error } = await supabase.rpc("f_post_tb_empresa_cuenta_bancaria", params);
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async update(id: number, params: Record<string, unknown>) {
    const { data, error } = await supabase.rpc("f_patch_tb_empresa_cuenta_bancaria", { p_id: id, ...params });
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async getHistory(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_empresa_cuenta_bancaria_his", { p_id: id });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },
};
