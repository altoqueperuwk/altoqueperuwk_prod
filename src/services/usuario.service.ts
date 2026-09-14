import { supabase } from "@/lib/supabase";

const invokeAdminUser = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-user", { body });
    if (error) {
        let message = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
            try {
                const response = (await context.clone().json()) as { error?: string };
                message = response.error || message;
            } catch {
                // La respuesta puede no ser JSON; se conserva el mensaje original.
            }
        }
        throw new Error(message);
    }
    return data as Record<string, unknown>;
};

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
        p_email: string;
        p_nombre: string;
        p_id_rol: number;
        p_id_estado: number;
        p_flag_super_admin?: boolean;
        p_id_sucursal?: number | null;
    }) {
        return invokeAdminUser({
            action: "create",
            username: params.p_username,
            email: params.p_email,
            nombre: params.p_nombre,
            id_rol: params.p_id_rol,
            id_estado: params.p_id_estado,
            id_sucursal: params.p_id_sucursal,
            flag_super_admin: params.p_flag_super_admin ?? false,
        });
    },

    async update(
        id: number,
        params: {
            p_username?: string;
            p_email?: string;
            p_nombre?: string;
            p_id_rol?: number;
            p_id_estado?: number;
            p_flag_super_admin?: boolean;
            p_id_sucursal?: number | null;
        },
    ) {
        return invokeAdminUser({
            action: "update",
            id,
            username: params.p_username,
            email: params.p_email,
            nombre: params.p_nombre,
            id_rol: params.p_id_rol,
            id_estado: params.p_id_estado,
            id_sucursal: params.p_id_sucursal,
            flag_super_admin: params.p_flag_super_admin,
        });
    },

    async getHistory(id: number) {
        const { data, error } = await supabase.rpc("f_get_tb_usuario_his", { p_id: id });
        if (error) throw error;
        return (data || []) as Record<string, unknown>[];
    },
};
