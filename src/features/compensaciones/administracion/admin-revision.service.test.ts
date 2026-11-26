import { beforeEach, expect, it, vi } from "vitest";
import { type AdminRevision, adminRevisionService, parseAdminRevision } from "./admin-revision.service";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const context = (): AdminRevision => ({
    id: 8,
    version: "v1",
    estado: "PENDIENTE",
    puede_revisar: true,
    puede_aprobar: true,
    puede_observar: true,
    puede_anular: false,
    bloqueado: false,
    motivo: "",
    automatico: false,
    requiere_implementacion: false,
    destino: "/compensaciones/llamadas",
    fuentes: [],
});
beforeEach(() => vi.resetAllMocks());
it("rechaza una respuesta incompleta en lugar de habilitar acciones por defecto", () => {
    expect(() => parseAdminRevision(null)).toThrow();
    expect(() => parseAdminRevision({ ...context(), puede_aprobar: "true" })).toThrow();
    expect(() => parseAdminRevision({ ...context(), fuentes: [{ tipo: "OP", codigo: "1", estado: "Pagado", monto: "100" }] })).toThrow();
});
it("comprueba el id del expediente y propaga errores de permiso", async () => {
    rpc.mockResolvedValueOnce({ data: context(), error: null });
    expect((await adminRevisionService.get(8)).version).toBe("v1");
    rpc.mockResolvedValueOnce({ data: context(), error: null });
    await expect(adminRevisionService.get(9)).rejects.toThrow(/corresponde/);
    rpc.mockResolvedValueOnce({ error: { message: "Sin permiso" }, data: null });
    await expect(adminRevisionService.get(8)).rejects.toMatchObject({ message: "Sin permiso" });
});
it("envía versión y motivo sin convertir una respuesta vacía en éxito", async () => {
    rpc.mockResolvedValueOnce({ data: { id: 8 }, error: null });
    await adminRevisionService.resolve({ id: 8, version: "v1", action: "APROBADO", reason: "  Fuente comprobada  ", chats: true });
    expect(rpc).toHaveBeenLastCalledWith("f_post_compensacion_administracion_revision", {
        p_id: 8,
        p_version: "v1",
        p_accion: "APROBADO",
        p_motivo: "Fuente comprobada",
        p_base: null,
        p_cantidad: null,
        p_chats_revisados: true,
    });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(adminRevisionService.resolve({ id: 8, version: "v1", action: "RECHAZADO", reason: "Fuente no comprobada" })).rejects.toThrow(/confirmó/);
});
