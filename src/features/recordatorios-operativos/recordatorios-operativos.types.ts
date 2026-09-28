export type RecordatorioNivel = 1 | 2 | 3;
export type RecordatorioVista = "PENDIENTES" | "HISTORIAL";

export interface RecordatorioResumen {
    activos: number;
    nuevos: number;
    nivel1: number;
    nivel2: number;
    nivel3: number;
}

export interface RecordatorioContexto {
    idOperacion: number;
    codigoOperacion: string;
    idUsuarioDestinatario: number | null;
    usuarioDestinatario: string;
    servicio: string;
    dni: string;
    cliente: string;
    sucursal: string;
    entidad: string;
    monto: number;
    fechaOperacion: string | null;
    estado: string;
    estaPendiente: boolean;
    recordatorioActivo: boolean;
}

export interface RecordatorioItem {
    id: number;
    idOperacion: number;
    nivelAlerta: RecordatorioNivel;
    codigoMensaje: string;
    comentario: string;
    servicio: string;
    codigoOperacion: string;
    fechaOperacion: string | null;
    dni: string;
    cliente: string;
    sucursal: string;
    entidad: string;
    monto: number;
    estadoOperacion: string;
    estadoRecordatorio: string;
    emisor: string;
    fechaUltimoEnvio: string;
    cantidadEnvios: number;
    leido: boolean;
    fechaCierre: string | null;
    rutaOperativa: string;
}

export interface RecordatorioPagina {
    items: RecordatorioItem[];
    total: number;
    pagina: number;
    tamanoPagina: number;
    totalPaginas: number;
}
