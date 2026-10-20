import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { useBancariaEmpresaBadges } from "./use-bancaria-tab-badges";
import type { BancariaTab } from "./use-bancaria-bandeja";

vi.mock("@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service", () => ({
    operacionesRpcService: { getOperacionRetencionEmpresaBadges: vi.fn(), getOperacionEmpresaBadges: vi.fn() },
}));
const request = vi.mocked(operacionesRpcService.getOperacionRetencionEmpresaBadges);
const rows = [
    { tab: "Efectivizacion", id_empresa: 2, cantidad: 800 },
    { tab: "POS", id_empresa: 2, cantidad: 3 },
    { tab: "Pago Deuda", id_empresa: 5, cantidad: 25 },
];
beforeEach(() => { vi.clearAllMocks(); request.mockResolvedValue(rows); });

describe("company badges reuse", () => {
    it("filters tabs locally and still refreshes after mutations", async () => {
        const { result, rerender } = renderHook(
            ({ tab, refresh }) => useBancariaEmpresaBadges("bcp", tab, null, null, refresh),
            { initialProps: { tab: "Efectivizacion" as BancariaTab, refresh: 0 } },
        );
        await waitFor(() => expect(result.current.data).toEqual({ 2: 800 }));
        rerender({ tab: "Unificado", refresh: 0 });
        expect(result.current.data).toEqual({ 2: 803 });
        rerender({ tab: "Pago Deuda", refresh: 0 });
        expect(result.current.data).toEqual({ 5: 25 });
        expect(request).toHaveBeenCalledTimes(1);
        rerender({ tab: "Pago Deuda", refresh: 1 });
        await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    });

    it("uses the latest tab when a pending response arrives", async () => {
        let resolve!: (value: typeof rows) => void;
        request.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
        const { result, rerender } = renderHook(
            ({ tab }) => useBancariaEmpresaBadges("bcp", tab),
            { initialProps: { tab: "Efectivizacion" as BancariaTab } },
        );
        rerender({ tab: "Pago Deuda" });
        await act(async () => { resolve(rows); });
        expect(result.current.data).toEqual({ 5: 25 });
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("skips movements and reloads when returning or changing account", async () => {
        const { result, rerender } = renderHook(
            ({ tab, account }) => useBancariaEmpresaBadges("bcp", tab, account),
            { initialProps: { tab: "Movimientos" as BancariaTab, account: 1 } },
        );
        expect(request).not.toHaveBeenCalled();
        expect(result.current.data).toEqual({});
        rerender({ tab: "Efectivizacion", account: 1 });
        await waitFor(() => expect(result.current.data).toEqual({ 2: 800 }));
        rerender({ tab: "Efectivizacion", account: 4 });
        await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
        expect(request.mock.calls[1][0]).toMatchObject({ p_id_empresa_cuenta_bancaria: 4 });
    });
});
