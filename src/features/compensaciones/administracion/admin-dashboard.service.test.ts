import { afterEach, describe, expect, it, vi } from "vitest";
import { adminDashboardService, adminMesLima } from "./admin-dashboard.service";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc, from } }));
afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
});
const panel = {
    ambito: "GLOBAL",
    periodo: { mes: "2026-10-01", estado: "ABIERTO" },
    catalogos: { sedes: [], roles: [] },
    kpis: { eventos_pendientes: 7, otro_revisor: 2 },
    items: [],
    total: 0,
    total_paginas: 0,
};
const filters = { mes: "2026-10", sede: null, rol: null, pagina: 1, tamano: 20 };
describe("Lectura del Dashboard Administración", () => {
    it("envía filtros y paginación en una única RPC de lectura, sin DML", async () => {
        rpc.mockResolvedValue({ data: panel, error: null });
        expect(await adminDashboardService.listar(filters)).toEqual(panel);
        expect(rpc).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_administracion_panel", {
            p_mes: "2026-10-01",
            p_sede: null,
            p_rol: null,
            p_pagina: 1,
            p_tamano: 20,
        });
        expect(from).not.toHaveBeenCalled();
    });
    it.each([20, 50, 100])("transmite sede, rol y tamaño %i sin filtrar localmente", async (tamano) => {
        rpc.mockResolvedValue({ data: panel });
        await adminDashboardService.listar({ ...filters, sede: 5, rol: 4, pagina: 3, tamano });
        expect(rpc).toHaveBeenCalledWith(
            "f_get_compensacion_administracion_panel",
            expect.objectContaining({ p_sede: 5, p_rol: 4, p_pagina: 3, p_tamano: tamano }),
        );
    });
    it("propaga errores y no convierte respuestas incompletas en contadores cero", async () => {
        rpc.mockResolvedValueOnce({ error: new Error("Sin acceso") });
        await expect(adminDashboardService.listar(filters)).rejects.toThrow("Sin acceso");
        for (const data of [null, {}, { ...panel, kpis: {} }, { ...panel, ambito: "PERSONAL" }]) {
            rpc.mockResolvedValueOnce({ data });
            await expect(adminDashboardService.listar(filters)).rejects.toThrow(/confirmar/);
        }
    });
    it("preserva nulos y excluye campos salariales ajenos al contrato", async () => {
        rpc.mockResolvedValue({ data: { ...panel, salario: 9999 } });
        const result = await adminDashboardService.listar(filters);
        expect(result.kpis).not.toHaveProperty("liquidaciones_pendientes");
        expect(result).not.toHaveProperty("salario");
    });
    it("inicia en el mes de Lima aunque UTC ya cambió de mes", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
        expect(adminMesLima()).toBe("2026-10");
    });
});
