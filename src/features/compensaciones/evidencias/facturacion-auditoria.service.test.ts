import { afterEach, describe, expect, it, vi } from "vitest";
import { type FacturacionRegistro, facturacionFechasMes, facturacionMesLima, facturacionAuditoriaService as service } from "./facturacion-auditoria.service";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
});
const extra: FacturacionRegistro = {
    tipo: "OPERACION_EXTRA",
    dni: "12345678",
    codigo: "EXT-77",
    evidencia: "comprobante externo",
    descripcion: "No aparece en sistema",
    error: null,
    operacion: null,
    clave: "dcd390ee-fbf6-4230-b194-ad66c8a29c02",
};
describe("Contratos de auditoría de facturación", () => {
    it("registra extra pendiente sin beneficiario externo, importe ni operación inventada", async () => {
        rpc.mockResolvedValue({ data: { id: 7, estado_evento: "PENDIENTE" }, error: null });
        await service.guardar(extra);
        expect(rpc).toHaveBeenCalledWith("f_post_compensacion_facturacion_auditoria_guardar", {
            p_tipo: extra.tipo,
            p_dni: extra.dni,
            p_codigo_externo: "EXT-77",
            p_evidencia: extra.evidencia,
            p_descripcion: extra.descripcion,
            p_error: null,
            p_id_operacion: null,
            p_id: null,
            p_clave: extra.clave,
        });
    });
    it("rechaza detección sin operación real y extra ya registrada antes de enviar RPC", () => {
        expect(() => service.guardar({ ...extra, tipo: "DETECCION_ERROR_PAGO", error: "MONTO" })).toThrow(/operación/);
        expect(() => service.guardar({ ...extra, operacion: 21 })).toThrow(/antes/);
        expect(rpc).not.toHaveBeenCalled();
    });
    it("permite asociar después de crear el reporte", async () => {
        rpc.mockResolvedValue({ data: { id: 7, estado_evento: "PENDIENTE" }, error: null });
        await service.guardar({ ...extra, id: 7, clave: undefined, operacion: 21 });
        expect(rpc.mock.calls[0][1]).toMatchObject({ p_id: 7, p_id_operacion: 21, p_clave: null });
    });
    it("exige DNI completo y verifica identidad de la respuesta", async () => {
        await expect(service.operaciones("")).rejects.toThrow(/DNI/);
        expect(rpc).not.toHaveBeenCalled();
        rpc.mockResolvedValue({ data: { dni: extra.dni, items: [{ dni: "99999999" }] }, error: null });
        await expect(service.operaciones(extra.dni)).rejects.toThrow(/corresponde/);
    });
    it("pagina y filtra en servidor; transmite alcance solo mediante la sesión", async () => {
        rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
        await service.listar({ desde: "2026-10-01", hasta: "2026-10-31", dni: extra.dni, estado: "PENDIENTE", pagina: 3, tamano: 50 });
        expect(rpc).toHaveBeenCalledWith("f_get_compensacion_facturacion_auditoria", {
            p_desde: "2026-10-01",
            p_hasta: "2026-10-31",
            p_dni: extra.dni,
            p_estado: "PENDIENTE",
            p_pagina: 3,
            p_tamano: 50,
        });
    });
    it("propaga errores económicos y no confirma respuestas nulas", async () => {
        rpc.mockResolvedValueOnce({ error: new Error("Operacion ya remunerada") });
        await expect(service.resolver(7, "APROBADO", "Verificado", "2026-11-04T12:00:00Z")).rejects.toThrow(/remunerada/);
        rpc.mockResolvedValueOnce({ data: null, error: null });
        await expect(service.resolver(7, "APROBADO", "Verificado", "2026-11-04T12:00:00Z")).rejects.toThrow(/confirmación/);
    });
    it("requiere justificación administrativa", () => {
        expect(() => service.resolver(7, "RECHAZADO", "  ")).toThrow(/mínimo diez/);
        expect(() => service.resolver(7, "RECHAZADO", "Reporte no acreditado")).toThrow(/Actualiza/);
        expect(rpc).not.toHaveBeenCalled();
    });
    it("rechaza confirmaciones de otro expediente o con un estado distinto a la decisión", async () => {
        rpc.mockResolvedValueOnce({ data: { id: 8, estado_evento: "PENDIENTE" }, error: null });
        await expect(service.guardar({ ...extra, id: 7, operacion: 21 })).rejects.toThrow(/reporte solicitado/);
        rpc.mockResolvedValueOnce({ data: { id: 7, estado_evento: "PENDIENTE" }, error: null });
        await expect(service.resolver(7, "APROBADO", "Verificado", "2026-11-04T12:00:00Z")).rejects.toThrow(/decisión solicitada/);
    });
    it("reapertura exige motivo y transmite la versión sin reinterpretar el instante", async () => {
        await expect(service.reabrir(7, "", "Revisar")).rejects.toThrow(/Actualiza/);
        const version = "2026-11-02T10:00:00.123456-05:00";
        rpc.mockResolvedValue({ data: { id: 7, estado_evento: "PENDIENTE" }, error: null });
        await service.reabrir(7, version, "  Fuente cambió  ");
        expect(rpc).toHaveBeenCalledWith("f_post_compensacion_facturacion_auditoria_reabrir", { p_id: 7, p_version: version, p_motivo: "Fuente cambió" });
    });
    it("sincroniza febrero bisiesto y usa el mes de Lima en el cambio UTC", () => {
        expect(facturacionFechasMes("2024-02")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
        expect(facturacionFechasMes("2026-02").hasta).toBe("2026-02-28");
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
        expect(facturacionMesLima()).toBe("2026-10");
    });
});
describe("Aprobado incluye liquidados", () => {
    const item = (id: number, fecha: string, estado: string) => ({ id, fecha_evento: fecha, estado_evento: estado });
    it("pide Aprobado y Liquidado al servidor, los une por fecha y suma totales", async () => {
        rpc.mockImplementation(async (_name: string, params: { p_estado: string }) => ({
            data:
                params.p_estado === "APROBADO"
                    ? {
                          items: [item(1, "2026-10-20T10:00:00Z", "APROBADO"), item(3, "2026-10-18T10:00:00Z", "APROBADO")],
                          total: 2,
                          pendientes: 1,
                          aprobado: 0.4,
                      }
                    : { items: [item(2, "2026-10-19T10:00:00Z", "LIQUIDADO")], total: 1, pendientes: 0, aprobado: 0.2 },
            error: null,
        }));
        const result = await service.listar({ desde: "2026-10-01", hasta: "2026-10-31", dni: "", estado: "APROBADO", pagina: 1, tamano: 20 });
        expect(rpc.mock.calls.map((c) => c[1].p_estado).sort()).toEqual(["APROBADO", "LIQUIDADO"]);
        expect(result.items.map((i) => i.id)).toEqual([1, 2, 3]);
        expect(result.total).toBe(3);
        expect(result.pendientes).toBe(1);
        expect(result.aprobado).toBeCloseTo(0.6);
    });
    it("pagina sobre la unión ordenada", async () => {
        rpc.mockImplementation(async (_name: string, params: { p_estado: string }) => ({
            data:
                params.p_estado === "APROBADO"
                    ? { items: [item(1, "2026-10-20T10:00:00Z", "APROBADO")], total: 1, pendientes: 0, aprobado: 0 }
                    : { items: [item(2, "2026-10-19T10:00:00Z", "LIQUIDADO")], total: 1, pendientes: 0, aprobado: 0 },
            error: null,
        }));
        const result = await service.listar({ desde: "2026-10-01", hasta: "2026-10-31", dni: "", estado: "APROBADO", pagina: 2, tamano: 20 });
        expect(result.items).toEqual([]);
        expect(result.total).toBe(2);
    });
});
