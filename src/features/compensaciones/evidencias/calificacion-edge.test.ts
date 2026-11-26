import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCalificacionHandler } from "../../../../supabase/functions/calificacion-publica/handler";

const origin = "https://pruebas.example.com";
const body = {
    action: "enviar",
    token: "a".repeat(64),
    clave: "11111111-1111-4111-8111-111111111111",
    estrellas: 5,
    dni: "01234567",
    comentario: "Excelente",
    captcha: "captcha-test",
};
const rpc = vi.fn();
const verify = vi.fn();
let config: Record<string, string>;
const request = (data: unknown = body, from = origin) =>
    new Request("https://api.example.com/calificacion-publica", {
        method: "POST",
        headers: { origin: from, "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
const handler = () => createCalificacionHandler({ env: (key) => config[key], database: () => ({ rpc }), fetch: verify });
beforeEach(() => {
    vi.clearAllMocks();
    config = {
        CALIFICACIONES_ALLOWED_ORIGINS: origin,
        SUPABASE_URL: "https://api.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "test-server-only",
        TURNSTILE_SECRET_KEY: "test-secret",
        TURNSTILE_ALLOWED_HOSTNAMES: "pruebas.example.com",
    };
    rpc.mockResolvedValue({ data: { recibido: true }, error: null });
    verify.mockResolvedValue(Response.json({ success: true, hostname: "pruebas.example.com", action: "calificacion" }));
});
describe("Edge pública: validación antes de SQL", () => {
    it("acepta preflight solo del origen configurado", async () => {
        expect((await handler()(new Request("https://api.example.com", { method: "OPTIONS", headers: { origin } }))).status).toBe(204);
        expect((await handler()(request(body, "https://ajeno.example.com"))).status).toBe(403);
        expect(rpc).not.toHaveBeenCalled();
    });
    it("permite consultar el contexto sin JWT, nunca responde credenciales", async () => {
        rpc.mockResolvedValue({ data: { asesor: "Asesor", sede: "Lince", politica: {} }, error: null });
        const result = await handler()(request({ action: "contexto", token: body.token }));
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({ asesor: "Asesor", sede: "Lince", politica: {} });
        expect(verify).not.toHaveBeenCalled();
    });
    it.each([{ estrellas: 6 }, { estrellas: 0 }, { estrellas: "5" }, { dni: "123" }, { comentario: "x".repeat(1001) }, { token: "15" }, { clave: "abc" }])(
        "rechaza datos inválidos %j",
        async (change) => {
            expect((await handler()(request({ ...body, ...change }))).status).toBe(400);
            expect(rpc).not.toHaveBeenCalled();
        },
    );
    it("no guarda si falta la configuración de CAPTCHA", async () => {
        delete config.TURNSTILE_SECRET_KEY;
        expect((await handler()(request())).status).toBe(503);
        expect(rpc).not.toHaveBeenCalled();
    });
    it.each([
        { success: false },
        { success: true, hostname: "ajeno.example.com", action: "calificacion" },
        { success: true, hostname: "pruebas.example.com", action: "otro" },
    ])("rechaza CAPTCHA incorrecto %j", async (data) => {
        verify.mockResolvedValue(Response.json(data));
        expect((await handler()(request())).status).toBe(400);
        expect(rpc).not.toHaveBeenCalled();
    });
    it("ignora beneficiario, estado, fecha e importe enviados por el cliente", async () => {
        const result = await handler()(request({ ...body, id_usuario: 20, id_colaborador: 99, estado: "APROBADO", importe: 2000 }));
        expect(result.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("f_post_compensacion_calificacion_publica", {
            p_token: body.token,
            p_clave: body.clave,
            p_estrellas: 5,
            p_dni: "01234567",
            p_comentario: "Excelente",
        });
    });
    it("no filtra el error SQL al navegador", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "password=private SQL detail" } });
        const result = await handler()(request());
        expect(result.status).toBe(400);
        expect(await result.text()).not.toContain("private SQL");
    });
    it("limita el tamaño real del cuerpo", async () => {
        expect((await handler()(request({ ...body, extra: "x".repeat(9000) }))).status).toBe(413);
        expect(rpc).not.toHaveBeenCalled();
    });
});
