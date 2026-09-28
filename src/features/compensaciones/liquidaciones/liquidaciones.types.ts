export interface PeriodoCompensacion {
    id: number;
    periodo: string;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    estado: string;
    numeroCalculo: number;
    totalLiquidaciones: number | null;
    liquidacionesPendientes: number | null;
    totalPagar: number | null;
    totalPagado: number | null;
    solicitudesAsistenciaPendientes: number | null;
    eventosPendientes: number | null;
}

export interface LiquidacionDetalle {
    id: number;
    tipoOrigen: string;
    conceptoNombre: string;
    categoria: string;
    naturaleza: string;
    formula: string | null;
    baseCalculo: number;
    cantidad: number;
    tarifa: number;
    importe: number;
}

export interface Liquidacion {
    id: number;
    idPeriodo: number;
    idColaborador: number;
    periodoNombre: string;
    colaboradorNombre: string;
    colaboradorDocumento: string;
    numeroCalculo: number;
    estado: string;
    totalSueldo: number;
    totalBonos: number;
    totalComisiones: number;
    totalDescuentos: number;
    totalPagar: number;
    totalPagado: number;
    observacion: string | null;
    fechaCalculo: string;
    detalles: LiquidacionDetalle[];
}

export interface LiquidacionBloqueo { codigo: string; mensaje: string; }
export interface LiquidacionSimulacion {
    puedeCalcular: boolean;
    bloqueos: LiquidacionBloqueo[];
    totalSueldo: number;
    totalBonos: number;
    totalComisiones: number;
    totalDescuentos: number;
    totalPagar: number;
    detalles: LiquidacionDetalle[];
}

export interface AprobacionLiquidacion { id: number; numeroPaso: number; etapa: string; decision: string; comentario: string | null; usuario: string; fecha: string; }
export interface PagoMovimiento { id: number; tipoMovimiento: string; componente: string; monto: number; fechaPago: string; medioPago: string | null; referencia: string; observacion: string | null; usuario: string; }
export interface PagoResumen { objetivoTotal: number; objetivoSueldo: number; objetivoComisiones: number; pagadoAcumulado: number; saldoTotal: number; saldoSueldo: number; saldoComisiones: number; modalidad: string | null; }
export interface PagoInfo { resumen: PagoResumen; movimientos: PagoMovimiento[]; }
