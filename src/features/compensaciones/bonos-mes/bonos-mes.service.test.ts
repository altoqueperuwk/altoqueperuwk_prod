import { beforeEach, describe, expect, it, vi } from "vitest";
import { reporteACsv } from "./bonos-mes-export";
import { bonosMesService } from "./bonos-mes.service";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const fila = {
    id_colaborador: 7,
    nombre_completo: "=Ana Pérez",
    tipo_documento: "DNI",
    numero_documento: "123",
    cargo: "Atención al cliente",
    id_sucursal: 2,
    sucursal: "Lima",
    total_bonos: 10,
    total_comisiones: 20,
    total_descuentos: 6,
    total_neto: 24,
    puede_calcular: true,
    bloqueos: [],
    descuentos_mes: [
        { id: 1, tipo_origen: "ERROR_CUADRO", tipo: "BLOQUE_30", porcentaje: 30, importe_base: 20, importe_descuento: 6, motivo: "x", estado: "ACTIVO" },
    ],
    condiciones: [{ codigo_condicion: "PUNTUALIDAD", cumple: false, nota: null }],
    detalles: [{ clave_origen: "A", concepto_nombre: "Bono", categoria: "BONO", naturaleza: "INGRESO", cantidad: 1, tarifa: 10, importe: 10 }],
};

beforeEach(() => rpc.mockReset());

describe("Bonos del mes: servicio", () => {
    it("mapea la lista y rechaza una respuesta de otro mes", async () => {
        rpc.mockResolvedValueOnce({
            data: {
                id_periodo: 3,
                estado_reporte: "BORRADOR",
                total_filas: 1,
                totales: { total_bonos: 10, total_comisiones: 20, total_descuentos: 6, total_neto: 24 },
                filas: [fila],
            },
            error: null,
        });
        const lista = await bonosMesService.getLista(3, " ana ");
        expect(rpc).toHaveBeenCalledWith("f_get_compensacion_bonos_mes", { p_id_periodo: 3, p_busqueda: "ana", p_limite: 500, p_desplazamiento: 0 });
        expect(lista.filas[0]).toMatchObject({ idColaborador: 7, documento: "DNI 123", totalNeto: 24, puedeCalcular: true });
        expect(lista.filas[0].descuentos[0]).toMatchObject({ tipo: "BLOQUE_30", importeDescuento: 6 });
        expect(lista.filas[0].condiciones[0].cumple).toBe(false);

        rpc.mockResolvedValueOnce({ data: { id_periodo: 9, filas: [] }, error: null });
        await expect(bonosMesService.getLista(3, "")).rejects.toThrow(/no corresponde/);
    });

    it("propaga el error del servidor al aplicar un descuento", async () => {
        rpc.mockResolvedValueOnce({ data: null, error: new Error("Solo Administración puede gestionar los bonos del mes") });
        await expect(bonosMesService.aplicarDescuento(3, 7, { tipoOrigen: "ERROR_CUADRO", tipo: "BLOQUE_30", motivo: " m " })).rejects.toThrow(
            /Solo Administración/,
        );
        expect(rpc).toHaveBeenCalledWith("f_post_compensacion_descuento_mes", {
            p_id_periodo: 3,
            p_id_colaborador: 7,
            p_tipo_origen: "ERROR_CUADRO",
            p_tipo: "BLOQUE_30",
            p_motivo: "m",
        });
    });

    it("confirma indicando si se aceptan bloqueos", async () => {
        rpc.mockResolvedValueOnce({ data: {}, error: null });
        await bonosMesService.confirmar(3, " nota ", true);
        expect(rpc).toHaveBeenCalledWith("f_post_compensacion_reporte_mes_confirmar", { p_id_periodo: 3, p_nota: "nota", p_incluir_bloqueados: true });
    });
});

describe("Bonos del mes: exportación", () => {
    it("genera CSV con totales y neutraliza fórmulas", async () => {
        rpc.mockResolvedValueOnce({
            data: {
                periodo: "2026-11-01",
                nombre_periodo: "2026-11",
                confirmado_en: "x",
                hash_contenido: "h",
                totales: { total_bonos: 10, total_comisiones: 20, total_descuentos: 6, total_neto: 24 },
                colaboradores: [fila],
            },
            error: null,
        });
        const csv = reporteACsv(await bonosMesService.exportar(3));
        const lineas = csv.split("\r\n");
        expect(lineas[0]).toBe("Documento,Colaborador,Cargo,Sede,Bonos,Comisiones,Penalidades,Total a reportar");
        expect(lineas[1]).toContain("'=Ana Pérez");
        expect(lineas.at(-1)).toBe(",TOTAL,,,10.00,20.00,6.00,24.00");
    });
});
