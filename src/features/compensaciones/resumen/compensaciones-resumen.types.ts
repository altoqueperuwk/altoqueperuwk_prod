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
    eventosPendientes: number | null;
    tieneCierreVigente: boolean;
}
