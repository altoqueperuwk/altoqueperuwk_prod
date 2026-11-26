import { describe, expect, it } from "vitest";
import { repartirBonos } from "./configuracion-bonos";
import type { Regla } from "./configuracion.types";

const regla = (id: number, codigo: string, idCargo: number | null, monto: number, extra: Partial<Regla> = {}) =>
    ({ id, conceptoNombre: codigo, idCargo, idSucursal: null, tipoCalculo: "POR_UNIDAD", monto, porcentaje: null, configuracion: {}, ...extra }) as Regla;
const repartir = (rules: Regla[]) => repartirBonos(rules, (rule) => rule.conceptoNombre);

describe("Reparto de bonos en tarjetas", () => {
    it("deja cada regla en un solo lugar", () => {
        const rules = [
            regla(1, "COMISION_LLAMADA", 1, 0.2),
            regla(2, "COMISION_LLAMADA", 2, 0.2),
            regla(3, "COMISION_TIKTOK_LIVE", 1, 0.7),
            regla(4, "BONO_SEGURIDAD_TARJETA", 1, 10),
            regla(5, "CODIGO_NUEVO", 1, 1),
        ];
        const { generales, auditoria, columnas, otros } = repartir(rules);
        expect(generales.map((item) => item.code)).toEqual(["COMISION_LLAMADA"]);
        expect(auditoria.map((item) => item.code)).toEqual(["BONO_SEGURIDAD_TARJETA"]);
        expect(columnas.map((item) => item.code)).toEqual(["COMISION_TIKTOK_LIVE"]);
        expect(otros.map((item) => item.id)).toEqual([5]);
    });
    it("un importe distinto pasa a la tabla y una regla por sede queda en otros", () => {
        expect(repartir([regla(1, "COMISION_LLAMADA", 1, 0.2), regla(2, "COMISION_LLAMADA", 2, 0.3)]).columnas).toHaveLength(1);
        const porSede = repartir([regla(1, "COMISION_LLAMADA", 1, 0.2), regla(2, "COMISION_LLAMADA", 1, 0.2, { idSucursal: 3 })]);
        expect(porSede.generales).toEqual([]);
        expect(porSede.otros).toHaveLength(2);
    });
});
