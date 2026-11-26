import { supabase } from "@/lib/supabase";

export const permisoUsuarioService = {
  async getList(filters = {}) {
    const { data, error } = await supabase.rpc("f_get_tb_permiso_usuario", filters);
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async getById(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_permiso_usuario", { p_id: id });
    if (error) throw error;
    return (data?.[0] || null) as Record<string, unknown> | null;
  },

  async create(params: {
    p_id_usuario: number;
    p_id_permiso_menu: number;
    p_id_estado?: number;
    p_id_usuario_registra?: number;
  }) {
    const { data, error } = await supabase.rpc("f_post_tb_permiso_usuario", params);
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async update(id: number, params: {
    p_id_usuario?: number;
    p_id_permiso_menu?: number;
    p_id_estado?: number;
    p_id_usuario_registra?: number;
  }) {
    const { data, error } = await supabase.rpc("f_patch_tb_permiso_usuario", { p_id: id, ...params });
    if (error) throw error;
    return data as Record<string, unknown>;
  },

  async getHistory(id: number) {
    const { data, error } = await supabase.rpc("f_get_tb_permiso_usuario_his", { p_id: id });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  },

  async assignLote(idUsuario: number, idsPermisoMenu: number[], idUsuarioRegistra?: number) {
    const { data, error } = await supabase.rpc("f_put_tb_permiso_usuario_lote", {
      p_id_usuario: idUsuario,
      p_ids_permiso_menu: idsPermisoMenu,
      p_id_usuario_registra: idUsuarioRegistra,
    });
    if (error) throw error;
    window.dispatchEvent(new CustomEvent("permisos-usuario-actualizados", { detail: { idUsuario } }));
    return data as Record<string, unknown>;
  },
};
