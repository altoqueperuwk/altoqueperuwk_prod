import { afterEach, expect, it, vi } from "vitest";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaCreateValues } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: mocks }));
afterEach(() => vi.resetAllMocks());
it("edita título y descripción del mismo borrador sin cambiar autor, fecha ni tarifa", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 8, estado_evento: "BORRADOR" }, error: null });
    await evidenciasService.updateInnovationDraft(8, " Título ", " Descripción ");
    expect(mocks.rpc).toHaveBeenCalledWith("f_patch_tb_compensacion_evento", { p_id: 8, p_titulo: "Título", p_descripcion: "Descripción" });
});
it("envia evidencia, fecha, motivo y version a la RPC especifica", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 7 }, error: null });
    await evidenciasService.implementInnovation(7, "version", "2026-11-01", " prueba ", " motivo ");
    expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_innovacion_implementar", {
        p_id: 7,
        p_version: "version",
        p_fecha: "2026-11-01",
        p_evidencia: "prueba",
        p_motivo: "motivo",
    });
});
it("permisos y constancia se consideran confirmados solo por booleano explicito", async () => {
    mocks.rpc.mockResolvedValue({ data: { comprobada: "true", puede_revisar: "true", constancia: { evidencia: "falsa" } }, error: null });
    expect(await evidenciasService.getInnovationImplementation(7)).toMatchObject({ comprobada: false, puedeRevisar: false, constancia: null });
});
it("propaga errores de servidor sin confirmar implementacion", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Periodo cerrado" } });
    await expect(evidenciasService.implementInnovation(7, "v", "2026-11-01", "prueba", "motivo")).rejects.toMatchObject({ message: "Periodo cerrado" });
});
const proposal = { fechaEvento: "2026-11-02", titulo: " Propuesta ", descripcion: " Descripción ", idBeneficiario: 15 } as EvidenciaCreateValues;
it("registra y envía con una RPC propia que no admite beneficiario alternativo", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 7, estado_evento: "PENDIENTE" }, error: null });
    expect(await evidenciasService.registerInnovation(proposal, "stable-key", true)).toBe(7);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_atc_innovacion_registrar", {
        p_fecha: "2026-11-02",
        p_titulo: "Propuesta",
        p_descripcion: "Descripción",
        p_clave: "stable-key",
        p_enviar: true,
    });
});
it.each([null, { id: 7 }, { id: 7, estado_evento: "APROBADO" }])("no confirma el envío ante estado incompleto o distinto: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(evidenciasService.registerInnovation(proposal, "key", true)).rejects.toThrow();
});
