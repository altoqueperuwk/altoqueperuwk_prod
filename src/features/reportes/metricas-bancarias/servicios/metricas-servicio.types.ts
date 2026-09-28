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
    pendienteTransferencia: number;
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
    pendientes: number;
    clientesNuevos: number;
    montoProcesado: number;
    montoAtendido: number;
    comisiones: number;
    gastos: number;
    ganancias: number;
    salidas: number;
    tasaExito: number;
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
        entidades: Array<{ id: number; nombre: string }>;
        pos: Array<{ id: number; nombre: string }>;
    };
}

export interface MetricasPagoDeudaCatalogo {
    id: number | null;
    nombre: string;
}

export interface MetricasPagoDeudaResumen {
    operaciones: number;
    recaudacion: number;
    comision: number;
    gastosOperacionales: number;
    ganancias: number;
    salida: number;
    clientesNuevos: number;
    operacionesPendientes: number;
    montoPendiente: number;
}

export interface MetricasPagoDeudaSerie {
    periodo: string;
    operaciones: number;
    ganancias: number;
}

export interface MetricasPagoDeudaComision {
    porcentaje: number;
    operaciones: number;
    atendidas: number;
    pendientes: number;
    recaudacion: number;
    comision: number;
    gastosOperacionales: number;
    ganancias: number;
    salida: number;
    clientesNuevos: number;
    tasaAtencion: number;
}

export interface MetricasPagoDeudaComunidad extends MetricasPagoDeudaComision {
    idComunidad: number | null;
    comunidad: string;
    operacionesPendientes: number;
}

export interface MetricasPagoDeudaCliente extends MetricasPagoDeudaComision {
    idCliente: number;
    dni: string;
    nombreCompleto: string;
    comunidad: string;
    operacionesPendientes: number;
}

export interface MetricasPagoDeudaMejorCliente {
    idCliente: number;
    dni: string;
    nombreCompleto: string;
    operaciones: number;
    ganancias: number;
}

export interface MetricasPagoDeudaMejorSede {
    idSucursal: number | null;
    sede: string;
    operaciones: number;
    ganancias: number;
}

export interface MetricasPagoDeudaDistribucion {
    id: number | null;
    nombre: string;
    operaciones: number;
    atendidas: number;
    pendientes: number;
    montoSolicitado: number;
    montoTransferido: number;
    ganancias: number;
    clientesNuevos: number;
    tasaAtencion: number;
}

export interface MetricasPagoDeudaPendiente {
    idOperacion: number;
    codigoOperacion: string;
    dni: string;
    nombreCompleto: string;
    comunidad: string;
    banco: string;
    empresa: string;
    fecha: string;
    recaudacion: number;
    transferencia: number;
    ganancias: number;
    estado: string;
}

export interface MetricasPagoDeudaAnalitica {
    idSucursalSeleccionada: number | null;
    idBancoSeleccionado: number | null;
    idEmpresaSeleccionada: number | null;
    bancos: MetricasPagoDeudaCatalogo[];
    sedes: MetricasPagoDeudaCatalogo[];
    empresas: MetricasPagoDeudaCatalogo[];
    resumen: MetricasPagoDeudaResumen;
    serie: MetricasPagoDeudaSerie[];
    comisiones: MetricasPagoDeudaComision[];
    comunidades: MetricasPagoDeudaComunidad[];
    clientes: MetricasPagoDeudaCliente[];
    mejorCliente: MetricasPagoDeudaMejorCliente | null;
    mejorSede: MetricasPagoDeudaMejorSede | null;
    distribucionSedes: MetricasPagoDeudaDistribucion[];
    distribucionBancos: MetricasPagoDeudaDistribucion[];
    pendientes: MetricasPagoDeudaPendiente[];
}

export interface MetricasPagoDeudaConsulta {
    fechaDesde: string;
    fechaHasta: string;
    idUsuarioConsulta: number;
    idSucursal: number | null;
    idBancoCliente: number | null;
}
