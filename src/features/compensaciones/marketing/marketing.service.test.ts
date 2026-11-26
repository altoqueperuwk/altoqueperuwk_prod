import { beforeEach, expect, it, vi } from "vitest";
import { marketingService } from "./marketing.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ data: { id: 1 }, error: null });
});
it("envía filtros y paginación al servidor sin leer tablas globales", async () => {
    await marketingService.list("VIDEO_VIRAL", "2026-11", " prueba ", "PENDIENTE", 2, 50);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_marketing", {
        p_tipo: "VIDEO_VIRAL",
        p_mes: "2026-11-01",
        p_buscar: "prueba",
        p_estado: "PENDIENTE",
        p_pagina: 2,
        p_tamano: 50,
    });
});
it.each([
    { data: null, error: null },
    { data: null, error: new Error("Sin conexión") },
])("no confirma registros con respuesta incierta", async (result) => {
    mocks.rpc.mockResolvedValue(result);
    await expect(marketingService.save("ALERTA_TEMPRANA", {}, "key", true, null)).rejects.toThrow();
});
it.each(["APROBADO", "RECHAZADO", "ANULADO"])("la revisión %s usa la RPC de Marketing sin importe ni unidades", async (decision) => {
    await marketingService.review(2, decision, " evidencia verificada ");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("f_post_compensacion_marketing_revision", {
        p_id: 2,
        p_decision: decision,
        p_motivo: "evidencia verificada",
    });
});
