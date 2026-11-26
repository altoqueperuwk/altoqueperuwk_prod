import { afterEach, expect, it, vi } from "vitest";
import { referidosService } from "./referidos.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: mocks }));

afterEach(() => vi.resetAllMocks());
it("combina los tres filtros independientes con fechas y paginación en servidor", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
    await referidosService.list({
        documento: "00123456",
        nombre: " Cliente ",
        colaborador: "00000002",
        status: "PENDIENTE",
        month: "2026-11",
        desde: "2026-11-03",
        hasta: "2026-11-20",
        page: 2,
        pageSize: 20,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("f_get_compensacion_referidos_filtrados", {
        p_busqueda: null,
        p_documento_cliente: "00123456",
        p_nombre_cliente: "Cliente",
        p_colaborador: "00000002",
        p_estado_referido: "PENDIENTE",
        p_fecha_desde: "2026-11-03",
        p_fecha_hasta: "2026-11-20",
        p_pagina: 2,
        p_tamano_pagina: 20,
    });
});
it("separa revisión de Jefatura de las acciones administrativas", async () => {
    mocks.rpc.mockResolvedValue({
        data: {
            id_usuario: 15,
            id_colaborador: 20,
            puede_registrar: true,
            puede_aprobar: true,
            puede_revisar: true,
            puede_agregar_efectivizacion: false,
            puede_revertir: false,
        },
        error: null,
    });
    expect(await referidosService.context()).toMatchObject({ puedeAprobar: true, puedeRevisar: true, puedeAgregarEfectivizacion: false, puedeRevertir: false });
});
it("la validación envía sustento y operación, sin permitir una comisión ingresada manualmente", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 2, id_referido: 1, estado_evento: "APROBADO" }, error: null });
    await referidosService.resolve(1, "APROBADO", 42, " Verificado ", " https://example.com/pancake ");
    expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_referido_validar", {
        p_id: 1,
        p_id_operacion: 42,
        p_comentario: "Verificado",
        p_conversacion: "https://example.com/pancake",
    });
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    await expect(referidosService.resolve(1, "APROBADO", 42, "", "https://example.com/pancake")).rejects.toThrow("No se confirmó");
});
it.each([null, {}, { id: 1 }, { id: 1, id_evento: 0 }])("no confirma un referido sin el caso asociado: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(referidosService.register("12345678", "", "key", { nombre: "Cliente", monto: 1000, idBanco: 1 })).rejects.toThrow(
        "No se confirmó el referido",
    );
});
it("conserva clave, declaración y una respuesta confirmada", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 1, id_evento: 2 }, error: null });
    await referidosService.register("12345678", " contexto ", "stable-key", { nombre: "Cliente", monto: 1000, idBanco: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("f_post_compensacion_referido_declaracion", {
        p_dni: "12345678",
        p_notas: "contexto",
        p_clave: "stable-key",
        p_nombre: "Cliente",
        p_monto: 1000,
        p_id_banco: 1,
    });
});
