import { beforeEach, expect, it, vi } from "vitest";
import { tarjetaOperacionesService } from "./tarjeta-operaciones.service";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
beforeEach(() => rpc.mockReset());

it("consulta los últimos 7 días y normaliza las filas", async () => {
    rpc.mockResolvedValue({
        data: {
            items: [{ id: "5", flujo: "PAGO_DEUDA", codigo: null, referencia: "ID:5", monto: "250", comision: null, estado: "Pendiente", fecha: "2026-11-20" }],
        },
        error: null,
    });
    const rows = await tarjetaOperacionesService.deCliente("74206925");
    expect(rpc).toHaveBeenCalledWith("f_get_compensacion_atc_operaciones_cliente", { p_documento: "74206925", p_dias: 7 });
    expect(rows).toEqual([
        { id: 5, flujo: "PAGO_DEUDA", codigo: null, referencia: "ID:5", monto: 250, comision: null, estado: "Pendiente", fecha: "2026-11-20" },
    ]);
});

it("propaga el error y rechaza una respuesta sin items", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Sin permiso" } });
    await expect(tarjetaOperacionesService.deCliente("74206925")).rejects.toMatchObject({ message: "Sin permiso" });
    rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(tarjetaOperacionesService.deCliente("74206925")).rejects.toThrow("No se pudieron consultar");
});
