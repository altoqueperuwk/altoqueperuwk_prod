import { describe, expect, it } from "vitest";
import { getReporteCierreEmpresaSummary } from "./reporte-cierre-caja-summary";

describe("getReporteCierreEmpresaSummary", () => {
    it("agrupa los ingresos y salidas del reporte usando Empresa/Cuenta visibles", () => {
        const summary = getReporteCierreEmpresaSummary({
            efectivizacion: [{ empresa: "Hueso Cash S.A.", cuenta: "BCP", transferencia: 195440.35 }],
            derivados: [{ empresa: "A Cuenta WK S.A.", cuenta: "Banbif", transferencia: 64559.26 }],
            movimientos: [
                { tipo_origen: "OTROS", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", nombre_empresa_contraparte: "Capital Nova S.A.", nombre_banco_contraparte: "BCP", monto_ingreso: 2000, monto_salida: 0 },
                { tipo_origen: "OTROS", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", nombre_empresa_contraparte: "Fluxopay S.A.", nombre_banco_contraparte: "BBVA", monto_ingreso: 5000, monto_salida: 0 },
                { tipo_origen: "OTROS", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", nombre_empresa_contraparte: "Impulsa Capital Corp S.A.", nombre_banco_contraparte: "BBVA", monto_ingreso: 0, monto_salida: 7000 },
                { tipo_origen: "OTROS", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", nombre_empresa_contraparte: "TwoService (1) S.A.", nombre_banco_contraparte: "Interbank", monto_ingreso: 0, monto_salida: 800 },
                { tipo_origen: "DIRECTO_CAJA", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", monto_ingreso: 10000, monto_salida: 0 },
                { tipo_origen: "DIRECTO_CAJA", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", monto_ingreso: 30000, monto_salida: 0 },
                { tipo_origen: "DIRECTO_CAJA", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", monto_ingreso: 30000, monto_salida: 0 },
                { tipo_origen: "DIRECTO_CAJA", nombre_empresa: "Hueso Cash S.A.", nombre_banco: "BCP", monto_ingreso: 500, monto_salida: 0 },
            ],
        });

        expect(summary.ingresos).toEqual([
            { empresa: "Capital Nova S.A.", cuenta: "BCP", monto: 2000 },
            { empresa: "Fluxopay S.A.", cuenta: "BBVA", monto: 5000 },
            { empresa: "Hueso Cash S.A.", cuenta: "BCP", monto: 70500 },
        ]);
        expect(summary.salidas).toEqual([
            { empresa: "A Cuenta WK S.A.", cuenta: "Banbif", monto: 64559.26 },
            { empresa: "Impulsa Capital Corp S.A.", cuenta: "BBVA", monto: 7000 },
            { empresa: "TwoService (1) S.A.", cuenta: "Interbank", monto: 800 },
            { empresa: "Hueso Cash S.A.", cuenta: "BCP", monto: 195440.35 },
        ]);
        expect(summary.ingresos.reduce((total, row) => total + row.monto, 0)).toBe(77500);
        expect(summary.salidas.reduce((total, row) => total + row.monto, 0)).toBeCloseTo(267799.61, 2);
    });

    it("agrupa repetidos, incluye transferencias internas y excluye derivados enviados", () => {
        const summary = getReporteCierreEmpresaSummary({
            efectivizacion: [{ derivada_congelada: true, empresa: "A Cuenta WK S.A.", cuenta: "Banbif", transferencia: 999 }],
            pos: [{ empresa: "Hueso Cash S.A.", cuenta: "BCP", transferencia: 5 }],
            pago_deuda: [{ empresa_salida: "Hueso Cash S.A.", cuenta_salida: "BCP", transferencia: 7 }],
            movimientos: [
                { tipo_origen: "OTROS", nombre_empresa_contraparte: "Capital Nova S.A.", nombre_banco_contraparte: "BCP", monto_ingreso: 100, monto_salida: 0 },
                { tipo_origen: "OTROS", nombre_empresa_contraparte: "capital nova s.a.", nombre_banco_contraparte: "bcp", monto_ingreso: 50, monto_salida: 0 },
                { tipo_origen: "TRANSFERENCIA_INTERNA", nombre_empresa_relacionada: "Fluxopay S.A.", nombre_banco_relacionada: "BBVA", monto_ingreso: 25, monto_salida: 0 },
            ],
        });

        expect(summary.ingresos).toEqual([
            { empresa: "Capital Nova S.A.", cuenta: "BCP", monto: 150 },
            { empresa: "Fluxopay S.A.", cuenta: "BBVA", monto: 25 },
        ]);
        expect(summary.salidas).toEqual([
            { empresa: "Hueso Cash S.A.", cuenta: "BCP", monto: 12 },
        ]);
    });
});
