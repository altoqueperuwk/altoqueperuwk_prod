export interface CompensacionPeriodo {
    id: number;
    periodo: string;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    zonaHoraria: string;
    estadoPeriodo: string;
    numeroCalculo: number;
    fechaApertura: string | null;
    fechaAprobacion: string | null;
    fechaCierre: string | null;
    totalLiquidaciones: number | null;
    liquidacionesPendientes: number | null;
    totalPagar: number | null;
    totalPagado: number | null;
    solicitudesAsistenciaPendientes: number | null;
    eventosPendientes: number | null;
    tieneCierreVigente: boolean;
}

