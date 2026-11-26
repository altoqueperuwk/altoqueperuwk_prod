import { expect, it, vi } from "vitest";
import { evidenciasService } from "./evidencias.service";

const rpc = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {}, error: null }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
it("envía solo confirmación de chats; no acredita cuotas ni calidad por defecto", async () => {
    await evidenciasService.approveLeadership(7, " Revisión sustentada ", { chats: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("f_post_compensacion_meta_jefatura_resolver", {
        p_id: 7,
        p_comentario: "Revisión sustentada",
        p_sin_chats_descuidados: true,
    });
});
