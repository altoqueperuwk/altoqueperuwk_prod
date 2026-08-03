import { supabase } from "@/lib/supabase";
import type {
    CajaOperativa,
    CajaOperativaCierre,
    OperacionAsistidaKpi,
    OperacionBandejaBadge,
    OperacionCargaExcelRollback,
    OperacionCajaMovimiento,
    OperacionEmpresaBadge,
    OperacionProceso,
    RecaudacionOperacionInfo,
    RecaudacionReglaAbono,
    RutaOperacionCaja,
    RutaOperacionKpi,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

const formatMoney = (value: unknown) => {
    const amount = Number(value ?? 0);
    return `S/ ${Number.isFinite(amount) ? amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
};

const buildRpcErrorMessage = (payload: Record<string, unknown>) => {
    if (payload.codigo === "SALDO_INSUFICIENTE") {
        return `Saldo insuficiente en caja actual. Disponible: ${formatMoney(payload.saldo_disponible)}. Requerido: ${formatMoney(payload.monto_requerido)}.`;
    }

    return String(payload.error ?? "Error en la operacion.");
};

const normalizeRpcErrorMessage = (message: string) => {
    if (message.includes("SALDO_INSUFICIENTE")) {
        const disponible = message.match(/Disponible:\s*([0-9.-]+)/i)?.[1];
        const requerido = message.match(/Requerido:\s*([0-9.-]+)/i)?.[1];

        if (disponible || requerido) {
            return `Saldo insuficiente en caja actual. Disponible: ${formatMoney(disponible)}. Requerido: ${formatMoney(requerido)}.`;
        }

        return "Saldo insuficiente en caja actual.";
    }

    return message;
};

const rpc = async <T>(fn: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, params);

    if (error) throw new Error(normalizeRpcErrorMessage(error.message));
    if (data && !Array.isArray(data) && typeof data === "object" && "error" in data) {
        throw new Error(buildRpcErrorMessage(data as Record<string, unknown>));
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

    getRutaKpi(ruta: string, idEmpresa?: number | null, idEmpresaCuentaBancaria?: number | null) {
        return rpc<RutaOperacionKpi[]>("f_get_tb_ruta_operacion_kpi", {
            p_ruta: ruta,
            p_id_empresa: idEmpresa ?? null,
            p_id_empresa_cuenta_bancaria: idEmpresaCuentaBancaria ?? null,
            p_id_estado: 1,
        });
    },

    getOperacionBandejaBadges(params: Record<string, unknown>) {
        return rpc<OperacionBandejaBadge[]>("f_get_tb_operacion_bandeja_badges", params);
    },

    getOperacionRetencionBandejaBadges(params: Record<string, unknown>) {
        return rpc<OperacionBandejaBadge[]>("f_get_tb_operacion_retencion_bandeja_badges", params);
    },

    getOperacionEmpresaBadges(params: Record<string, unknown>) {
        return rpc<OperacionEmpresaBadge[]>("f_get_tb_operacion_empresa_badges", params);
    },

    getOperacionRetencionEmpresaBadges(params: Record<string, unknown>) {
        return rpc<OperacionEmpresaBadge[]>("f_get_tb_operacion_retencion_empresa_badges", params);
    },

    getOperaciones(params: Record<string, unknown>) {
        return rpc<OperacionProceso[]>("f_get_tb_operacion_proceso", params);
    },

    getOperacionAsistidaKpi(params: Record<string, unknown>) {
        return rpc<OperacionAsistidaKpi[]>("f_get_tb_operacion_asistida_kpi", params);
    },

    getOperacionAsistidaBandeja(params: Record<string, unknown>) {
        return rpc<OperacionProceso[]>("f_get_tb_operacion_asistida_bandeja", params);
    },

    getOperacionesRetencionBandeja(params: Record<string, unknown>) {
        return rpc<OperacionProceso[]>("f_get_tb_operacion_retencion_bandeja", params);
    },

    getOperacionCargaExcelRollback(params: Record<string, unknown>) {
        return rpc<OperacionCargaExcelRollback[]>("f_get_tb_operacion_carga_excel_rollback", params);
    },

    deleteOperacionCargaExcelRollback(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_delete_tb_operacion_carga_excel_rollback", params);
    },

    getPagoDeudaBandeja(params: Record<string, unknown>) {
        return rpc<OperacionProceso[]>("f_get_tb_pago_deuda_bandeja", params);
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

    deleteMovimientoCajaManual(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_delete_tb_operacion_caja_manual", params);
    },

    postOperacionProceso(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_post_tb_operacion_proceso", params);
    },

    postOperacionAsistida(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_post_tb_operacion_asistida", params);
    },

    patchOperacionAsistida(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_asistida", params);
    },

    patchOperacionBase(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_base", params);
    },

    patchOperacionComisionExtra(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_comision_extra", params);
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

    deleteUltimoCierreCajaDia(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_delete_tb_caja_operativa_cierre_ultimo_dia", params);
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

    deleteOperacionProceso(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_patch_tb_operacion_proceso_eliminar", params);
    },

    restoreOperacionProceso(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_restaurar", params);
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

    patchOperacionTipoRecaudacionSafetyPay(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_tipo_recaudacion_sf", params);
    },

    confirmarOperacionRetencion(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_confirmar_retencion", params);
    },

    retornarRetencion(params: Record<string, unknown>) {
        return rpc<OperacionProceso>("f_patch_tb_operacion_proceso_retornar_retencion", params);
    },

    getReglaAbono(params: Record<string, unknown>) {
        return rpc<RecaudacionReglaAbono[]>("f_get_tb_recaudacion_regla_abono", params);
    },

    patchReglaAbono(params: Record<string, unknown>) {
        return rpc<RecaudacionReglaAbono>("f_patch_tb_recaudacion_regla_abono", params);
    },

    runLiberarRetenciones(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_run_tb_recaudacion_liberar_retenciones", params);
    },

    getRecaudacionOperacionInfo(params: Record<string, unknown>) {
        return rpc<RecaudacionOperacionInfo[]>("f_get_tb_recaudacion_operacion_info", params);
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

    getReporteCierre(params: Record<string, unknown>) {
        return rpc<Record<string, unknown>>("f_get_reporte_cierre", params);
    },
};
