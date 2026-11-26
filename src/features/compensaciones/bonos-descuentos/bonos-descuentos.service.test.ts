import { beforeEach, expect, it, vi } from "vitest";
import { bonosDescuentosService } from "./bonos-descuentos.service";
import type { BonosDescuentosFiltros } from "./bonos-descuentos.types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
const filters: BonosDescuentosFiltros = { mes: "2026-10", vista: "SEGUIMIENTO", tipo: "", concepto: "", pagina: 1, tamano: 20 };
beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { items: [] }, error: null });
});

it("consulta el RPC propio sin aceptar ni enviar identidad de colaborador", async () => {
    await bonosDescuentosService.list(filters);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_mis_bonos_descuentos", {
        p_mes: "2026-10-01",
        p_vista: "SEGUIMIENTO",
        p_tipo: null,
        p_concepto: null,
        p_pagina: 1,
        p_tamano: 20,
    });
});
it("envía concepto y vista al detalle remoto paginado", async () => {
    await bonosDescuentosService.detail({ ...filters, vista: "LIQUIDADO", concepto: "TIKTOK_LIVE", pagina: 2 });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_mis_bonos_descuentos_detalle", {
        p_mes: "2026-10-01",
        p_vista: "LIQUIDADO",
        p_concepto: "TIKTOK_LIVE",
        p_pagina: 2,
        p_tamano: 20,
    });
});
it("no fabrica una respuesta vacía ante error o respuesta ausente", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Sin permiso" } });
    await expect(bonosDescuentosService.list(filters)).rejects.toMatchObject({ message: "Sin permiso" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(bonosDescuentosService.list(filters)).rejects.toThrow("No se recibió el resumen");
});
it("rechaza un periodo inválido antes de consultar", async () => {
    await expect(bonosDescuentosService.list({ ...filters, mes: "2026-13" })).rejects.toThrow("periodo válido");
    expect(mocks.rpc).not.toHaveBeenCalled();
});

it("envía idénticos filtros opcionales a lista y detalle", async () => {
    const scoped = { ...filters, estado: "PENDIENTE", desde: "2026-10-10", hasta: "2026-10-12", criterio: "ATENCIONES" as const };
    await bonosDescuentosService.list(scoped);
    await bonosDescuentosService.detail({ ...scoped, concepto: "BONO_COLABORADOR_MES" });
    for (const [, params] of mocks.rpc.mock.calls)
        expect(params).toMatchObject({ p_estado: "PENDIENTE", p_desde: "2026-10-10", p_hasta: "2026-10-12", p_criterio: "ATENCIONES" });
});
it.each([{ desde: "2026-10-20", hasta: "2026-10-10" }, { desde: "2026-02-30" }, { hasta: "invalid" }])(
    "rechaza un rango inválido antes de consultar: %j",
    async (range) => {
        await expect(bonosDescuentosService.list({ ...filters, ...range })).rejects.toThrow();
        expect(mocks.rpc).not.toHaveBeenCalled();
    },
);

it.each(["PGRST202", "PGRST203"])("explica el contrato no instalado o ambiguo (%s) sin fallback local", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "RPC contract missing" } });
    await expect(bonosDescuentosService.list({ ...filters, estado: "PENDIENTE" })).rejects.toThrow("aún no están disponibles en el servidor");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
