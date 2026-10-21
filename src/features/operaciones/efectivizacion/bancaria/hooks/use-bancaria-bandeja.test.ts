import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { useBancariaBandeja } from "./use-bancaria-bandeja";

vi.mock("@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service", () => ({
    operacionesRpcService: { getOperacionesBandejaUnificada: vi.fn() },
}));
vi.mock("@/features/operaciones/pago-deuda/components/pago-deuda-board", () => ({
    getPagoDeudaEstadoVisual: vi.fn(),
}));

const row = (id: number, id_estado: number, nombre_estado: string) => ({
    id, id_estado, nombre_estado, tipo_servicio: "POS", ruta_origen: "pos", ruta_destino: "bbva",
    id_empresa_salida: 7, id_empresa_cuenta_salida: 6, flag_derivado: false,
    fecha_registro: "2026-10-20T14:46:00Z",
}) as OperacionProceso;
const requested = row(23305, 7, "Solicitado");
const paid = row(23289, 4, "Pagado");
const request = vi.mocked(operacionesRpcService.getOperacionesBandejaUnificada);
beforeEach(() => { vi.clearAllMocks(); request.mockResolvedValue([requested, paid]); });

describe("bandeja unificada: POS solicitado visualmente pendiente", () => {
    const args = { activeAccountId: 6, activeCompanyId: 7, activeFilter: "Pendientes", dni: "", ruta: "bbva" as const, tab: "Unificado" as const };
    it("conserva el POS solicitado al filtrar Pendientes y después de actualizarlo", async () => {
        const { result } = renderHook(() => useBancariaBandeja(args));
        await waitFor(() => expect(result.current.operaciones.map(x => x.id)).toEqual([23305]));
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ p_ruta: "bbva", p_tab: "UNIFICADO", p_filtro_estado: "Pendiente" }));
        act(() => result.current.replaceOperacion({ ...requested, monto_deposito_cliente: 700 }));
        expect(result.current.operaciones.map(x => x.id)).toEqual([23305]);
        act(() => result.current.replaceOperacion({ ...requested, id_estado: 4, nombre_estado: "Pagado" }));
        expect(result.current.operaciones).toEqual([]);
    });
    it("mantiene Todos y Pagados sin mezclar estados", async () => {
        const { result, rerender } = renderHook(({ filter }) => useBancariaBandeja({ ...args, activeFilter: filter }), { initialProps: { filter: "Todos" } });
        await waitFor(() => expect(result.current.operaciones).toHaveLength(2));
        rerender({ filter: "Pagados" });
        await waitFor(() => expect(result.current.operaciones.map(x => x.id)).toEqual([23289]));
    });
});
