export interface CatalogItem {
    id: number;
    nombre: string;
    codigo?: string;
    idEstado?: number;
}

export interface UsuarioElegible {
    id: number;
    username: string;
    nombre: string;
    email: string;
    idRol: number;
    rolNombre: string;
    idSucursal: number | null;
    sucursalNombre: string;
    estadoNombre: string;
    idColaborador: number | null;
}

export interface ColaboradorAsignacion {
    id: number;
    idCargo: number;
    cargoNombre: string;
    idSucursal: number;
    sucursalNombre: string;
    idPlan: number;
    planNombre: string;
    fechaInicio: string;
    fechaFin: string | null;
    modalidad: string;
    observacion: string | null;
    esVigente: boolean;
    estadoNombre: string;
}

export interface Colaborador {
    id: number;
    idUsuario: number | null;
    usuarioNombre: string;
    usuarioUsername: string;
    tipoDocumento: string;
    numeroDocumento: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    nombreCompleto: string;
    email: string;
    celular: string;
    codigoHuellero: string;
    fechaIngreso: string;
    fechaCese: string | null;
    motivoCese: string;
    idEstado: number;
    estadoNombre: string;
    asignacion: ColaboradorAsignacion | null;
    ficha?: ColaboradorFicha;
}

export interface ColaboradorFicha {
    permisos: { puedeVerFicha: boolean; puedeEditarFicha: boolean };
}

export interface ColaboradoresResult {
    resumen: { colaboradores: number; activos: number; inactivos: number; sedes: number } | null;
    versionContrato: "B2_01";
    fechaReferencia: string;
    puedeCrear: boolean;
    items: Colaborador[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface ColaboradorFilters {
    fechaReferencia?: string;
    search?: string;
    idEstado?: number;
    idSucursal?: number;
    idCargo?: number;
    page: number;
    pageSize: number;
}

export interface ColaboradorFormValues {
    idUsuario: number;
    tipoDocumento: string;
    numeroDocumento: string;
    nombreCompleto: string;
    fechaIngreso: string;
    fechaCese: string;
    motivoCese: string;
    idEstado: number;
    idCargo: number;
    idSucursal: number;
    idPlan: number;
    modalidad: string;
}

export interface AsignacionFormValues {
    idCargo: number;
    idSucursal: number;
    idPlan: number;
    fechaInicio: string;
    modalidad: string;
    observacion: string;
    idEstado: number;
}
