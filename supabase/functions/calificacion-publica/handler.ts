export interface CalificacionDependencies {
    env: (key: string) => string | undefined;
    database: (url: string, key: string) => { rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown}> };
    fetch: typeof fetch;
}

// No sesión del cliente. Los RPC públicos de este flujo solo admiten service_role.
export const createCalificacionHandler = (deps: CalificacionDependencies) => async (req: Request) => {
    const origin = req.headers.get("origin") ?? "";
    const allowed = (deps.env("CALIFICACIONES_ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
        "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
        "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS" };
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!origin || !allowed.includes(origin)) return respond({ error: "Origen no permitido" }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return respond({ error: "Método no permitido" }, 405);
    try {
        // Acotar también cuerpos chunked, sin confiar en Content-Length.
        const reader = req.body?.getReader();
        if (!reader) return respond({ error: "Solicitud inválida" }, 400);
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > 8192) { await reader.cancel(); return respond({ error: "Solicitud demasiado extensa" }, 413); }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const body = JSON.parse(new TextDecoder().decode(bytes));
        if (!body || typeof body !== "object" || typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
            return respond({ error: "Enlace no disponible" }, 400);
        const url = deps.env("SUPABASE_URL"); const key = deps.env("SUPABASE_SERVICE_ROLE_KEY");
        if (!url || !key) return respond({ error: "Servicio no configurado" }, 503);
        const db = deps.database(url, key);
        if (body.action === "contexto") {
            const { data, error } = await db.rpc("f_get_compensacion_calificacion_publica", { p_token: body.token });
            return error ? respond({ error: "Enlace no disponible" }, 404) : respond(data);
        }
        if (body.action !== "enviar" || !Number.isInteger(body.estrellas) || body.estrellas < 1 || body.estrellas > 5
            || typeof body.clave !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.clave)
            || typeof body.dni !== "string" || !/^([0-9]{8})?$/.test(body.dni)
            || typeof body.comentario !== "string" || body.comentario.length > 1000)
            return respond({ error: "Revisa los datos de la calificación" }, 400);
        const secret = deps.env("TURNSTILE_SECRET_KEY");
        const hostnames = (deps.env("TURNSTILE_ALLOWED_HOSTNAMES") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        if (!secret || !hostnames.length) return respond({ error: "Verificación de seguridad no configurada" }, 503);
        if (typeof body.captcha !== "string" || body.captcha.length > 2048) return respond({ error: "Completa la verificación de seguridad" }, 400);
        const check = await deps.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST", body: new URLSearchParams({ secret, response: body.captcha }), signal: AbortSignal.timeout(10000),
        });
        if (!check.ok) return respond({ error: "Verificación temporalmente no disponible" }, 503);
        const verification = await check.json();
        if (!verification.success || verification.action !== "calificacion" || !hostnames.includes(verification.hostname))
            return respond({ error: "Verificación vencida. Intenta nuevamente" }, 400);
        const { data, error } = await db.rpc("f_post_compensacion_calificacion_publica", {
            p_token: body.token, p_clave: body.clave, p_estrellas: body.estrellas, p_dni: body.dni, p_comentario: body.comentario,
        });
        // No propagar errores SQL, IDs ni detalles de infraestructura al visitante.
        return error ? respond({ error: "No se pudo registrar. Revisa el enlace y los datos o intenta más tarde" }, 400) : respond(data);
    } catch {
        return respond({ error: "No se pudo procesar la solicitud. Intenta nuevamente" }, 400);
    }
};
