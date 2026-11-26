export type EvidenciaCategoria = "CALIFICACION" | "LLAMADA" | "TARJETA_TERCERO" | "REFERIDO" | "OTRO";

export interface LlamadaContexto {
    puedeElegirColaborador?: boolean;
    colaboradores?: Array<{ id: number; nombre: string; sede: string }>;
    idUsuario: number;
    idColaborador: number | null;
    puedeRegistrar: boolean;
    puedeAprobar: boolean;
    puedeRevisar: boolean;
    puedeAgregarEfectivizacion?: boolean;
    puedeRevertir?: boolean;
}

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
    fechaActualizacion?: string;
    calificacionValida?: boolean;
    usuarioRegistraId?: number | null;
    idColaboradorBeneficiario?: number | null;
    idColaboradorResponsable?: number | null;
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
    tarifaRegistro?: { tipoCalculo: string; valor: number } | null;
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

export interface TiktokOperacionLookup {
    id: number;
    codigo: string;
    id_cliente: number;
    dni: string;
    cliente: string;
    servicio: string;
    monto: number;
    fecha_deposito: string | null;
    estado: string;
    elegible: boolean;
    motivo: string | null;
}

export interface TiktokEvidenceAttachment {
    tipo: "IMAGEN_TIKTOK";
    bucket: "compensaciones-tiktok-live";
    path: string;
    nombre: string;
    mime_type: string;
    size: number;
}

export interface CalificacionPolitica {
    dni_obligatorio: boolean;
    comentario_obligatorio: boolean;
    asesor_obligatorio: boolean;
}

export interface CalificacionesResult {
    puedeAdministrar?: boolean;
    items: EvidenciaEvento[];
    total: number;
    totalPages: number;
    pendientes: number;
    aprobados: number;
    noValidas: number;
    importeAprobado: number;
    politica: CalificacionPolitica;
    puedeConfigurar: boolean;
    asesores: Array<{ id: number; nombre: string }>;
    ranking: Array<{ id: number; nombre: string; cantidad: number }>;
    distribucion: Array<{ estrellas: number; cantidad: number }>;
}

export interface InnovacionImplementacion {
    version: string;
    comprobada: boolean;
    puedeRevisar: boolean;
    bloqueado: boolean;
    constancia: { fecha: string; evidencia: string; motivo: string } | null;
    /** true cuando Administración fija el importe (innovación de Jefatura). */
    importeVariable?: boolean;
    importeFijado?: number | null;
}
