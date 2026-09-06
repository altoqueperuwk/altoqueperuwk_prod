import { describe, expect, it } from "vitest";
import type {
    OperacionCajaMovimiento,
    OperacionProceso,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import {
    getUnifiedFlowLabel,
    mergeMovimientos,
} from "./bancaria-bandeja-data";

const operation = (patch: Partial<OperacionProceso>): OperacionProceso => ({
    id: 1,
    dni_cliente: "12345678",
    nombre_cliente: "Cliente",
    nombre_codigo_servicio: "Efectivizacion",
    nombre_estado: "Pagado",
    monto_deposito_cliente: 100,
    monto_transferencia_cliente: 90,
    codigo_operacion_deposito_cliente: "OP-1",
    nombre_empresa_ingreso: "Empresa",
    nombre_empresa_salida: "Empresa",
    nombre_banco_empresa_cuenta_ingreso: "BCP",
    nombre_banco_empresa_cuenta_salida: "BCP",
    ruta_origen: "bcp",
    ruta_destino: "bcp",
    flag_derivado: false,
    flag_retenido: false,
    fecha_registro: "2026-09-05T10:00:00-05:00",
    ...patch,
});

const movement = (patch: Partial<OperacionCajaMovimiento>): OperacionCajaMovimiento => ({
    id: 1,
    id_caja: 32,
    id_operacion_caja_relacionada: null,
    id_operacion_proceso: 100,
    tipo_origen: "EFECTIVIZACION",
    tipo_movimiento: "INGRESO",
    nombre_codigo_servicio: "Efectivizacion",
    dni_cliente: "12345678",
    codigo_operacion: "OP-1",
    detalle: null,
    nombre_empresa: "Empresa",
    nombre_banco: "Scotiabank",
    monto_ingreso: 100,
    monto_gasto: 2,
    monto_ganancia: 8,
    monto_salida: 0,
    nombre_estado: "Pagado",
    tipo_facturacion: "Boleta",
    fecha_registro: "2026-09-05T10:00:00-05:00",
    ...patch,
});

describe("bancaria-bandeja-data", () => {
    it("clasifica los mismos flujos utilizados por la bandeja unificada", () => {
        expect(getUnifiedFlowLabel(operation({}), "bcp")).toBe("Efectivizacion");
        expect(getUnifiedFlowLabel(operation({ ruta_origen: "pos" }), "bcp")).toBe("POS");
        expect(getUnifiedFlowLabel(operation({ flag_derivado: true, ruta_origen: "bcp", ruta_destino: "bbva" }), "bcp"))
            .toBe("Derivados Enviados");
        expect(getUnifiedFlowLabel(operation({ flag_derivado: true, ruta_origen: "bbva", ruta_destino: "bcp" }), "bcp"))
            .toBe("Derivados Atendidos");
    });

    it("agrupa ingreso y salida igual que el datatable de movimientos", () => {
        const rows = mergeMovimientos([
            movement({ id: 1, tipo_movimiento: "INGRESO", monto_ingreso: 100, monto_gasto: 2 }),
            movement({ id: 2, tipo_movimiento: "SALIDA", monto_ingreso: 0, monto_salida: 90, monto_gasto: 1 }),
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id_operacion_proceso: 100,
            movimientos: ["INGRESO", "SALIDA"],
            monto_ingreso: 100,
            monto_salida: 90,
            monto_gasto: 3,
        });
    });
});
