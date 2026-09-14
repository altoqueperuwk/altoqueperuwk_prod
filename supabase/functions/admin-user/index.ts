import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

const requiredNumber = (value: unknown, field: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} es obligatorio`);
    return parsed;
};

const requiredText = (value: unknown, field: string) => {
    const parsed = String(value ?? "").trim();
    if (!parsed) throw new Error(`${field} es obligatorio`);
    return parsed;
};

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error && "message" in error) return String(error.message);
    return "No se pudo procesar el usuario";
};

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Metodo no permitido" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = Deno.env.get("APP_URL");
    const authorization = request.headers.get("Authorization");

    if (!supabaseUrl || !serviceRoleKey || !appUrl) {
        return json({ error: "La funcion no tiene configuradas sus variables de entorno" }, 500);
    }
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesion requerida" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
        const token = authorization.slice("Bearer ".length);
        const { data: authData, error: authError } = await admin.auth.getUser(token);
        if (authError || !authData.user?.email) throw new Error("La sesion no es valida");

        const caller = authData.user;
        let { data: callerProfiles, error: callerError } = await admin
            .from("tb_usuario")
            .select("id,id_rol,id_estado,id_sucursal,flag_super_admin,email,auth_user_id")
            .eq("auth_user_id", caller.id)
            .limit(1);
        if (!callerError && !callerProfiles?.length) {
            const fallback = await admin
                .from("tb_usuario")
                .select("id,id_rol,id_estado,id_sucursal,flag_super_admin,email,auth_user_id")
                .is("auth_user_id", null)
                .ilike("email", caller.email)
                .limit(1);
            callerProfiles = fallback.data;
            callerError = fallback.error;
        }
        if (callerError || !callerProfiles?.length) throw new Error("No existe un perfil operativo para el usuario autenticado");

        const creator = callerProfiles[0];
        const isAdmin = creator.flag_super_admin === true || Number(creator.id_rol) === 1;
        if (!isAdmin) {
            const { data: navigation, error: navigationError } = await admin.rpc("f_get_tb_navegacion_x_usuario", {
                p_id_usuario: creator.id,
            });
            const routes = Array.isArray(navigation?.rutas_permitidas) ? navigation.rutas_permitidas : [];
            if (navigationError || !routes.includes("/sistema/usuario")) {
                throw new Error("No tiene permiso para gestionar usuarios");
            }
        }

        const body = await request.json();
        const action = String(body.action ?? "create");
        const username = requiredText(body.username, "El username");
        const email = requiredText(body.email, "El email").toLowerCase();
        const nombre = requiredText(body.nombre, "El nombre");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El email no tiene un formato valido");

        const idRol = requiredNumber(body.id_rol, "El rol");
        const idEstado = requiredNumber(body.id_estado, "El estado");
        const idSucursal = requiredNumber(body.id_sucursal, "La sucursal");
        const flagSuperAdmin = isAdmin && body.flag_super_admin === true;
        const isStoreManager = !isAdmin && Number(creator.id_rol) === 3;

        if (!isAdmin && (![2, 3, 4].includes(idRol) || body.flag_super_admin === true)) {
            throw new Error("Solo puede gestionar Area de Pagos, Jefe de Tienda o Atencion al Cliente");
        }
        if (isStoreManager && (idRol !== 4 || idSucursal !== Number(creator.id_sucursal))) {
            throw new Error("El Jefe de Tienda solo puede gestionar usuarios de Atencion al Cliente de su propia sucursal");
        }

        const [{ data: role }, { data: state }, { data: branch }] = await Promise.all([
            admin.from("tb_rol").select("id,id_estado").eq("id", idRol).eq("id_estado", 1).maybeSingle(),
            admin.from("tb_estado").select("id").eq("id", idEstado).maybeSingle(),
            admin.from("tb_sucursal").select("id,id_estado").eq("id", idSucursal).eq("id_estado", 1).maybeSingle(),
        ]);
        if (!role) throw new Error("El rol seleccionado no existe o esta inactivo");
        if (!state) throw new Error("El estado seleccionado no existe");
        if (!branch) throw new Error("La sucursal seleccionada no existe o esta inactiva");

        if (action === "create") {
            const [{ data: duplicateEmail }, { data: duplicateUsername }] = await Promise.all([
                admin.from("tb_usuario").select("id").ilike("email", email).limit(1),
                admin.from("tb_usuario").select("id").ilike("username", username).limit(1),
            ]);
            if (duplicateEmail?.length || duplicateUsername?.length) {
                throw new Error("El email o username ya se encuentra registrado");
            }

            const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/accept-invite`;
            const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
                redirectTo,
                data: { username, nombre },
            });
            if (inviteError || !invited.user) throw new Error(inviteError?.message ?? "No se pudo enviar la invitacion");

            const { data: profile, error: profileError } = await admin.rpc("f_post_tb_usuario_auth", {
                p_auth_user_id_creador: caller.id,
                p_email_creador: caller.email,
                p_auth_user_id: invited.user.id,
                p_username: username,
                p_email: email,
                p_nombre: nombre,
                p_id_rol: idRol,
                p_id_estado: idEstado,
                p_id_sucursal: idSucursal,
                p_flag_super_admin: flagSuperAdmin,
            });
            if (profileError) {
                await admin.auth.admin.deleteUser(invited.user.id);
                throw new Error(profileError.message);
            }

            return json({ ...profile, invitacion_enviada: true });
        }

        if (action !== "update") throw new Error("Accion no soportada");
        const id = requiredNumber(body.id, "El usuario");
        const { data: current, error: currentError } = await admin
            .from("tb_usuario")
            .select("id,email,auth_user_id,id_rol,id_sucursal,flag_super_admin")
            .eq("id", id)
            .maybeSingle();
        if (currentError || !current) throw new Error("El usuario a actualizar no existe");
        if (!isAdmin && (current.flag_super_admin === true || ![2, 3, 4].includes(Number(current.id_rol)))) {
            throw new Error("No puede administrar usuarios con privilegios elevados");
        }
        if (isStoreManager && (Number(current.id_rol) !== 4 || Number(current.id_sucursal) !== Number(creator.id_sucursal))) {
            throw new Error("Solo puede editar usuarios de Atencion al Cliente de su propia sucursal");
        }

        let authEmailUpdated = false;
        if (email !== String(current.email).toLowerCase()) {
            if (!current.auth_user_id) throw new Error("El usuario antiguo debe vincularse con Supabase Auth antes de cambiar su email");
            const { error: updateAuthError } = await admin.auth.admin.updateUserById(current.auth_user_id, { email });
            if (updateAuthError) throw new Error(updateAuthError.message);
            authEmailUpdated = true;
        }

        const { data: profile, error: profileError } = await admin.rpc("f_patch_tb_usuario_auth", {
            p_auth_user_id_creador: caller.id,
            p_email_creador: caller.email,
            p_id: id,
            p_username: username,
            p_email: email,
            p_nombre: nombre,
            p_id_rol: idRol,
            p_id_estado: idEstado,
            p_id_sucursal: idSucursal,
            p_flag_super_admin: flagSuperAdmin,
        });
        if (profileError) {
            if (authEmailUpdated && current.auth_user_id) {
                await admin.auth.admin.updateUserById(current.auth_user_id, { email: current.email });
            }
            throw new Error(profileError.message);
        }

        return json(profile);
    } catch (error) {
        const message = getErrorMessage(error);
        const status = message.includes("sesion") ? 401 : message.includes("permiso") || message.includes("privilegios") ? 403 : 400;
        return json({ error: message }, status);
    }
});
