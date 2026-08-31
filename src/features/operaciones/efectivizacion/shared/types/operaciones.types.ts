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
    flag_retencion_cuenta?: boolean | null;
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
    fuera_horario: number;
    pendiente_depositar: number;
    total_efectivizacion: number;
    total_pago_deuda: number;
    id_estado: number;
    nombre_estado: string;
    id_usuario: number | null;
    nombre_usuario: string | null;
    fecha_registro: string;
    caja_recaudacion?: number | null;
    pendiente_transferencia?: number | null;
    gastos_banco_salida?: number | null;
}

export interface RutaGananciaEspecial {
    ganancias: number;
    id_caja_cierre_referencia: number | null;
    fecha_cierre_referencia: string | null;
}

export interface OperacionAsistidaKpi {
    ruta: string;
    comisiones: number;
    gastos: number;
    ganancia: number;
    salidas: number;
    total_operaciones: number;
    total_pagadas: number;
}

export interface OperacionBandejaBadge {
    tab: string;
    cantidad: number;
}

export interface OperacionEmpresaBadge {
    tab: string;
    id_empresa: number;
    cantidad: number;
}

export interface OperacionCargaExcelRollback {
    id: number;
    nombre_excel: string;
    fecha_carga: string;
    ruta: string | null;
    id_empresa: number | null;
    empresa: string | null;
    id_empresa_cuenta_bancaria: number | null;
    total_operaciones: number;
    disponible: boolean;
    detalle: string;
    operaciones_no_pendientes?: number | null;
    movimientos_cerrados?: number | null;
}

export interface RecaudacionReglaAbono {
    id: number;
    ruta: string;
    id_empresa: number;
    id_empresa_cuenta_bancaria: number;
    hora_corte: string;
    dias_habiles_abono: number;
    hora_liberacion: string;
    base_calculo_abono: string;
    flag_liberacion_automatica: boolean;
    id_estado: number;
    empresa?: string | null;
    banco?: string | null;
    estado?: string | null;
    id_usuario?: number | null;
    fecha_registro?: string | null;
    fecha_actualizacion?: string | null;
}

export interface RecaudacionOperacionInfo {
    id_operacion: number;
    fecha_corte_recaudacion?: string | null;
    fecha_estimada_abono?: string | null;
    fecha_liberacion_abono?: string | null;
    flag_liberable_abono?: boolean | null;
    estado_lote_abono?: string | null;
}

export interface OperacionProceso {
    id: number;
    id_codigo_servicio?: number | null;
    tipo_servicio?: string | null;
    id_comunidad?: number | null;
    nombre_comunidad?: string | null;
    nombre_tipo_deposito?: string | null;
    id_cliente?: number | null;
    dni_cliente: string | null;
    nombre_cliente: string | null;
    email_cliente?: string | null;
    numero_tarjeta?: string | null;
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
    id_empresa_salida_origen?: number | null;
    nombre_empresa_salida_origen?: string | null;
    id_empresa_cuenta_salida_origen?: number | null;
    id_banco_empresa_cuenta_salida_origen?: number | null;
    nombre_banco_empresa_cuenta_salida_origen?: string | null;
    nombre_banco_empresa_cuenta_ingreso: string | null;
    nombre_banco_empresa_cuenta_salida: string | null;
    id_banco_cliente_transferencia?: number | null;
    id_banco_cliente?: number | null;
    nombre_banco_cliente?: string | null;
    nombre_banco_cliente_transferencia?: string | null;
    tipo_facturacion?: string | null;
    tipo_recaudacion_sf?: string | null;
    nombre_usuario?: string | null;
    nombre_usuario_gestor?: string | null;
    id_usuario_solicitud?: number | null;
    nombre_usuario_solicitud?: string | null;
    nombre_usuario_deriva?: string | null;
    nombre_usuario_retiene?: string | null;
    id_operacion_padre?: number | null;
    id_operacion_match?: number | null;
    id_operacion_banco?: number | null;
    id_carga_excel?: number | null;
    flag_comision_registrada?: boolean | null;
    pd_codigo_operacion_transferencia?: string | null;
    pd_codigo_operacion_comision?: string | null;
    pd_retorno_id?: number | null;
    pd_retorno_id_empresa_ingreso?: number | null;
    pd_retorno_id_empresa_cuenta_ingreso?: number | null;
    pd_retorno_nombre_empresa_ingreso?: string | null;
    pd_retorno_nombre_banco_empresa_cuenta_ingreso?: string | null;
    pd_retorno_monto_devolucion?: number | null;
    pd_retorno_codigos_operacion?: string | null;
    pd_retorno_empresas_cuentas?: Array<{
        empresa?: string | null;
        cuenta?: string | null;
        codigo?: string | null;
        monto?: number | null;
    }> | null;
    tipo_flujo_pago_deuda?: string | null;
    ruta_origen: string | null;
    ruta_destino: string | null;
    flag_derivado: boolean;
    id_caja_cierre?: number | null;
    flag_retenido: boolean;
    flag_fuera_horario?: boolean | null;
    fecha_deposito_cliente?: string | null;
    fecha_pendiente?: string | null;
    fecha_pagado?: string | null;
    fecha_derivacion?: string | null;
    fecha_retencion?: string | null;
    fecha_fuera_horario?: string | null;
    id_usuario_fuera_horario?: number | null;
    motivo_fuera_horario?: string | null;
    fecha_corte_recaudacion?: string | null;
    fecha_estimada_abono?: string | null;
    fecha_liberacion_abono?: string | null;
    flag_liberable_abono?: boolean | null;
    estado_lote_abono?: string | null;
    motivo_retencion?: string | null;
    fecha_registro: string;
    monto_devuelto?: number | null;
}

export interface OperacionCajaMovimiento {
    id: number;
    id_caja: number;
    id_operacion_caja_relacionada: number | null;
    nombre_empresa_relacionada?: string | null;
    nombre_banco_relacionada?: string | null;
    id_operacion_proceso: number | null;
    tipo_origen: string;
    tipo_movimiento: string;
    tipo_servicio?: string | null;
    tipo_recaudacion_sf?: string | null;
    nombre_codigo_servicio: string | null;
    dni_cliente: string | null;
    codigo_operacion: string | null;
    detalle: string | null;
    nombre_empresa: string;
    nombre_banco: string;
    id_empresa_contraparte?: number | null;
    nombre_empresa_contraparte?: string | null;
    id_empresa_cuenta_bancaria_contraparte?: number | null;
    id_banco_contraparte?: number | null;
    nombre_banco_contraparte?: string | null;
    monto_ingreso: number;
    monto_gasto: number;
    monto_ganancia: number;
    monto_salida: number;
    nombre_estado: string;
    tipo_facturacion: string | null;
    fecha_deposito_cliente?: string | null;
    fecha_registro: string;
    flag_paso_retencion?: boolean | null;
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
    fuera_horario?: number | null;
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
    fuera_horario?: number | null;
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
