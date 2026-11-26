import { afterEach, expect, it, vi } from "vitest";
import { adminRevisionService } from "../administracion/admin-revision.service";
import { evidenciasService } from "./evidencias.service";
import { tarjetasEvidenceService } from "./tarjetas-evidence.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(), getUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, auth: { getUser: mocks.getUser }, storage: { from: mocks.from } } }));

afterEach(() => vi.resetAllMocks());
it.each(["APROBADO", "RECHAZADO"] as const)("envía %s sin inventar nota ni monto", async (decision) => {
    mocks.rpc.mockResolvedValue({ data: { id: 7 }, error: null });
    await evidenciasService.resolve(7, decision, "", null, 1);
    expect(mocks.rpc).toHaveBeenCalledWith("f_post_tb_compensacion_evento_resolver", {
        p_id: 7,
        p_decision: decision,
        p_comentario: null,
        p_base_calculo: null,
        p_cantidad: 1,
    });
    await adminRevisionService.resolve({ id: 7, version: "source-version", action: decision, reason: "" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("f_post_compensacion_administracion_revision", {
        p_id: 7,
        p_version: "source-version",
        p_accion: decision,
        p_motivo: "",
        p_base: null,
        p_cantidad: null,
        p_chats_revisados: false,
    });
});
it("propaga conflictos sin confirmar éxito", async () => {
    const error = new Error("El expediente o su operacion cambiaron");
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(adminRevisionService.resolve({ id: 7, version: "old", action: "RECHAZADO", reason: "" })).rejects.toBe(error);
});
it.each([
    new File(["x"], "proof.pdf", { type: "application/pdf" }),
    new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(5242881)], "large.png", { type: "image/png" }),
])("rechaza archivo inválido antes de cargar: $name", async (file) => {
    await expect(tarjetasEvidenceService.uploadCardEvidence(file)).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
});
it("carga bytes en bucket privado y guarda metadatos, sin URL pública", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    mocks.from.mockReturnValue(mocks);
    mocks.upload.mockResolvedValue({ error: null });
    const file = new File(["image-bytes"], "proof.png", { type: "image/png" });
    const evidence = await tarjetasEvidenceService.uploadCardEvidence(file);
    expect(evidence).toMatchObject({ tipo: "IMAGEN_TARJETA", bucket: "compensaciones-tarjetas-erroneas", mime_type: "image/png", size: file.size });
    expect(evidence.path).toMatch(/^owner\/.+\.png$/);
    expect(mocks.upload).toHaveBeenCalledWith(evidence.path, file, { contentType: "image/png", upsert: false });
    mocks.rpc.mockResolvedValue({ data: { id: 12 }, error: null });
    await evidenciasService.registerCardFile(" 12345678 ", " Persona ", "2026-11-06", "", "4321", "key", evidence);
    expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_tarjeta_archivo_trazable", {
        p_dni: "12345678",
        p_nombre: "Persona",
        p_fecha: "2026-11-06",
        p_notas: "",
        p_clave: "key",
        p_evidencia: evidence,
        p_codigo_operacion: null,
        p_tarjeta_ultimos4: "4321",
    });
});
it("propaga error de carga/lectura/borrado y limita la firma a quince minutos", async () => {
    mocks.from.mockReturnValue(mocks);
    const error = new Error("Acceso denegado");
    mocks.createSignedUrl.mockResolvedValue({ data: null, error });
    await expect(tarjetasEvidenceService.getCardEvidenceUrl("owner/file.png")).rejects.toBe(error);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("owner/file.png", 900);
    mocks.remove.mockResolvedValue({ error });
    await expect(tarjetasEvidenceService.removeCardEvidence("owner/file.png")).rejects.toBe(error);
});
