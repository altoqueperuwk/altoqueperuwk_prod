import { afterEach, expect, it, vi } from "vitest";
import { atencionesService } from "./atenciones.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: mocks }));

afterEach(() => vi.resetAllMocks());
it.each([
    ["00555701", "", { p_codigo: "00555701", p_dni: null }],
    ["", "75530746", { p_codigo: null, p_dni: "75530746" }],
    [" 00555701 ", "75530746", { p_codigo: "00555701", p_dni: "75530746" }],
])("usa la firma nueva con dos filtros y conserva ceros iniciales", async (code, dni, params) => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await atencionesService.search(code as string, dni as string);
    expect(mocks.rpc).toHaveBeenCalledWith("f_get_compensacion_atencion_operaciones", params);
});
