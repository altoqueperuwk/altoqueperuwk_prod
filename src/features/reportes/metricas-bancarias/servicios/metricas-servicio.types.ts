export type MetricasServicioOperativo = "pago-deuda" | "pos" | "linkpago";

export interface MetricasServicioConsulta {
    servicio: MetricasServicioOperativo;
    fechaDesde: string;
    fechaHasta: string;
    idUsuarioConsulta: number;
    idSucursal: number | null;
    idEstado: number | null;
    idBancoCliente: number | null;
    idBancoDestino: number | null;
    idPos: number | null;
}

export interface MetricasServicioValores {
    operaciones: number;
    pagadas: number;
    pendientes: number;
    sinEmpresaComision: number;
    montoProcesado: number;
    montoAtendido: number;
    comisiones: number;
    gastos: number;
    ganancias: number;
    salidas: number;
    clientesNuevos: number;
    tasaExito: number;
    ticketPromedio: number;
}

export interface MetricasServicioResumen {
    servicio: MetricasServicioOperativo;
    periodo: { desde: string; hasta: string };
    actual: MetricasServicioValores;
}

export interface MetricasServicioSerie {
    periodo: string;
    operaciones: number;
    pagadas: number;
    clientesNuevos: number;
    montoProcesado: number;
    montoAtendido: number;
    comisiones: number;
    gastos: number;
    ganancias: number;
    salidas: number;
}

export interface MetricasServicioSede {
    idSucursal: number | null;
    sede: string;
    operaciones: number;
    pagadas: number;
    clientesNuevos: number;
    montoProcesado: number;
    montoAtendido: number;
    comisiones: number;
    gastos: number;
    ganancias: number;
    salidas: number;
    tasaExito: number;
}

export interface MetricasServicioDistribucion {
    dimension: string;
    clave: string;
    nombre: string;
    periodo: string | null;
    operaciones: number;
    pagadas: number;
    montoProcesado: number;
    comisiones: number;
    ganancias: number;
}

export interface MetricasServicioDesglose extends MetricasServicioSede {
    servicio: MetricasServicioOperativo;
    idBancoCliente: number | null;
    entidadTarjeta: string;
    idBancoDestino: number | null;
    bancoDestino: string;
    idPos: number | null;
    pos: string;
    idEmpresaSalida: number | null;
    empresaSalida: string;
    idCuentaSalida: number | null;
    cuentaSalida: string;
    pendientes: number;
}

export interface MetricasServicioDashboard {
    summary: MetricasServicioResumen;
    series: MetricasServicioSerie[];
    sedes: MetricasServicioSede[];
    distribution: MetricasServicioDistribucion[];
    breakdown: MetricasServicioDesglose[];
    filterOptions: {
        sedes: MetricasServicioSede[];
        distribution: MetricasServicioDistribucion[];
    };
}
