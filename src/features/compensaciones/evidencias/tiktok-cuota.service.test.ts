import { beforeEach, describe, expect, it, vi } from "vitest";
import { evidenciasService } from "./evidencias.service";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
beforeEach(() => {
    vi.resetAllMocks();
    rpc.mockResolvedValue({ data: {}, error: null });
});

describe("Revisión de cuota TikTok", () => {
    it.each([true, false])("envía resultado %s sin actor, fecha, estado ni dinero del cliente", async (result) => {
        await evidenciasService.reviewTiktokQuota(7, "  Sustento revisado  ", result);
        expect(rpc).toHaveBeenCalledExactlyOnceWith("f_post_compensacion_tiktok_cuota_resolver", {
            p_id: 7,
            p_comentario: "Sustento revisado",
            p_cuota_cumplida: result,
        });
    });

    it.each([true, false, null])("conserva la revisión %s y el cargo informado por servidor", async (result) => {
        rpc.mockResolvedValue({
            data: { requiere_cuota: true, revision: { cuota_cumplida: result, comentario: "Sustento", fecha: "2026-10-29T15:00:00Z" } },
            error: null,
        });
        expect(await evidenciasService.getTiktokQuota(7)).toEqual({
            requiereCuota: true,
            cuotaCumplida: result,
            comentario: "Sustento",
            fecha: "2026-10-29T15:00:00Z",
        });
        expect(rpc).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_tiktok_cuota", { p_id: 7 });
    });

    it("no presenta una revisión ausente como cuota cumplida", async () => {
        rpc.mockResolvedValue({ data: { requiere_cuota: false, revision: null }, error: null });
        expect(await evidenciasService.getTiktokQuota(7)).toEqual({ requiereCuota: false, cuotaCumplida: null, comentario: "", fecha: null });
    });

    it("propaga el rechazo de permisos del servidor", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "Solo administración" } });
        await expect(evidenciasService.reviewTiktokQuota(7, "Sustento", true)).rejects.toMatchObject({ message: "Solo administración" });
    });
});
