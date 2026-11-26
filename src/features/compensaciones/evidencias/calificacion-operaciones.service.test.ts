import { beforeEach, expect, it, vi } from "vitest";
import { calificacionOperacionesService as service } from "./calificacion-operaciones.service";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

beforeEach(() => vi.clearAllMocks());
it.each([null, {}, { items: [], guardadas: false }])("rechaza respuestas incompletas de consulta: %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(service.list(20)).rejects.toThrow("No se confirmó la consulta");
});
it.each([null, {}, { guardadas: true, cantidad: 1 }, { guardadas: false, cantidad: 2 }])("no confirma un vínculo incompleto: %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(service.save(20, [1, 2], "")).rejects.toThrow("No se confirmó el vínculo");
});
it("envía selección sin conversación opcional y exige confirmación de todos los IDs", async () => {
    rpc.mockResolvedValue({ data: { guardadas: true, cantidad: 2 }, error: null });
    await service.save(20, [1, 2], "");
    expect(rpc).toHaveBeenCalledWith("f_post_compensacion_calificacion_operaciones", { p_id_evento: 20, p_ids: [1, 2], p_pancake: null });
});
