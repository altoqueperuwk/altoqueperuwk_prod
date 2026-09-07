import { describe, expect, it } from "vitest";
import { getReporteEfectivizacionUnificada } from "./reporte-efectivizacion";

describe("getReporteEfectivizacionUnificada", () => {
    it("muestra la empresa y cuenta destino en derivados enviados", () => {
        const report = getReporteEfectivizacionUnificada({
            empresa: "Hueso Cash S.A.",
            banco: "BCP",
            efectivizacion: [{
                tipo_facturacion: "Boleta",
                codigo_operacion_deposito_cliente: "5564045",
                dni_cliente: "01839114",
                empresa: "A Cuenta WK S.A.",
                cuenta: "Banbif",
                empresa_derivada: "Hueso Cash S.A.",
                cuenta_derivada: "BCP",
                derivada_congelada: true,
                nombre_estado: "Pagado",
            }],
        });

        expect(report.efectivizacion).toHaveLength(0);
        expect(report.derivadosEnviados).toHaveLength(1);
        expect(report.derivadosEnviados[0]).toMatchObject({
            empresa: "A Cuenta WK S.A.",
            cuenta: "Banbif",
            operacion: "5564045",
        });
    });

    it("conserva la información de derivados atendidos", () => {
        const report = getReporteEfectivizacionUnificada({
            empresa: "A Cuenta WK S.A.",
            banco: "Banbif",
            derivados: [{
                tipo_facturacion: "Boleta",
                codigo_operacion_deposito_cliente: "202607301153",
                empresa: "Hueso Cash S.A.",
                cuenta: "BCP",
                nombre_estado: "Pagado",
            }],
        });

        expect(report.derivadosAtendidos[0]).toMatchObject({
            empresa: "Hueso Cash S.A.",
            cuenta: "BCP",
            operacion: "202607301153",
        });
    });
});
