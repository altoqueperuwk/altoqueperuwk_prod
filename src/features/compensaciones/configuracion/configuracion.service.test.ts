import { beforeEach, describe, expect, it, vi } from "vitest";
import { configuracionService } from "./configuracion.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
beforeEach(() => vi.clearAllMocks());
describe("Guardado operativo", () => {
    it("prepara edición sin parámetros de versiones ni publicación", async () => {
        mocks.rpc.mockResolvedValue({ data: { id_configuracion: 5, creada: true }, error: null });
        expect(await configuracionService.prepareConfiguration()).toEqual({ id_configuracion: 5, creada: true });
        expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_configuracion_preparar", {});
    });
    it("envía el lote completo mediante una sola RPC", async () => {
        mocks.rpc.mockResolvedValue({ data: { parametros_guardados: 2 }, error: null });
        const changes = [
            { tipo: "REGLA" as const, id: 1, anterior: "0.2", valor: "0.3" },
            { tipo: "PENALIDAD" as const, id: 2, anterior: "100", valor: "200" },
        ];
        expect(await configuracionService.saveParameters(1, changes)).toEqual({ parametros_guardados: 2 });
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_configuracion_guardar", { p_id_plan_version: 1, p_cambios: changes });
    });
    it("propaga errores del backend sin simular éxito", async () => {
        const error = { message: "Configuración no editable", code: "P0001" };
        mocks.rpc.mockResolvedValue({ data: null, error });
        await expect(configuracionService.saveParameters(1, [])).rejects.toEqual(error);
    });
});
