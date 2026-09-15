export type MetricasPeriodo = "6m" | "3m" | "month";

export type MetricasServicio = "all" | "efectivizacion" | "pago-deuda" | "movimientos" | "directo";

export interface MetricasCuenta {
    ruta: string;
    idEmpresa: number;
    empresa: string;
    idCuenta: number;
    cuenta: string;
}

export interface MetricasValores {
    cajaRecaudacion: number;
    ingresosMovimientos: number;
    salidas: number;
    gastosOperacionales: number;
    ganancias: number;
    margenGanancia: number;
    saldoBanco: number;
    pendienteTransferencia: number;
    operacionesRegistradas: number;
    operacionesPagadas: number;
    operacionesPendientes: number;
    tasaPago: number;
    ticketPromedio: number;
}

export interface MetricasVariacion {
    cajaRecaudacion: number | null;
    salidas: number | null;
    gastosOperacionales: number | null;
    ganancias: number | null;
    operacionesRegistradas: number | null;
    operacionesPagadas: number | null;
}

export interface EmpresaDerivada {
    empresa: string;
    cuenta: string;
    operaciones: number;
    transferencia: number;
}

export interface MetricasResumen {
    periodo: { desde: string; hasta: string };
    comparacionPeriodo: { desde: string; hasta: string } | null;
    actual: MetricasValores;
    anterior: MetricasValores | null;
    variacion: MetricasVariacion | null;
    safetypay: {
        totalTransferencia: number;
        empresasDerivadas: EmpresaDerivada[];
    };
}

export interface MetricasSerie {
    periodo: string;
    granularidad: string;
    ruta: string;
    cajaRecaudacion: number;
    ingresosMovimientos: number;
    salidas: number;
    gastosOperacionales: number;
    ganancias: number;
    margenGanancia: number;
    operacionesRegistradas: number;
    operacionesPagadas: number;
}

export interface MetricasDesglose {
    ruta: string;
    idEmpresa: number;
    empresa: string;
    idCuenta: number;
    cuenta: string;
    operaciones: number;
    pagadas: number;
    pendientes: number;
    tasaPago: number;
    cajaRecaudacion: number;
    ingresosMovimientos: number;
    salidas: number;
    gastosOperacionales: number;
    ganancias: number;
    margenGanancia: number;
    pendienteTransferencia: number;
    saldoBanco: number;
    ticketPromedio: number;
}

export interface MetricasConsulta {
    fechaDesde: string;
    fechaHasta: string;
    granularidad: "DIA" | "MES";
    ruta: string | null;
    idEmpresa: number | null;
    idCuenta: number | null;
    servicio: MetricasServicio;
}

export interface DistribucionServicio {
    name: string;
    value: number;
    color: string;
}
