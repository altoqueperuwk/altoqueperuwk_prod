import { supabase } from "@/lib/supabase";

export const clienteService = {
  async getList(filters = {}) {
    const { data, error } = await supabase.rpc("f_get_tb_cliente", filters);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async getById(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_cliente", { p_id: id });
    if (error) throw error;
    return (data?.[0] || null) as Record<string, unknown> | null;
  },

  async create(params: Record<string, unknown>) {
    const { data, error } = await supabase.rpc("f_post_tb_cliente", params);
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async update(id: number, params: Record<string, unknown>) {
    const { data, error } = await supabase.rpc("f_patch_tb_cliente", { p_id: id, ...params });
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async getHistory(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_cliente_his", { p_id: id });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async getAtencionKpi(filters = {}) {
    const { data, error } = await supabase.rpc("f_get_tb_cliente_atencion_kpi", filters);
    if (error) throw error;
    return (data || {}) as Record<string, unknown>;
  },

  async bulkCreate(rows: Record<string, unknown>[], userId?: number) {
    const { data, error } = await supabase.rpc("f_post_tb_cliente_carga_masiva", {
      p_datos_clientes_json: rows,
      p_id_usuario: userId ?? null,
    });
    if (error) throw error;
    return (data || {}) as Record<string, unknown>;
  },
};
