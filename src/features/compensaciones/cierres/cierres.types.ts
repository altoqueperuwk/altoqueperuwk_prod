export interface CierreTotales {
    totalColaboradores: number;
    totalSueldo: number;
    totalBonos: number;
    totalComisiones: number;
    totalDescuentos: number;
    totalPagar: number;
    totalPagado: number;
    totalPendiente: number;
}

export interface CierreMensaje { codigo: string; mensaje: string; cantidad: number | null; }

export interface CierreValidacion {
    idPeriodo: number;
    periodo: string;
    estadoPeriodo: string;
    politicaPago: string;
    puedeCerrar: boolean;
    bloqueos: CierreMensaje[];
    advertencias: CierreMensaje[];
    totales: CierreTotales;
}

export interface CierreLiquidacionSnapshot {
    id: number;
    idLiquidacion: number;
    idColaborador: number;
    colaboradorNombre: string;
    totalPagar: number;
    totalPagado: number;
    hashIntegridad: string;
}

export interface CierreMensual extends CierreTotales {
    id: number;
    idPeriodo: number;
    periodo: string;
    periodoNombre: string;
    numeroVersion: number;
    estado: string;
    snapshot: Record<string, unknown>;
    hashIntegridad: string;
    motivoReapertura: string | null;
    fechaCierre: string;
    fechaReversion: string | null;
    liquidaciones: CierreLiquidacionSnapshot[];
}

export interface CierreIntegridad {
    idCierre: number;
    hashAlmacenado: string;
    hashRecalculado: string;
    resumenIntegro: boolean;
    lineasInvalidas: number;
    indiceLineasIntegro: boolean;
    integro: boolean;
}

export interface AjusteCatalogoPersona { id: number; nombre: string; documento: string; sucursal: string; }
export interface AjusteCatalogoConcepto { id: number; codigo: string; nombre: string; categoria: string; naturaleza: "INGRESO" | "DESCUENTO"; }
export interface AjusteCatalogo { colaboradores: AjusteCatalogoPersona[]; conceptos: AjusteCatalogoConcepto[]; }

export interface AjusteCompensacion {
    id: number;
    idPeriodoDestino: number;
    periodoDestino: string;
    idColaborador: number;
    colaboradorNombre: string;
    colaboradorDocumento: string;
    idConcepto: number;
    conceptoNombre: string;
    naturaleza: string;
    monto: number;
    motivo: string;
    evidencia: unknown[];
    estado: string;
    fechaSolicitud: string;
}

export interface AjusteCreateValues {
    periodId: number;
    collaboratorId: number;
    conceptId: number;
    nature: "INGRESO" | "DESCUENTO";
    amount: number;
    reason: string;
    evidenceUrl: string;
}
