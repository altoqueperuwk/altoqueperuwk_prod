import { beforeEach, expect, it, vi } from "vitest";
import { clientesNuevosService } from "./clientes-nuevos.service";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
beforeEach(() => {
    vi.resetAllMocks();
    rpc.mockResolvedValue({ data: { id: 1, items: [], total: 0 }, error: null });
});
it.each(["COMISION_REGISTRO_EFECTIVIZACION", "COMISION_TIKTOK_LIVE"] as const)("envía %s explícito en la consulta, decisión y nota", async (concept) => {
    await clientesNuevosService.revision(7, 15, concept);
    expect(rpc).toHaveBeenLastCalledWith("f_get_compensacion_captacion_revision_concepto", { p_cliente: 7, p_colaborador: 15, p_concepto: concept });
    await clientesNuevosService.resolve(7, 15, "version", "APROBADO", concept);
    expect(rpc).toHaveBeenLastCalledWith("f_post_compensacion_captacion_resolver_concepto", {
        p_cliente: 7,
        p_colaborador: 15,
        p_concepto: concept,
        p_version: "version",
        p_decision: "APROBADO",
        p_motivo: null,
    });
    await clientesNuevosService.note(7, 15, " Nota ", concept);
    expect(rpc).toHaveBeenLastCalledWith("f_post_compensacion_captacion_nota_concepto", {
        p_cliente: 7,
        p_colaborador: 15,
        p_concepto: concept,
        p_nota: "Nota",
    });
});
it("envía filtros a la consulta paginada", async () => {
    await clientesNuevosService.list("2026-10", 2, 50, {
        tipo: "2",
        documento: "123",
        estado: "ESPERANDO_OPERACION",
        desde: "2026-10-01",
        hasta: "2026-10-15",
    });
    expect(rpc).toHaveBeenCalledWith("f_get_compensacion_clientes_nuevos", {
        p_mes: "2026-10-01",
        p_pagina: 2,
        p_tamano: 50,
        p_tipo_documento: 2,
        p_documento: "123",
        p_estado: "ESPERANDO_OPERACION",
        p_desde: "2026-10-01",
        p_hasta: "2026-10-15",
        p_nombre_cliente: "",
        p_colaborador: "",
    });
});
it("conserva el autor y ámbito del servidor sin aceptar un ID de jefe desde el cliente", async () => {
    rpc.mockResolvedValue({
        data: { items: [{ id: 1, registrado_por: "Asesor", propio: false, puede_editar: false }], total: 1, dataState: "complete" },
        error: null,
    });
    const result = await clientesNuevosService.list("2026-11", 2, 20, { documento: "Ana", desde: "2026-11-01", hasta: "2026-11-30" });
    expect(rpc).toHaveBeenCalledWith("f_get_compensacion_clientes_nuevos", {
        p_mes: "2026-11-01",
        p_pagina: 2,
        p_tamano: 20,
        p_tipo_documento: null,
        p_documento: "Ana",
        p_estado: "",
        p_desde: "2026-11-01",
        p_hasta: "2026-11-30",
        p_nombre_cliente: "",
        p_colaborador: "",
    });
    expect(result.items[0]).toMatchObject({ registrado_por: "Asesor", propio: false, puede_editar: false });
});
it("valida excluyendo el registro propio y edita mediante RPC restringida", async () => {
    await clientesNuevosService.validate("70176064", 1, 7);
    expect(rpc).toHaveBeenLastCalledWith("f_get_compensacion_cliente_nuevo_validar", { p_documento: "70176064", p_tipo_documento: 1, p_id_excluir: 7 });
    await clientesNuevosService.update(7, "70176064", " Cliente corregido ", 1, "999999999", 3);
    expect(rpc).toHaveBeenLastCalledWith("f_patch_compensacion_cliente_nuevo", {
        p_id: 7,
        p_documento: "70176064",
        p_nombre: "Cliente corregido",
        p_tipo_documento: 1,
        p_celular: "999999999",
        p_id_comunidad: 3,
    });
});

it("conserva canal, EN_REVISION y metadatos de integridad sin convertir revisión en cero", async () => {
    const response = {
        items: [{ id: 7, estado: "EN_REVISION", canal: "TIKTOK_LIVE", id_operacion: 12, ganancia: null }],
        total: 1,
        asOf: "2026-11-01T16:00:00Z",
        dataState: "partial",
        en_revision: 1,
        total_comision: 0,
    };
    rpc.mockResolvedValue({ data: response, error: null });
    expect(await clientesNuevosService.list("2026-11", 1, 20, { estado: "EN_REVISION" })).toEqual(response);
    expect(rpc).toHaveBeenLastCalledWith("f_get_compensacion_clientes_nuevos", expect.objectContaining({ p_estado: "EN_REVISION" }));
});
it("no considera completo un contrato legacy sin metadatos", async () => {
    rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
    expect(await clientesNuevosService.list("2026-11", 1, 20)).toMatchObject({ dataState: "unknown" });
});
it("rechaza una lista malformada en lugar de presentarla vacía", async () => {
    rpc.mockResolvedValue({ data: { items: null, total: 0, dataState: "complete" }, error: null });
    await expect(clientesNuevosService.list("2026-11", 1, 20)).rejects.toThrow("incompleta");
});
