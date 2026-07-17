import { describe, expect, it, vi } from "vitest";
import {
    buildExcelPayload,
    buildOperacionDerivacionPayload,
    buildOperacionEmpresaIngresoPayload,
    buildOperacionEmpresaPayload,
    buildOperacionEmpresaSalidaPayload,
    buildOperacionPagadoPayload,
    buildPagoDeudaSalidaPayload,
} from "./rpc-payloads";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

const company: RutaOperacionCaja = {
    id: 10,
    ruta: "bcp",
    id_empresa: 1,
    nombre_empresa: "Empresa A",
    id_empresa_cuenta_bancaria: 2,
    id_banco: 3,
    nombre_banco: "BCP",
    id_caja: 4,
    flag_caja_ingreso_principal: true,
    id_estado: 1,
    nombre_estado: "Activo",
    id_usuario: null,
    nombre_usuario: null,
    fecha_registro: "2026-07-13",
};

const user = { userId: 99, userName: "Operador" };

describe("rpc-payloads", () => {
    it("builds pagado payload", () => {
        expect(buildOperacionPagadoPayload(7, { id: 5, nombre: "Pagado" }, user)).toEqual({
            p_id: 7,
            p_id_estado: 5,
            p_nombre_estado: "Pagado",
            p_id_usuario_gestor: 99,
            p_nombre_usuario_gestor: "Operador",
        });
    });

    it("builds derivacion payload with current timestamp", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));

        expect(buildOperacionDerivacionPayload(7, "bcp", "bbva", user)).toEqual({
            p_id: 7,
            p_ruta_origen: "bcp",
            p_ruta_destino: "bbva",
            p_flag_derivado: true,
            p_fecha_derivacion: "2026-07-13T12:00:00.000Z",
            p_id_usuario_deriva: 99,
            p_nombre_usuario_deriva: "Operador",
        });

        vi.useRealTimers();
    });

    it("builds empresa payload from route company", () => {
        expect(buildOperacionEmpresaPayload(7, company, user)).toMatchObject({
            p_id: 7,
            p_id_empresa_ingreso: 1,
            p_nombre_empresa_ingreso: "Empresa A",
            p_id_empresa_cuenta_ingreso: 2,
            p_id_banco_empresa_cuenta_ingreso: 3,
            p_nombre_banco_empresa_cuenta_ingreso: "BCP",
            p_id_empresa_salida: 1,
            p_id_empresa_cuenta_salida: 2,
        });
    });

    it("builds empresa salida payload without ingreso fields", () => {
        expect(buildOperacionEmpresaSalidaPayload(7, company, user)).toEqual({
            p_id: 7,
            p_id_empresa_salida: 1,
            p_nombre_empresa_salida: "Empresa A",
            p_id_empresa_cuenta_salida: 2,
            p_id_banco_empresa_cuenta_salida: 3,
            p_nombre_banco_empresa_cuenta_salida: "BCP",
            p_id_banco_cliente_transferencia: 3,
            p_nombre_banco_cliente_transferencia: "BCP",
            p_id_usuario_gestor: 99,
            p_nombre_usuario_gestor: "Operador",
        });
    });

    it("builds empresa ingreso payload without salida fields", () => {
        expect(buildOperacionEmpresaIngresoPayload(7, company, user)).toEqual({
            p_id: 7,
            p_id_empresa_ingreso: 1,
            p_nombre_empresa_ingreso: "Empresa A",
            p_id_empresa_cuenta_ingreso: 2,
            p_id_banco_empresa_cuenta_ingreso: 3,
            p_nombre_banco_empresa_cuenta_ingreso: "BCP",
            p_id_usuario_gestor: 99,
            p_nombre_usuario_gestor: "Operador",
        });
    });

    it("builds pago deuda salida payload", () => {
        expect(buildPagoDeudaSalidaPayload(7, company, "bcp", user)).toEqual({
            p_id_operacion: 7,
            p_id_empresa_salida: 1,
            p_id_empresa_cuenta_salida: 2,
            p_id_usuario_gestor: 99,
            p_nombre_usuario_gestor: "Operador",
            p_ruta_destino: "bcp",
        });
    });

    it("builds excel payload", () => {
        expect(
            buildExcelPayload({
                activeCompany: company,
                rows: [
                    {
                        dni: "12345678",
                        monto: "100",
                        codigo_operacion: "OP1",
                        fecha_pago: "2026-07-13",
                        hora_proceso: "",
                        nombre_cliente_banco_ingreso: "BCP",
                        estado: "",
                    },
                ],
                selectedCommunity: { id: 8, nombre: "Comunidad" },
                service: { id: 9, nombre: "Efectivizacion" },
                user,
                ruta: "bcp",
            }),
        ).toMatchObject({
            p_id_codigo_servicio: 9,
            p_id_comunidad: 8,
            p_id_empresa_ingreso: 1,
            p_id_banco: 3,
            p_id_usuario: 99,
            p_ruta_actual: "bcp",
        });
    });
});
