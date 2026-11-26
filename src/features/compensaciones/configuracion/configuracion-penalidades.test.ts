import { describe, expect, it } from "vitest";
import { agruparPenalidades, explicacionPenalidad, penalidadesPorPerfil } from "./configuracion-penalidades";
import type { Cargo, PenalidadTipo } from "./configuracion.types";

const cargos = ["ATENCION_CLIENTE", "JEFE_SUPERIOR_PAGOS", "OPERADOR_ALTA_DEMANDA", "CARGO_NUEVO"].map(
    (codigo, i) => ({ id: i + 1, codigo, nombre: codigo, orden: i }) as Cargo,
);
const penalidad = (id: number, idCargo: number | null, nombre: string, montoReferencia: number) =>
    ({ id, idCargo, nombre, montoReferencia, descripcion: nombre, codigo: "P" + id }) as PenalidadTipo;

describe("Penalidades por perfil", () => {
    const todas = [penalidad(1, 1, "Uniforme", 10), penalidad(2, 3, "Cierre", 100), penalidad(3, 2, "Cierre", 150), penalidad(4, 4, "Otra", 1)];
    it("reúne los cargos de Pagos y no oculta cargos desconocidos", () => {
        expect(penalidadesPorPerfil(todas, cargos).map((perfil) => [perfil.id, perfil.items.length])).toEqual([
            ["ATC", 1],
            ["PAGOS", 2],
            ["OTROS", 1],
        ]);
    });
    it("agrupa la misma falta y distingue si el importe coincide", () => {
        const [fila] = agruparPenalidades([todas[1], todas[2]], cargos);
        expect(fila.items.map((item) => item.id)).toEqual([3, 2]);
        expect(fila.importeComun).toBe(false);
        expect(agruparPenalidades([penalidad(5, 2, "Descuadre", 5), penalidad(6, 3, "Descuadre", 5)], cargos)[0].importeComun).toBe(true);
    });
    it("explica solo las calculadas y el mínimo del error crítico", () => {
        expect(explicacionPenalidad("JEFE_ERROR_CUADRO")).toContain("30 %");
        expect(explicacionPenalidad("PAG_X_ERROR_PAGO_CRITICO")).toContain("mínimo");
        expect(explicacionPenalidad("ATC_UNIFORME")).toBe("");
    });
});
