import { supabase } from "@/lib/supabase";

export const estadoService = {
  async getList(filters = {}) {
    const { data, error } = await supabase.rpc("f_get_tb_estado", filters);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async getById(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_estado", { p_id: id });
    if (error) throw error;
    return (data?.[0] || null) as Record<string, unknown> | null;
  },

  async create(params: { p_nombre: string; p_id_usuario?: number }) {
    const { data, error } = await supabase.rpc("f_post_tb_estado", params);
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async update(id: number, params: { p_nombre?: string; p_id_usuario?: number }) {
    const { data, error } = await supabase.rpc("f_patch_tb_estado", { p_id: id, ...params });
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async getHistory(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_estado_his", { p_id: id });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },
};
