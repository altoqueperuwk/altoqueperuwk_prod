import { afterEach, expect, it, vi } from "vitest";
import { evidenciasService } from "./evidencias.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

afterEach(() => vi.resetAllMocks());
it("envía los tres filtros de Tarjetas al lector exclusivo y conserva el lector general sin ellos", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [], resumen: {}, total: 0 }, error: null });
    await evidenciasService.getList({
        category: "TARJETA_TERCERO",
        documentoCliente: "00123456",
        nombreCliente: "Cliente",
        colaborador: "Equipo",
        page: 2,
        pageSize: 20,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
        "f_get_compensacion_tarjetas_filtradas",
        expect.objectContaining({
            p_categoria: "TARJETA_TERCERO",
            p_documento_cliente: "00123456",
            p_nombre_cliente: "Cliente",
            p_colaborador: "Equipo",
            p_pagina: 2,
        }),
    );
    await evidenciasService.getList({ category: "TARJETA_TERCERO", page: 1, pageSize: 20 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("f_get_tb_compensacion_evento", expect.not.objectContaining({ p_documento_cliente: expect.anything() }));
});
