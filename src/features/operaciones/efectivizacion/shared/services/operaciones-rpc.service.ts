import { supabase } from "@/lib/supabase";
import type {
    CajaOperativa,
    CajaOperativaCierre,
    OperacionBandejaBadge,
    OperacionCajaMovimiento,
    OperacionEmpresaBadge,
    OperacionProceso,
    RutaOperacionCaja,
    RutaOperacionKpi,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

const rpc = async <T>(fn: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, params);

    if (error) throw error;
    if (data && !Array.isArray(data) && typeof data === "object" && "error" in data) {
        throw new Error(String((data as Record<string, unknown>).error));
    }

    return data as T;
};

export const operacionesRpcService = {
    getRutaCajas(ruta: string) {
        return rpc<RutaOperacionCaja[]>("f_get_tb_ruta_operacion_caja", {
            p_ruta: ruta,
            p_id_estado: 1,
        });
    },

    getRutaKpi(ruta: string, idEmpresa?: number | null) {
        return rpc<RutaOperacionKpi[]>("f_get_tb_ruta_operacion_kpi", {
            p_ruta: ruta,
            p_id_empresa: idEmpresa ?? null,
            p_id_estado: 1,
        });
    },

    getOperacionBandejaBadges(params: Record<string, unknown>) {
        return rpc<OperacionBandejaBadge[]>("f_get_tb_operacion_bandeja_badges", params);
    },

    getOperacionEmpresaBadges(params: Record<string, unknown>) {
        return rpc<OperacionEmpresaBadge[]>("f_get_tb_operacion_empresa_badges", params);
    },

    getOperaciones(params: Record<string, unknown>) {
        return rpc<OperacionProceso[]>("f_get_tb_operacion_proceso", params);
    },

    getMovimientos(params: Record<string, unknown>) {
        return rpc<OperacionCajaMovimiento[]>("f_get_tb_operacion_caja", params);
    },

    postMovimientoCaja(params: Record<string, unknown>) {
        return rpc<OperacionCajaMovimiento>("f_post_tb_operacion_caja", params);
    },

    postTransferenciaCaja(params: Record<string, unknown>) {
        return rpc<Record<string, OperacionCajaMovimiento>>("f_post_tb_operacion_caja_transferencia", params);
    },

    postOperacionProceso(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_post_tb_operacion_proceso", params);
    },

    patchOperacionBase(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_base", params);
    },

    patchOperacionEstado(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_estado", params);
    },

    calcularOperacion(params: Record<string, unknown>) {
        return rpc<Record<string, number>>("f_get_tb_operacion_proceso_calculo", params);
    },

    syncRutaKpiCaja(ruta: string, idUsuario?: number | null) {
        return rpc<Record<string, unknown> | null>("f_sync_tb_ruta_operacion_kpi_caja", {
            p_ruta: ruta,
            p_id_usuario: idUsuario ?? null,
        });
    },

    postCajaCierre(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_post_tb_caja_operativa_cierre", params);
    },

    getCajaOperativa(params: Record<string, unknown>) {
        return rpc<CajaOperativa[]>("f_get_tb_caja_operativa", params);
    },

    getCajaCierres(params: Record<string, unknown>) {
        return rpc<CajaOperativaCierre[]>("f_get_tb_caja_operativa_cierre", params);
    },

    patchOperacionPagado(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_pagado", params);
    },

    patchOperacionReanudar(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_reanudar", params);
    },

    patchOperacionDirectoCaja(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_directo_caja", params);
    },

    patchOperacionDerivacion(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_derivacion", params);
    },

    patchOperacionUsuario(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_usuario", params);
    },

    patchOperacionEmpresa(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_empresa", params);
    },

    patchOperacionRetencion(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_retencion", params);
    },

    confirmarOperacionRetencion(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_confirmar_retencion", params);
    },

    patchPagoDeudaSalida(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_pago_deuda_salida", params);
    },

    postOperacionExcel(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_post_tb_operacion_proceso_excel", params);
    },

    postOperacionExcelGanancia(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_post_tb_operacion_proceso_excel_ganancia", params);
    },
};
