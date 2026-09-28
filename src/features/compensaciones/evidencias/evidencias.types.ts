export type EvidenciaCategoria = "CALIFICACION" | "LLAMADA" | "TARJETA_TERCERO" | "REFERIDO" | "OTRO";

export type EvidenciaEstado = "BORRADOR" | "PENDIENTE" | "APROBADO" | "RECHAZADO" | "ANULADO" | "LIQUIDADO";

export interface EvidenciaTipo {
    id: number;
    codigo: string;
    nombre: string;
    categoria: EvidenciaCategoria;
    conceptoNombre: string | null;
    requiereBeneficiario: boolean;
    requiereResponsable: boolean;
    requiereCliente: boolean;
    requiereOperacion: boolean;
    configuracion: Record<string, unknown>;
    estadoNombre: string;
}

export interface EvidenciaReferencia {
    id: number;
    tipoReferencia: string;
    idCliente: number | null;
    idOperacion: number | null;
    identificadorExterno: string | null;
}

export interface EvidenciaRevision {
    id: number;
    numeroPaso: number;
    etapa: string;
    decision: string;
    comentario: string | null;
    usuarioRevisorNombre: string;
    fechaRegistro: string;
}

export interface EvidenciaEvento {
    id: number;
    idTipoEvento: number;
    tipoCodigo: string;
    tipoNombre: string;
    categoria: EvidenciaCategoria;
    conceptoNombre: string | null;
    beneficiarioNombre: string | null;
    beneficiarioDocumento: string | null;
    responsableNombre: string | null;
    sucursalOrigenNombre: string | null;
    fechaEvento: string;
    periodoImputacion: string;
    titulo: string | null;
    descripcion: string | null;
    datos: Record<string, unknown>;
    evidencia: unknown[];
    estado: EvidenciaEstado;
    baseCalculo: number | null;
    cantidad: number | null;
    tarifaAplicada: number | null;
    importeAprobado: number | null;
    usuarioRegistraNombre: string;
    fechaRegistro: string;
    referencias: EvidenciaReferencia[];
    revisiones: EvidenciaRevision[];
}

export interface EvidenciasResumen {
    borradores: number;
    pendientes: number;
    aprobados: number;
    rechazados: number;
    anulados: number;
    importeAprobado: number;
}

export interface EvidenciasResult {
    items: EvidenciaEvento[];
    resumen: EvidenciasResumen;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface EvidenciaCreateValues {
    idTipoEvento: number;
    fechaEvento: string;
    idBeneficiario: number | null;
    idResponsable: number | null;
    titulo: string;
    descripcion: string;
    clienteId: number | null;
    clienteDocumento: string;
    clienteNombre: string;
    operacionId: number | null;
    evidenciaUrl: string;
    estrellas: number | null;
}
