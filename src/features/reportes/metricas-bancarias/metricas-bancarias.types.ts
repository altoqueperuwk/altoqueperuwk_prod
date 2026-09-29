export type MetricasPeriodo = "7d" | "month" | "2m" | "3m" | "4m" | "5m" | "6m";

export type MetricasServicio = "all" | "efectivizacion" | "pago-deuda";

export interface MetricasCuenta {
    ruta: string;
    idEmpresa: number;
    empresa: string;
    idCuenta: number;
    idBanco: number;
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
    clientesNuevos: number;
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
    clientesNuevos: number | null;
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
    derivaciones: {
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
    clientesNuevos: number;
}

export interface MetricasDesglose {
    ruta: string;
    idEmpresa: number;
    empresa: string;
    idCuenta: number;
    idBanco: number;
    cuenta: string;
    operaciones: number;
    pagadas: number;
    pendientes: number;
    clientesNuevos: number;
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

export interface MetricasComunidad {
    idComunidad: number;
    comunidad: string;
    operaciones: number;
    recaudacion: number;
    comision: number;
    gastosOperacionales: number;
    ganancias: number;
    salida: number;
    clientesNuevos: number;
    operacionesPendientes: number;
}

export interface MetricasCliente {
    idCliente: number;
    dni: string;
    nombreCompleto: string;
    comunidad: string;
    operaciones: number;
    recaudacion: number;
    comision: number;
    gastosOperacionales: number;
    ganancias: number;
    salida: number;
    operacionesPendientes: number;
}

export interface MetricasComision {
    porcentaje: number;
    operaciones: number;
    recaudacion: number;
    comision: number;
    gastosOperacionales: number;
    ganancias: number;
    salida: number;
}

export interface MetricasOperacionPendiente {
    idOperacion: number;
    idCliente: number | null;
    codigoOperacion: string;
    dni: string;
    nombreCompleto: string;
    idComunidad: number | null;
    comunidad: string;
    ruta: string;
    empresa: string;
    cuenta: string;
    fecha: string;
    recaudacion: number;
    transferencia: number;
    estado: string;
}

export interface MetricasDerivacion {
    idEmpresaContraparte: number | null;
    empresaContraparte: string;
    idBancoContraparte: number | null;
    bancoContraparte: string;
    idComunidad: number | null;
    comunidad: string;
    porcentajeComision: number;
    operaciones: number;
    gastosOperacionales: number;
    montoTransferido: number;
}

export interface MetricasMejorCliente {
    idCliente: number;
    dni: string;
    nombreCompleto: string;
    operaciones: number;
    ganancias: number;
}

export interface MetricasConsulta {
    fechaDesde: string;
    fechaHasta: string;
    granularidad: "DIA" | "MES";
    ruta: string | null;
    idEmpresa: number | null;
    idCuenta: number | null;
    idBanco: number | null;
    servicio: MetricasServicio;
}

export interface DistribucionServicio {
    name: string;
    value: number;
    color: string;
}
