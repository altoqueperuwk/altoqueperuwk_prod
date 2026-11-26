import { beforeEach, expect, it, vi } from "vitest";
import { tiktokClientesService } from "./tiktok-clientes.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { uploadTiktokEvidence: mocks.upload, removeTiktokEvidence: mocks.remove } }));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.upload.mockResolvedValue({ path: "user/evidence.png", tipo: "IMAGEN_TIKTOK" });
});
it("envía el alta LIVE una sola vez con evidencia, sin invocar otra alta General", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 1, fecha_registro: "2026-11-01T15:00:00Z" }, error: null });
    await tiktokClientesService.register("12345678", " Cliente ", 1, "", 1, new File(["x"], "evidence.png"));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("f_post_compensacion_tiktok_cliente", {
        p_documento: "12345678",
        p_nombre: "Cliente",
        p_tipo_documento: 1,
        p_celular: null,
        p_id_comunidad: 1,
        p_evidencia: { path: "user/evidence.png", tipo: "IMAGEN_TIKTOK" },
    });
});
it.each([
    { data: null, error: new Error("Respuesta perdida") },
    { data: null, error: null },
])("conserva evidencia si el resultado de alta es incierto: %j", async (response) => {
    mocks.rpc.mockResolvedValue(response);
    await expect(tiktokClientesService.register("12345678", "Cliente", 1, "", 1, new File(["x"], "evidence.png"))).rejects.toThrow();
    expect(mocks.remove).not.toHaveBeenCalled();
});
it("mantiene filtros y paginación de la RPC LIVE existente", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
    await tiktokClientesService.list("2026-11", 2, 50, { documento: "Cliente", desde: "2026-11-01", hasta: "2026-11-30", estado: "BLOQUEADO" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_tiktok_clientes", {
        p_mes: "2026-11-01",
        p_pagina: 2,
        p_tamano: 50,
        p_documento: "Cliente",
        p_tipo_documento: null,
        p_estado: "BLOQUEADO",
        p_desde: "2026-11-01",
        p_hasta: "2026-11-30",
        p_nombre_cliente: "",
        p_colaborador: "",
    });
});

it("reconoce EN_REVISION y metadatos de datos parciales también en LIVE", async () => {
    mocks.rpc.mockResolvedValue({
        data: { items: [{ id: 1, estado: "EN_REVISION", ganancia: null }], total: 1, en_revision: 1, asOf: "2026-11-01T16:00:00Z", dataState: "partial" },
        error: null,
    });
    expect(await tiktokClientesService.list("2026-11", 1, 20)).toMatchObject({
        dataState: "partial",
        en_revision: 1,
        asOf: "2026-11-01T16:00:00Z",
        items: [{ estado: "EN_REVISION", ganancia: null }],
    });
});
