import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rpcWithLockRetry } from "./rpc-lock-retry";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

const locked = { data: null, error: { code: "55P03", message: "Caja ocupada" } };
const success = { data: { id: 1 }, error: null };

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("Reintento acotado de pagos", () => {
    it("espera antes de repetir y permite éxito en el cuarto intento", async () => {
        const execute = vi.fn().mockResolvedValueOnce(locked).mockResolvedValueOnce(locked).mockResolvedValueOnce(locked).mockResolvedValue(success);
        const pending = rpcWithLockRetry("f_patch_tb_pago_deuda_pagado", execute);
        await vi.advanceTimersByTimeAsync(749);
        expect(execute).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(execute).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1500);
        expect(execute).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(3000);
        expect(await pending).toBe(success);
        expect(execute).toHaveBeenCalledTimes(4);
    });

    it("devuelve el conflicto tras agotar exactamente tres reintentos", async () => {
        const execute = vi.fn().mockResolvedValue(locked);
        const pending = rpcWithLockRetry("f_patch_tb_operacion_proceso_pagado_lote", execute);
        await vi.runAllTimersAsync();
        expect(await pending).toBe(locked);
        expect(execute).toHaveBeenCalledTimes(4);
    });

    it.each(["57014", "40P01", "P0001", "", undefined])("no reintenta otros códigos: %s", async (code) => {
        const result = { data: null, error: { code, message: "Error" } };
        const execute = vi.fn().mockResolvedValue(result);
        expect(await rpcWithLockRetry("f_patch_tb_pago_deuda_pagado", execute)).toBe(result);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("no reintenta excepciones de red, incluso con código 55P03", async () => {
        const error = Object.assign(new Error("Conexión perdida"), { code: "55P03" });
        const execute = vi.fn().mockRejectedValue(error);
        await expect(rpcWithLockRetry("f_patch_tb_pago_deuda_pagado", execute)).rejects.toBe(error);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("no reintenta otras RPC ni errores dentro de JSON de respuesta", async () => {
        const execute = vi.fn().mockResolvedValue(locked);
        await rpcWithLockRetry("f_get_tb_ruta_operacion_kpi_operaciones_v2", execute);
        expect(execute).toHaveBeenCalledTimes(1);
        const businessError = vi.fn().mockResolvedValue({ data: { error: "55P03" }, error: null });
        await rpcWithLockRetry("f_patch_tb_pago_deuda_pagado", businessError);
        expect(businessError).toHaveBeenCalledTimes(1);
    });

    it("no repite un pago confirmado", async () => {
        const execute = vi.fn().mockResolvedValue(success);
        expect(await rpcWithLockRetry("f_patch_tb_operacion_proceso_pagado", execute)).toBe(success);
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("mantiene el error al agotar reintentos en pago de deuda", async () => {
        mocks.rpc.mockReset().mockResolvedValue(locked);
        const pending = expect(pagoDeudaService.patchPagado({ p_id_operacion: 1 })).rejects.toBe(locked.error);
        await vi.runAllTimersAsync();
        await pending;
        expect(mocks.rpc).toHaveBeenCalledTimes(4);
    });

    it("mantiene el error al agotar reintentos en efectivización", async () => {
        mocks.rpc.mockReset().mockResolvedValue(locked);
        const pending = expect(operacionesRpcService.patchOperacionPagado({ p_id_operacion: 1 })).rejects.toThrow("Caja ocupada");
        await vi.runAllTimersAsync();
        await pending;
        expect(mocks.rpc).toHaveBeenCalledTimes(4);
    });

    it.each([
        ["f_patch_tb_operacion_proceso_pagado", (params: Record<string, unknown>) => operacionesRpcService.patchOperacionPagado(params)],
        ["f_patch_tb_operacion_proceso_pagado_lote", (params: Record<string, unknown>) => operacionesRpcService.patchOperacionPagadoLote(params)],
        ["f_patch_tb_pago_deuda_pagado", (params: Record<string, unknown>) => pagoDeudaService.patchPagado(params)],
        ["f_patch_tb_pago_deuda_match", (params: Record<string, unknown>) => pagoDeudaService.patchMatch(params)],
        ["f_patch_tb_pago_deuda_salida", (params: Record<string, unknown>) => pagoDeudaService.patchSalida(params)],
    ] as const)("integra %s sin cambiar los parámetros", async (fn, call) => {
        mocks.rpc.mockReset().mockResolvedValueOnce(locked).mockResolvedValue(success);
        const params = { p_id_operacion: 1 };
        const pending = call(params);
        await vi.runAllTimersAsync();
        expect(await pending).toEqual(success.data);
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
        for (const args of mocks.rpc.mock.calls) expect(args).toEqual([fn, params]);
    });
});
