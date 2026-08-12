import { supabase } from "@/lib/supabase";

export const usuarioService = {
  async getList(filters = {}) {
    const { data, error } = await supabase.rpc("f_get_tb_usuario", filters);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async getById(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_usuario", { p_id: id });
    if (error) throw error;
    return (data?.[0] || null) as Record<string, unknown> | null;
  },

  async create(params: {
    p_username: string;
    p_password: string;
    p_email: string;
    p_nombre: string;
    p_id_rol: number;
    p_id_estado: number;
    p_flag_super_admin?: boolean;
    p_id_sucursal?: number | null;
  }) {
    const { data, error } = await supabase.rpc("f_post_tb_usuario", params);
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async update(id: number, params: {
    p_username?: string;
    p_password?: string;
    p_email?: string;
    p_nombre?: string;
    p_id_rol?: number;
    p_id_estado?: number;
    p_flag_super_admin?: boolean;
    p_id_sucursal?: number | null;
  }) {
    const { data, error } = await supabase.rpc("f_patch_tb_usuario", { p_id: id, ...params });
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async getHistory(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_usuario_his", { p_id: id });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },
};
