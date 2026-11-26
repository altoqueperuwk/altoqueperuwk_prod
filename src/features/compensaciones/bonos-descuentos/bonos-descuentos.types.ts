/** Own-only RPC: identity is always resolved by the server, never supplied by the UI. */
export type BonosDescuentosVista = "SEGUIMIENTO" | "LIQUIDADO";
export type BonosDescuentosTipo = "BONO" | "COMISION" | "DESCUENTO";
export interface BonosDescuentosFiltros {
    mes: string;
    estado?: string;
    desde?: string;
    hasta?: string;
    criterio?: "" | "ATENCIONES" | "CALIFICACIONES";
    vista: BonosDescuentosVista;
    tipo: BonosDescuentosTipo | "";
    concepto: string;
    pagina: number;
    tamano: number;
}
export interface BonoDescuentoConcepto extends Record<string, unknown> {
    codigo: string;
    concepto: string;
    tipo: BonosDescuentosTipo;
    cantidad: number;
    pendientes: number;
    importe: number | null;
}
export interface BonoDescuentoRegistro extends Record<string, unknown> {
    id: string | number;
    fecha: string | null;
    descripcion: string;
    estado: string;
    importe: number | null;
    concepto_origen?: string | null;
    fecha_filtro?: string | null;
    documento?: string | null;
    cliente?: string | null;
    operacion?: string | null;
    entrada_programada?: string | null;
    entrada_real?: string | null;
    tarifa?: number | null;
}
export interface BonosDescuentosResultado {
    items: BonoDescuentoConcepto[];
    total: number;
    conceptos: { codigo: string; concepto: string }[];
    kpis: { bonos: number | null; comisiones: number | null; descuentos: number | null; neto: number | null; pendientes: number };
    disponible: boolean;
    estado_liquidacion?: "APROBADA" | "PAGO_PARCIAL" | "PAGADA" | null;
    seguimiento_consolidado?: boolean;
    cargo_actual?: { codigo: string; nombre: string; fecha_inicio: string; fecha_fin: string | null } | null;
    aviso?: string | null;
    advertencias?: { codigo: string; mensaje: string }[];
}
export interface BonosDescuentosDetalle {
    items: BonoDescuentoRegistro[];
    total: number;
}
export type BonosDescuentosTipoRegistro = "" | "BONO" | "PENALIDAD";
/** Lista plana de registros del Dashboard: tipo Bono o Penalidad y paginación en servidor (SQL137). */
export interface BonosDescuentosRegistros {
    items: Array<Record<string, unknown>>;
    total: number;
    total_paginas: number;
    disponible: boolean;
}
/** Dashboard en una sola consulta (SQL138): totales, avisos y registros paginados con un único cálculo del motor. */
export type BonosDescuentosDashboard = Omit<BonosDescuentosResultado, "items" | "conceptos"> &
    BonosDescuentosRegistros & { conceptos: { codigo: string; concepto: string; tipo: BonosDescuentosTipo }[] };
