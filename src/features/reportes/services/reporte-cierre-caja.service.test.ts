import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
    supabase: { rpc: rpcMock },
}));

import { getReporteCierreHistorico } from "./reporte-cierre-caja.service";

const operation = (patch: Record<string, unknown>) => ({
    id: 1,
    tipo_servicio: "EFECTIVIZACION",
    tipo_facturacion: "Boleta",
    dni_cliente: "12345678",
    nombre_estado: "Pagado",
    codigo_operacion_deposito_cliente: "OP-1",
    nombre_comunidad: "ATK1",
    monto_deposito_cliente: 100,
    monto_transferencia_cliente: 90,
    comision_servicio: 1,
    resultado_comision_servicio: 1,
    resultado_comision_banco_ingreso: 1,
    resultado_comision_banco_salida: 1,
    nombre_empresa_ingreso: "Capital Nova S.A.",
    nombre_banco_empresa_cuenta_ingreso: "Scotiabank",
    nombre_empresa_salida: "Capital Nova S.A.",
    nombre_banco_empresa_cuenta_salida: "Scotiabank",
    ruta_origen: "scotiabank",
    ruta_destino: "scotiabank",
    flag_derivado: false,
    flag_retenido: false,
    fecha_deposito_cliente: "2026-09-05T10:00:00-05:00",
    fecha_registro: "2026-09-05T10:00:00-05:00",
    ...patch,
});

describe("getReporteCierreHistorico", () => {
    beforeEach(() => rpcMock.mockReset());

    it("arma el reporte con las mismas fuentes históricas de las bandejas", async () => {
        rpcMock.mockImplementation((functionName: string) => {
            const dataByFunction: Record<string, unknown> = {
                f_get_tb_operacion_bandeja_unificada: [
                    operation({ id: 1 }),
                    operation({
                        id: 2,
                        flag_derivado: true,
                        ruta_destino: "bcp",
                        nombre_empresa_salida: "Empresa Destino",
                        nombre_banco_empresa_cuenta_salida: "BCP",
                        nombre_empresa_salida_origen: "Capital Nova S.A.",
                        nombre_banco_empresa_cuenta_salida_origen: "Scotiabank",
                    }),
                    operation({
                        id: 3,
                        flag_derivado: true,
                        ruta_origen: "bcp",
                        nombre_empresa_salida_origen: "Empresa Origen",
                        nombre_banco_empresa_cuenta_salida_origen: "BCP",
                    }),
                    operation({ id: 4, ruta_origen: "pos" }),
                ],
                f_get_tb_pago_deuda_bandeja: [
                    operation({
                        id: 5,
                        tipo_servicio: "PAGO DEUDA",
                        tipo_flujo_pago_deuda: "BANCO",
                        pd_retorno_nombre_empresa_ingreso: "Empresa Retorno",
                        pd_retorno_nombre_banco_empresa_cuenta_ingreso: "BBVA",
                        pd_retorno_monto_devolucion: 90,
                    }),
                ],
                f_get_tb_operacion_caja: [
                    {
                        id: 10,
                        id_caja: 32,
                        id_operacion_proceso: 1,
                        tipo_origen: "EFECTIVIZACION",
                        tipo_movimiento: "INGRESO",
                        nombre_codigo_servicio: "Efectivizacion",
                        dni_cliente: "12345678",
                        codigo_operacion: "OP-1",
                        nombre_empresa: "Capital Nova S.A.",
                        nombre_banco: "Scotiabank",
                        monto_ingreso: 100,
                        monto_salida: 0,
                        monto_gasto: 1,
                        monto_ganancia: 8,
                        nombre_estado: "Pagado",
                        tipo_facturacion: "Boleta",
                        fecha_registro: "2026-09-05T10:00:00-05:00",
                    },
                ],
                f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2: [{ caja_inicial: 1000, ganancias: 10 }],
                f_get_tb_ruta_operacion_gastos_salida_v2: 2,
                f_get_tb_ruta_operacion_ganancias_efectivizacion_v2: [{ ganancias: 25 }],
            };

            return Promise.resolve({ data: dataByFunction[functionName], error: null });
        });

        const report = await getReporteCierreHistorico({
            idCaja: 32,
            idCajaCierre: 366,
            idEmpresa: 5,
            idEmpresaCuentaBancaria: 33,
            idBanco: 3,
            ruta: "scotiabank",
            nombreEmpresa: "Capital Nova S.A.",
            nombreBanco: "Scotiabank",
            fechaCierre: "2026-09-05",
        });

        expect(rpcMock.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining([
            "f_get_tb_operacion_bandeja_unificada",
            "f_get_tb_pago_deuda_bandeja",
            "f_get_tb_operacion_caja",
            "f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2",
        ]));
        expect(report.efectivizacion).toHaveLength(2);
        expect(report.derivados).toHaveLength(1);
        expect(report.pos).toHaveLength(1);
        expect(report.pago_deuda).toHaveLength(1);
        expect(report.movimientos).toHaveLength(1);
        expect((report.efectivizacion as Array<Record<string, unknown>>)[1]).toMatchObject({
            flujo: "Derivados Enviados",
            empresa: "Empresa Destino",
            cuenta: "BCP",
        });
        expect((report.derivados as Array<Record<string, unknown>>)[0]).toMatchObject({
            flujo: "Derivados Atendidos",
            empresa: "Empresa Origen",
            cuenta: "BCP",
        });
        expect(report.kpi).toMatchObject({ ganancias: 25, gastos_banco_salida: 2 });
        expect(report.retenciones).toEqual([]);
    });

    it("conserva la transferencia real de los derivados enviados de SafetyPay", async () => {
        const safetyOperation = operation({
            id: 5564045,
            monto_deposito_cliente: 4000,
            monto_transferencia_cliente: 3920,
            nombre_empresa_ingreso: "SafetyPay",
            nombre_banco_empresa_cuenta_ingreso: "Interbank",
            nombre_empresa_salida: "TwoService (1) S.A.",
            nombre_banco_empresa_cuenta_salida: "Interbank",
            ruta_origen: "safetypay",
            ruta_destino: "interbank",
            flag_derivado: true,
        });

        rpcMock.mockImplementation((functionName: string) => {
            const dataByFunction: Record<string, unknown> = {
                f_get_tb_operacion_bandeja_unificada: [safetyOperation],
                f_get_tb_pago_deuda_bandeja: [],
                f_get_tb_operacion_caja: [],
                f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2: [],
                f_get_tb_ruta_operacion_gastos_salida_v2: 0,
                f_get_tb_ruta_operacion_kpi_safetypay: {
                    caja_recaudacion: 4000,
                    ganancias: 0,
                    salidas: 3920,
                    gastos_operacionales: 0,
                    pendiente_transferencia: 0,
                    empresas_derivadas: [{ empresa: "TwoService (1) S.A.", cuenta: "Interbank", monto: 3920 }],
                    total_transferencia: 1,
                },
            };

            return Promise.resolve({ data: dataByFunction[functionName] ?? [], error: null });
        });

        const report = await getReporteCierreHistorico({
            idCaja: 32,
            idCajaCierre: 366,
            idEmpresa: 14,
            idEmpresaCuentaBancaria: 24,
            idBanco: 5,
            ruta: "safetypay",
            nombreEmpresa: "SafetyPay",
            nombreBanco: "Interbank",
            fechaCierre: "2026-09-05",
        });

        expect(report.safetypay_kpi).toMatchObject({
            salidas: 3920,
            total_transferencia: 1,
        });
        const effectRows = report.efectivizacion as Array<Record<string, unknown>>;
        expect(effectRows[0]).toMatchObject({
            flujo: "Derivados Enviados",
            transferencia: 3920,
        });
    });
});
