import { beforeEach, expect, it, vi } from "vitest";
import { pancakeAdjudicacionService as service, validarExportacionPancake } from "./pancake-adjudicacion.service";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const mapeo = { conversacion: "id", usuario: "agent", fecha: "completed", efectiva: "status", valor_efectiva: "done" };
beforeEach(() => rpc.mockReset());
it("lee nombres reales mapeados sin inventar campos", () => {
    expect(validarExportacionPancake('[{"id":"x","agent":"a","completed":"2025-01-01T10:00:00-05:00","status":"done"}]', mapeo)).toBe(1);
    expect(() => validarExportacionPancake('[{"id":"x"}]', mapeo)).toThrow("campos");
});
it("requiere fecha con zona y valor efectiva explícito", () => {
    expect(() => validarExportacionPancake('[{"id":"x","agent":"a","completed":"2025-01-01","status":"done"}]', mapeo)).toThrow("zona");
    expect(() => validarExportacionPancake("[]", { ...mapeo, valor_efectiva: "" })).toThrow("mapeo");
});
it("admite array raíz real configurado y vacío sin fabricar un ganador", () => {
    expect(validarExportacionPancake('{"export":[]}', { ...mapeo, raiz: "export" })).toBe(0);
    expect(() => validarExportacionPancake("{}", mapeo)).toThrow("array");
});
it("propaga permisos y fuente ausente; nunca convierte errores en ranking cero", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Sin permiso" } });
    await expect(service.ranking("2025-01-01", "ATENCIONES")).rejects.toThrow("Sin permiso");
});
it("envía versión del ranking; no envía ganador ni importe desde cliente", async () => {
    rpc.mockResolvedValue({ data: { total_centimos: 10000 }, error: null });
    await service.adjudicar(
        { periodo: "2025-01-01", criterio: "ATENCIONES", estado: "LISTO", version: "v1", certificada: true, candidatos: [] },
        "Revisión completa",
    );
    expect(rpc).toHaveBeenCalledWith("f_post_compensacion_mes_adjudicar", {
        p_mes: "2025-01-01",
        p_criterio: "ATENCIONES",
        p_version: "v1",
        p_justificacion: "Revisión completa",
    });
});
