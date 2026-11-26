import { expect, it, vi } from "vitest";
import { type CazaErroresOption, cazaErroresOptions } from "./caza-errores-policy";
import { incidenciasService } from "./incidencias.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

it.each(["MAL_FLUJO_SAFETYPAY", "CONVERSACION_PROCESO", "ERROR_REGISTRO"] as CazaErroresOption[])(
    "registra y envía %s por la ruta directa, sin adjuntos ni reportante elegido",
    async (option) => {
        mocks.rpc.mockReset();
        const values = {
            idTipoEvento: 1,
            idPenalidadTipo: 2,
            idReportante: null,
            idResponsable: 4,
            fechaEvento: "2026-11-12T09:00",
            titulo: "Hallazgo",
            motivo: " Observación de prueba ",
            evidenciaUrl: "",
            clienteId: 7,
            clienteDocumento: "99999999",
            clienteNombre: "Cliente de prueba",
            operacionId: null,
        };
        mocks.rpc.mockResolvedValueOnce({ data: { id: 20, estado_evento: "BORRADOR" }, error: null });
        await expect(incidenciasService.createCazaErrores(values, option, "stable-key")).resolves.toBe(20);
        expect(mocks.rpc).toHaveBeenLastCalledWith(
            "f_post_compensacion_caza_errores",
            expect.objectContaining({
                p_ruta: cazaErroresOptions[option].route,
                p_id_colaborador_responsable: 4,
                p_fecha_evento: "2026-11-12T14:00:00.000Z",
                p_motivo: "Observación de prueba",
                p_evidencia: [],
                p_clave_origen: "stable-key",
                p_referencias: [expect.objectContaining({ id_cliente: 7 })],
            }),
        );
        mocks.rpc.mockResolvedValueOnce({ data: { id: 20, estado_evento: "PENDIENTE" }, error: null });
        await incidenciasService.sendCazaErrores(20, option);
        expect(mocks.rpc).toHaveBeenLastCalledWith("f_post_compensacion_caza_errores_enviar", { p_ruta: cazaErroresOptions[option].route, p_id: 20 });
    },
);

it("registro personal usa hora Lima, clave estable y rechaza una confirmación inválida", async () => {
    const form = {
        idTipoEvento: 1,
        idPenalidadTipo: 2,
        idReportante: 3,
        idResponsable: 4,
        fechaEvento: "2026-11-02T09:00",
        titulo: "",
        motivo: " Hecho ",
        evidenciaUrl: "https://example.com/evidencia",
        clienteId: null,
        clienteDocumento: "",
        clienteNombre: "",
        operacionId: null,
    };
    mocks.rpc.mockResolvedValueOnce({ data: { id: 10 }, error: null });
    await expect(incidenciasService.savePersonal(form, "UNIFORME", "stable-key", true)).resolves.toBe(10);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
        "f_post_compensacion_jefatura_incidencia_personal",
        expect.objectContaining({ p_clave: "stable-key", p_fecha_evento: "2026-11-02T14:00:00.000Z", p_id_responsable: 4, p_enviar: true }),
    );
    mocks.rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(incidenciasService.savePersonal(form, "UNIFORME", "stable-key", true)).rejects.toThrow("no confirmó");
});

it("solicita el concepto antes de paginar y conserva el contrato general sin parámetro nuevo", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [], resumen: {}, total_paginas: 0 }, error: null });
    await incidenciasService.getList({
        tray: "TODOS",
        category: "",
        status: "",
        penaltyId: 0,
        search: "",
        from: "",
        to: "",
        page: 2,
        pageSize: 20,
        concept: "INDISCIPLINA",
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
        "f_get_tb_compensacion_incidencia_personal",
        expect.objectContaining({ p_concepto: "INDISCIPLINA", p_pagina: 2 }),
    );
});

it("conserva IDs de atribución del servidor sin identificarlos por nombre", async () => {
    mocks.rpc.mockResolvedValue({
        data: { items: [{ id: 1, id_usuario_registra: 24, id_colaborador_beneficiario: 15, id_colaborador_responsable: 16 }], resumen: {}, total_paginas: 1 },
        error: null,
    });
    const result = await incidenciasService.getList({
        tray: "RECIBIDOS",
        category: "",
        status: "",
        penaltyId: 0,
        search: "",
        from: "",
        to: "",
        page: 1,
        pageSize: 20,
    });
    expect(result.items[0]).toMatchObject({ usuarioRegistraId: 24, reportanteId: 15, responsableId: 16 });
});
it("envía únicamente los campos editables para corregir un borrador", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    await incidenciasService.updateDraft(12, { titulo: "  Título  ", motivo: "  Motivo corregido  ", evidenciaUrl: " https://example.com/evidencia " });
    expect(mocks.rpc).toHaveBeenCalledWith("f_patch_tb_compensacion_incidencia", {
        p_id: 12,
        p_titulo: "Título",
        p_motivo: "Motivo corregido",
        p_evidencia: [{ tipo: "ENLACE", url: "https://example.com/evidencia" }],
    });
});

it("revision administrativa rechaza contexto ajeno y envia version, decision y motivo", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: 99 }, error: null });
    await expect(incidenciasService.reviewContext(12)).rejects.toThrow("verificar el expediente");
    mocks.rpc.mockResolvedValueOnce({ data: { id: 12 }, error: null });
    await incidenciasService.reviewDecision(12, "v12", "OBSERVADO", " Evidencia incompleta ");
    expect(mocks.rpc).toHaveBeenLastCalledWith("f_post_compensacion_incidencia_revision_admin", {
        p_id: 12,
        p_version: "v12",
        p_decision: "OBSERVADO",
        p_comentario: "Evidencia incompleta",
    });
    mocks.rpc.mockResolvedValueOnce({ data: { id: 99 }, error: null });
    await expect(incidenciasService.reviewDecision(12, "v12", "RECHAZADO", "Evidencia incompleta")).rejects.toThrow("No se confirmó");
});

it("convierte el error de Supabase en un Error con el mensaje real del servidor", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "No tiene permiso para esta opcion de registro", code: "P0001" } });
    const failure = await incidenciasService.sendCazaErrores(5, "ERROR_REGISTRO").catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("No tiene permiso para esta opcion de registro");
});
