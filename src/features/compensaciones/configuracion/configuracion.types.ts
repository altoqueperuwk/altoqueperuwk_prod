export interface EstadoCatalogo {
    id: number;
    nombre: string;
}
export interface SucursalCatalogo {
    id: number;
    nombre: string;
}
export interface Plan {
    id: number;
    codigo: string;
    nombre: string;
    descripcion: string;
    idEstado: number;
    estado: string;
    versiones: number;
}
export interface PlanVersion {
    id: number;
    idPlan: number;
    planNombre: string;
    numeroVersion: number;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    estado: string;
    observacion: string;
    cantidadReglas: number;
    esVigente: boolean;
}
export interface Concepto {
    id: number;
    codigo: string;
    nombre: string;
    categoria: string;
    naturaleza: string;
    unidad: string;
    requiereEvidencia: boolean;
    requiereAprobacion: boolean;
    permiteExcepcion: boolean;
    orden: number;
    idEstado: number;
    estado: string;
}
export interface Cargo {
    id: number;
    codigo: string;
    nombre: string;
    descripcion: string;
    orden: number;
    idEstado: number;
    estado: string;
}
export interface Jornada {
    id: number;
    codigo: string;
    nombre: string;
    modalidad: string;
    horaEntrada: string;
    horaSalida: string;
    minutosTolerancia: number;
    minutosDescanso: number;
    diasSemana: number[];
    cruzaMedianoche: boolean;
    idEstado: number;
    estado: string;
}
export interface EventoTipo {
    id: number;
    codigo: string;
    nombre: string;
    categoria: string;
    idConcepto: number | null;
    conceptoNombre: string;
    requiereBeneficiario: boolean;
    requiereResponsable: boolean;
    requiereCliente: boolean;
    requiereOperacion: boolean;
    configuracion: Record<string, unknown>;
    idEstado: number;
    estado: string;
}
export interface UsuarioAcceso {
    id: number;
    nombre: string;
    username: string;
    rolNombre: string;
    idSucursal: number | null;
    sucursalNombre: string;
}
export interface Acceso {
    id: number;
    idUsuario: number;
    usuarioNombre: string;
    recurso: string;
    alcance: string;
    idSucursal: number | null;
    sucursalNombre: string;
    puedeConsultar: boolean;
    puedeRegistrar: boolean;
    puedeEditar: boolean;
    puedeRevisar: boolean;
    puedeAprobar: boolean;
    puedePagar: boolean;
    puedeCerrar: boolean;
    puedeConfigurar: boolean;
    idEstado: number;
    estado: string;
}
export interface Regla {
    id: number;
    idPlanVersion: number;
    planNombre: string;
    numeroVersion: number;
    estadoVersion: string;
    idConcepto: number;
    conceptoNombre: string;
    categoria: string;
    naturaleza: string;
    idCargo: number | null;
    cargoNombre: string;
    idSucursal: number | null;
    sucursalNombre: string;
    tipoCalculo: string;
    monto: number | null;
    porcentaje: number | null;
    valorMinimo: number | null;
    valorMaximo: number | null;
    topeImporte: number | null;
    prioridad: number;
    configuracion: Record<string, unknown>;
    fuenteOperacion: string;
    idEstado: number;
    estado: string;
}
export interface MetaSede {
    id: number;
    idPlanVersion: number;
    planNombre: string;
    numeroVersion: number;
    estadoVersion: string;
    idSucursal: number;
    sucursalNombre: string;
    codigoIndicador: string;
    periodo: string;
    valorMeta: number;
    unidad: string;
    idEstado: number;
    estado: string;
}
export interface PenalidadTipo {
    id: number;
    idPlanVersion: number;
    planNombre: string;
    numeroVersion: number;
    estadoVersion: string;
    codigo: string;
    nombre: string;
    descripcion: string;
    idCargo: number | null;
    cargoNombre: string;
    idConceptoDescuento: number;
    conceptoDescuentoNombre: string;
    idConceptoBono: number | null;
    conceptoBonoNombre: string;
    montoReferencia: number;
    montoBono: number | null;
    requiereRespuesta: boolean;
    idEstado: number;
    estado: string;
}
export interface ConfiguracionCatalogos {
    estados: EstadoCatalogo[];
    sucursales: SucursalCatalogo[];
}
