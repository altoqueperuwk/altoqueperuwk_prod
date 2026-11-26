import { beforeEach, describe, expect, it, vi } from "vitest";
import { calificacionListService } from "./calificacion-list.service";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

describe("calificacionListService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        rpc.mockResolvedValue({
            data: {
                items: [{ id: 1, estado_evento: "APROBADO", datos: { cliente_documento: "12345678" }, referencias: [], revisiones: [] }],
                total: 61,
                total_paginas: 4,
                resumen: { pendientes: 8, aprobados: 53, no_validas: 2, importe_aprobado: 106 },
                politica: { dni_obligatorio: true, comentario_obligatorio: false, asesor_obligatorio: false },
                puede_configurar: false,
                puede_administrar: true,
                asesores: [],
                ranking: [],
                distribucion: [],
            },
            error: null,
        });
    });

    it("envía filtros independientes al lector de servidor y conserva KPI sin sumar la página", async () => {
        const result = await calificacionListService.getRatings({
            documento: "12345678",
            nombreCliente: "Ana",
            colaborador: "87654321",
            comentario: "buena atención",
            asesor: 0,
            estrellas: 5,
            estado: "APROBADO",
            desde: "2026-11-01",
            hasta: "2026-11-30",
            pagina: 3,
            tamanoPagina: 20,
        });

        expect(rpc).toHaveBeenCalledWith("f_get_compensacion_calificaciones_filtradas", {
            p_busqueda: null,
            p_id_asesor: null,
            p_estrellas: 5,
            p_estado: "APROBADO",
            p_desde: "2026-11-01",
            p_hasta: "2026-11-30",
            p_pagina: 3,
            p_tamano: 20,
            p_documento_cliente: "12345678",
            p_nombre_cliente: "Ana",
            p_colaborador: "87654321",
            p_comentario: "buena atención",
        });
        expect(result.items).toHaveLength(1);
        expect(result.total).toBe(61);
        expect(result.totalPages).toBe(4);
        expect(result.pendientes).toBe(8);
        expect(result.aprobados).toBe(53);
        expect(result.importeAprobado).toBe(106);
    });

    it("normaliza campos vacíos como filtros opcionales", async () => {
        await calificacionListService.getRatings({
            documento: "",
            nombreCliente: "  ",
            colaborador: "",
            comentario: "",
            asesor: 4,
            estrellas: 0,
            estado: "",
            desde: "",
            hasta: "",
            pagina: 1,
            tamanoPagina: 20,
        });

        expect(rpc.mock.calls[0][1]).toMatchObject({
            p_id_asesor: 4,
            p_estrellas: null,
            p_estado: null,
            p_desde: null,
            p_hasta: null,
            p_documento_cliente: null,
            p_nombre_cliente: null,
            p_colaborador: null,
            p_comentario: null,
        });
    });
});
