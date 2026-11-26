import { afterEach, expect, it, vi } from "vitest";
import { evidenciasService } from "./evidencias.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: mocks }));
afterEach(() => vi.resetAllMocks());
it("llamada envia prueba de contacto sin operacion ni pago", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 1 }, error: null });
    await evidenciasService.registerCall(" 12345678 ", " Cliente ", "key", undefined, null, " https://example.test/proof ");
    expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_llamada_trazable", {
        p_dni: "12345678",
        p_nombre: "Cliente",
        p_clave: "key",
        p_id_colaborador: null,
        p_celular: null,
        p_evidencia: "https://example.test/proof",
    });
});
it("tarjeta bloqueada admite evidencia sin codigo de operacion", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 2 }, error: null });
    await evidenciasService.registerCard("12345678", "Cliente", "2026-10-01", " Intento bloqueado ", "4321", "key", "https://example.test/proof", " ");
    expect(mocks.rpc).toHaveBeenCalledWith(
        "f_post_compensacion_tarjeta_trazable",
        expect.objectContaining({
            p_notas: "Intento bloqueado",
            p_codigo_operacion: null,
            p_evidencia: "https://example.test/proof",
            p_clave: "key",
            p_tarjeta_ultimos4: "4321",
        }),
    );
});
it.each([null, {}, { id: 0 }, { id: 2, error: "Sin confirmar" }])("no confirma altas con una respuesta incompleta: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(evidenciasService.registerCall("12345678", "Cliente", "key", undefined, null, "https://example.test/proof")).rejects.toThrow("No se confirmó");
    await expect(evidenciasService.registerCard("12345678", "Cliente", "2026-11-02", "", "4321", "key", "https://example.test/proof")).rejects.toThrow(
        "No se confirmó",
    );
});
it("una consulta sin contrato no se convierte en resumen con ceros", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(evidenciasService.getList({ category: "LLAMADA", page: 1, pageSize: 20 })).rejects.toThrow("No se confirmó la consulta");
});
