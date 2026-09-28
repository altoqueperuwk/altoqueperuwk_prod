export interface AsistenciaResumen {
    integrantes: number;
    jornadas: number;
    tardanzas: number;
    faltasEntrada: number;
    faltasSalida: number;
    ausencias: number;
    diasCompletos: number;
    pendientes: number;
}

export interface AsistenciaJornada {
    id: number;
    idColaborador: number;
    colaboradorNombre: string;
    colaboradorDocumento: string;
    fecha: string;
    entradaProgramada: string | null;
    salidaProgramada: string | null;
    entradaReal: string | null;
    salidaReal: string | null;
    minutosTardanza: number;
    minutosExtra: number;
    minutosTrabajados: number;
    estadoDia: string;
    fuente: string;
    version: number;
    observacion: string | null;
    idSucursal: number;
    sucursalNombre: string;
    cargoNombre: string;
}

export interface AsistenciaJornadasResult {
    items: AsistenciaJornada[];
    summary: AsistenciaResumen;
    total: number;
    totalPages: number;
}

export interface AsistenciaSolicitud {
    id: number;
    idJornada: number;
    idColaborador: number;
    colaboradorNombre: string;
    colaboradorDocumento: string;
    fecha: string;
    entradaReal: string | null;
    salidaReal: string | null;
    estadoDia: string;
    valoresActuales: Record<string, unknown>;
    valoresSolicitados: Record<string, unknown>;
    motivo: string;
    estadoSolicitud: string;
    usuarioSolicitaNombre: string;
    fechaSolicitud: string;
    motivoResolucion: string | null;
}

export interface AsistenciaSolicitudResumen {
    pendientes: number;
    aprobadas: number;
    rechazadas: number;
    anuladas: number;
}

export interface AsistenciaCarga {
    id: number;
    nombreArchivo: string;
    formato: string;
    tamanoBytes: number;
    nombreHoja: string | null;
    fechaDesde: string | null;
    fechaHasta: string | null;
    estadoCarga: string;
    totalFilas: number;
    totalValidas: number;
    totalInvalidas: number;
    totalDuplicadas: number;
    fechaRegistro: string;
    fechaConfirmacion: string | null;
}

export interface AsistenciaImportRow {
    numero_fila: number;
    codigo_huellero: string | null;
    documento: string | null;
    nombre: string | null;
    fecha_hora: string;
    tipo_marcacion: "ENTRADA" | "SALIDA" | "DESCONOCIDA";
    datos_origen: Record<string, unknown>;
}

export interface AsistenciaParsedFile {
    rows: AsistenciaImportRow[];
    sheetName: string;
    hash: string;
}

export interface AsistenciaValidationResult {
    idCarga: number;
    estadoCarga: string;
    fechaDesde: string | null;
    fechaHasta: string | null;
    totalFilas: number;
    totalValidas: number;
    totalInvalidas: number;
    totalDuplicadas: number;
    errores: Array<{ numero_fila: number; codigo_error: string; mensaje: string }>;
}

