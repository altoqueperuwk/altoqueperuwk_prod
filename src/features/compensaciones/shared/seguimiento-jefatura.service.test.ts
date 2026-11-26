import { beforeEach, expect, it, vi } from "vitest";
import { expedienteIdFromKey, seguimientoJefaturaService } from "./seguimiento-jefatura.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: { id: 9 }, error: null });
});
it("consulta propia sin permitir suplantar identidad ni sede", async () => {
    await seguimientoJefaturaService.expediente(9);
    expect(mocks.rpc).toHaveBeenCalledWith("f_get_compensacion_expediente", { p_id: 9 });
});
it("no oculta un rechazo de concurrencia del servidor", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "La correccion cambio" }, data: null });
    await expect(
        seguimientoJefaturaService.corregir(9, {
            estado: "CORREGIDO",
            fecha: "2026-11-12T15:00:00Z",
            antes: true,
            corrige: 15,
            nota: "Monto corregido",
            version: 2,
        }),
    ).rejects.toThrow("La correccion cambio");
});
it("rechaza respuesta vacia en vez de mostrar un expediente inexistente", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(seguimientoJefaturaService.expediente(9)).rejects.toThrow("El servidor");
});
it("abre solo claves de eventos y nunca interpreta clientes u operaciones como penalidades", () => {
    expect(expedienteIdFromKey("EVENTO_PENDIENTE:97")).toBe(97);
    expect(expedienteIdFromKey("EVENTO:98")).toBe(98);
    for (const key of ["CLIENTE_PENDIENTE:97", "OPERACION:97", "97", "EVENTO:0", "EVENTO:9007199254740992", null]) expect(expedienteIdFromKey(key)).toBeNull();
});
