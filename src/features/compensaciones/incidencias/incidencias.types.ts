export type IncidenciaCategoria = "PENALIDAD" | "AUDITORIA_PAGO";
export type IncidenciaEstado = "BORRADOR" | "PENDIENTE" | "APROBADO" | "RECHAZADO" | "ANULADO" | "LIQUIDADO";
export type IncidenciaBandeja = "TODOS" | "RECIBIDOS" | "ENVIADOS" | "HISTORIAL";

export interface IncidenciaTipo {
    id: number;
    codigo: string;
    nombre: string;
    categoria: IncidenciaCategoria;
    requiereCliente: boolean;
    requiereOperacion: boolean;
}

export interface IncidenciaColaborador {
    id: number;
    nombre: string;
    documento: string;
    idSucursal: number;
    sucursal: string;
}

export interface PenalidadTipo {
    id: number;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    montoReferencia: number;
    montoBonoReportante: number | null;
    requiereRespuesta: boolean;
}

export interface IncidenciaCatalogo {
    tipos: IncidenciaTipo[];
    reportantes: IncidenciaColaborador[];
    responsables: IncidenciaColaborador[];
    penalidades: PenalidadTipo[];
}

export interface IncidenciaRevision {
    id: number;
    numeroPaso: number;
    etapa: string;
    decision: string;
    comentario: string | null;
    usuarioRevisorNombre: string;
    fechaRegistro: string;
    datosDecision: Record<string, unknown>;
}

export interface IncidenciaEvento {
    id: number;
    idTipoEvento: number;
    idPenalidadTipo: number;
    tipoEventoNombre: string;
    categoria: IncidenciaCategoria;
    penalidadNombre: string;
    montoReferencia: number;
    montoBonoReportante: number | null;
    requiereRespuesta: boolean;
    reportanteNombre: string | null;
    reportanteDocumento: string | null;
    responsableNombre: string;
    responsableDocumento: string;
    sucursalOrigenNombre: string | null;
    sucursalResponsableNombre: string | null;
    fechaEvento: string;
    titulo: string | null;
    motivo: string | null;
    evidencia: unknown[];
    estado: IncidenciaEstado;
    importeAprobado: number | null;
    usuarioRegistraNombre: string;
    revisiones: IncidenciaRevision[];
}

export interface IncidenciasResumen {
    recibidosPendientes: number;
    aprobados: number;
    rechazados: number;
    anulados: number;
    totalDescuentosAprobados: number;
    totalBonosReportantes: number;
}

export interface IncidenciasResult {
    items: IncidenciaEvento[];
    resumen: IncidenciasResumen;
    totalPages: number;
}

export interface IncidenciaCreateValues {
    idTipoEvento: number;
    idPenalidadTipo: number;
    idReportante: number | null;
    idResponsable: number;
    fechaEvento: string;
    titulo: string;
    motivo: string;
    evidenciaUrl: string;
    clienteId: number | null;
    clienteDocumento: string;
    clienteNombre: string;
    operacionId: number | null;
}
