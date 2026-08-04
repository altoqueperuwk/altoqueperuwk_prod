import { supabase } from "@/lib/supabase";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

const rpc = async <T>(fn: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, params);
    if (error) throw error;
    return data as T;
};

export interface SeguimientoEfectivizacionKpi {
    total_operaciones_pendientes: number;
    total_operaciones_pagados: number;
    total_monto_depositos: number;
    total_monto_comisiones: number;
    total_monto_transferencia: number;
}

export interface SeguimientoPagoDeudaKpi {
    total_operaciones_pendientes: number;
    total_operaciones_pagados: number;
    total_monto_solicitados: number;
    total_comisiones: number;
    total_monto_devueltos: number;
}

export const seguimientosService = {
    getEfectivizacionKpi() {
        return rpc<SeguimientoEfectivizacionKpi[]>("f_get_tb_seguimiento_efectivizacion_kpi", { p_filtro_estado: "Todos" });
    },
    getEfectivizacionBandeja(params: { tab: string; filtroEstado?: string; dni?: string; codigo?: string }) {
        return rpc<OperacionProceso[]>("f_get_tb_seguimiento_efectivizacion_bandeja", {
            p_tab: params.tab,
            p_filtro_estado: params.filtroEstado ?? "Todos",
            p_dni_cliente: params.dni || null,
            p_codigo_operacion: params.codigo || null,
        });
    },
    getPagoDeudaKpi() {
        return rpc<SeguimientoPagoDeudaKpi[]>("f_get_tb_seguimiento_pago_deuda_kpi", {});
    },
    getPagoDeudaBandeja(params: { filtroEstado?: string; dni?: string; codigo?: string }) {
        return rpc<OperacionProceso[]>("f_get_tb_seguimiento_pago_deuda_bandeja", {
            p_filtro_estado: params.filtroEstado ?? "Todos",
            p_dni_cliente: params.dni || null,
            p_codigo_operacion: params.codigo || null,
        });
    },
};
