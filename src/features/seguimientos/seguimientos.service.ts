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

export interface SeguimientoPaginado {
    rows: OperacionProceso[];
    total: number;
    total_paginas: number;
    tiempo_menor_una_hora: number;
    tiempo_entre_una_y_dos_horas: number;
    tiempo_mayor_igual_dos_horas: number;
    total_pendientes: number;
    total_cerradas?: number;
}

export interface SeguimientoOperacionesUnificado extends SeguimientoPaginado {}

export const seguimientosService = {
    getOperacionesUnificadoPaginado(params: {
        ruta?: string | null;
        flujo?: string | null;
        dni?: string;
        codigo?: string;
        filtroTiempo?: string;
        filtroCierre?: string;
        page: number;
        pageSize: number;
    }) {
        return rpc<SeguimientoOperacionesUnificado>("f_get_tb_seguimiento_operaciones_paginado", {
            p_ruta: params.ruta ?? null,
            p_flujo: params.flujo ?? null,
            p_dni_cliente: params.dni || null,
            p_codigo_operacion: params.codigo || null,
            p_filtro_tiempo: params.filtroTiempo ?? "Todos",
            p_page: params.page,
            p_page_size: params.pageSize,
            p_filtro_cierre: params.filtroCierre ?? "ABIERTAS",
        });
    },
    getEfectivizacionPaginado(params: { tab: string; ruta?: string | null; filtroEstado?: string; dni?: string; codigo?: string; filtroTiempo?: string; page: number; pageSize: number }) {
        return rpc<SeguimientoPaginado>("f_get_tb_seguimiento_efectivizacion_paginado", {
            p_tab: params.tab,
            p_ruta: params.ruta ?? null,
            p_filtro_estado: params.filtroEstado ?? "Todos",
            p_dni_cliente: params.dni || null,
            p_codigo_operacion: params.codigo || null,
            p_filtro_tiempo: params.filtroTiempo ?? "Todos",
            p_page: params.page,
            p_page_size: params.pageSize,
        });
    },
    getPagoDeudaPaginado(params: { ruta?: string | null; filtroEstado?: string; dni?: string; codigo?: string; filtroTiempo?: string; filtroCierre?: string; page: number; pageSize: number }) {
        return rpc<SeguimientoPaginado>("f_get_tb_seguimiento_pago_deuda_paginado", {
            p_tab: "Pago Deuda",
            p_ruta: params.ruta ?? null,
            p_filtro_estado: params.filtroEstado ?? "Todos",
            p_dni_cliente: params.dni || null,
            p_codigo_operacion: params.codigo || null,
            p_filtro_tiempo: params.filtroTiempo ?? "Todos",
            p_page: params.page,
            p_page_size: params.pageSize,
            p_filtro_cierre: params.filtroCierre ?? "ABIERTAS",
        });
    },
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
