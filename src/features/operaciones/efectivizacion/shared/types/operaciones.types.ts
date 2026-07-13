export type OperacionRuta =
    | "bcp"
    | "bbva"
    | "scotiabank"
    | "banbif"
    | "interbank"
    | "safetypay"
    | "pos"
    | "linkpago";

export type OperacionRutaBancaria = Exclude<OperacionRuta, "pos" | "linkpago">;

export interface RutaOperacionCaja {
    id: number;
    ruta: string;
    id_empresa: number;
    nombre_empresa: string;
    id_empresa_cuenta_bancaria: number;
    id_banco: number;
    nombre_banco: string;
    id_caja: number | null;
    flag_caja_ingreso_principal: boolean;
    id_estado: number;
    nombre_estado: string;
    id_usuario: number | null;
    nombre_usuario: string | null;
    fecha_registro: string;
}

export interface RutaOperacionKpi {
    id: number;
    ruta: string;
    caja_inicial: number;
    caja_actual: number;
    total_recaudado: number;
    ingresos: number;
    salidas: number;
    gastos_operacionales: number;
    ganancias: number;
    ingresos_retenidos: number;
    pendiente_depositar: number;
    total_efectivizacion: number;
    total_pago_deuda: number;
    id_estado: number;
    nombre_estado: string;
    id_usuario: number | null;
    nombre_usuario: string | null;
    fecha_registro: string;
}

export interface OperacionProceso {
    id: number;
    id_codigo_servicio?: number | null;
    tipo_servicio?: string | null;
    id_comunidad?: number | null;
    nombre_comunidad?: string | null;
    id_tipo_deposito?: number | null;
    nombre_tipo_deposito?: string | null;
    id_cliente?: number | null;
    dni_cliente: string | null;
    nombre_cliente: string | null;
    nombre_codigo_servicio: string | null;
    id_estado?: number | null;
    nombre_estado: string | null;
    monto_deposito_cliente: number | null;
    monto_transferencia_cliente: number | null;
    comision_servicio?: number | null;
    monto_minimo_deposito_servicio?: number | null;
    comision_minima_servicio?: number | null;
    comision_monto_extra_servicio?: number | null;
    resultado_comision_servicio?: number | null;
    flag_por_sol_comision_banco_ingreso?: boolean | null;
    comision_banco_ingreso?: number | null;
    comision_minimo_banco_ingreso?: number | null;
    comision_igv_banco_ingreso?: number | null;
    resultado_comision_banco_ingreso?: number | null;
    monto_itf_ingreso?: number | null;
    comision_transf_banco_salida?: number | null;
    comision_transf_inter_banco_salida?: number | null;
    resultado_comision_banco_salida?: number | null;
    monto_itf_salida?: number | null;
    codigo_operacion_deposito_cliente: string | null;
    id_empresa_ingreso?: number | null;
    nombre_empresa_ingreso: string | null;
    id_empresa_cuenta_ingreso?: number | null;
    id_banco_empresa_cuenta_ingreso?: number | null;
    nombre_empresa_salida: string | null;
    id_empresa_salida?: number | null;
    id_empresa_cuenta_salida?: number | null;
    id_banco_empresa_cuenta_salida?: number | null;
    nombre_banco_empresa_cuenta_ingreso: string | null;
    nombre_banco_empresa_cuenta_salida: string | null;
    id_banco_cliente_transferencia?: number | null;
    nombre_banco_cliente_transferencia?: string | null;
    tipo_facturacion?: string | null;
    nombre_usuario_gestor?: string | null;
    nombre_usuario_solicitud?: string | null;
    nombre_usuario_deriva?: string | null;
    nombre_usuario_retiene?: string | null;
    ruta_origen: string | null;
    ruta_destino: string | null;
    flag_derivado: boolean;
    flag_retenido: boolean;
    fecha_deposito_cliente?: string | null;
    fecha_pendiente?: string | null;
    fecha_pagado?: string | null;
    fecha_derivacion?: string | null;
    fecha_retencion?: string | null;
    motivo_retencion?: string | null;
    fecha_registro: string;
}

export interface OperacionCajaMovimiento {
    id: number;
    id_caja: number;
    tipo_origen: string;
    tipo_movimiento: string;
    nombre_codigo_servicio: string | null;
    dni_cliente: string | null;
    codigo_operacion: string | null;
    detalle: string | null;
    nombre_empresa: string;
    nombre_banco: string;
    monto_ingreso: number;
    monto_gasto: number;
    monto_ganancia: number;
    monto_salida: number;
    nombre_estado: string;
    fecha_registro: string;
}

export interface CajaOperativa {
    id: number;
    id_empresa: number;
    nombre_empresa: string;
    id_empresa_cuenta_bancaria: number;
    id_banco: number;
    nombre_banco: string;
    saldo_inicial: number;
    saldo_total: number;
    saldo_actual: number;
    total_recaudado: number;
    ingresos: number;
    ingresos_retenido: number;
    gastos: number;
    ganancia: number;
    ganancia_retenido: number;
    salida: number;
    operaciones: number;
    flag_retencion: boolean;
    id_estado: number;
    nombre_estado: string;
    id_usuario: number | null;
    nombre_usuario: string | null;
    fecha_apertura: string;
    fecha_registro: string;
}

export interface CajaOperativaCierre {
    id: number;
    id_caja: number;
    id_empresa: number;
    nombre_empresa: string;
    id_empresa_cuenta_bancaria: number;
    id_banco: number;
    nombre_banco: string;
    saldo_inicial: number;
    saldo_total: number;
    saldo_actual: number;
    total_recaudado: number;
    ingresos: number;
    ingresos_retenido: number;
    gastos: number;
    ganancia: number;
    ganancia_retenido: number;
    salida: number;
    operaciones: number;
    id_estado: number;
    nombre_estado: string;
    id_usuario: number | null;
    nombre_usuario: string | null;
    fecha_apertura: string;
    fecha_cierre: string;
    kpi_snapshot: Record<string, unknown> | null;
    fecha_registro: string;
}
