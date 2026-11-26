import { supabase } from "@/lib/supabase";

export interface ClienteNuevo {
    concepto_codigo?: "COMISION_REGISTRO_EFECTIVIZACION" | "COMISION_TIKTOK_LIVE";
    id: number;
    nombre: string;
    documento: string;
    fecha_registro: string;
    vence: string;
    estado: "ESPERANDO_OPERACION" | "OPERACION_PENDIENTE" | "BONO_HABILITADO" | "BLOQUEADO" | "EN_REVISION";
    operacion: string | null;
    servicio: string | null;
    estado_operacion: string;
    monto: number | null;
    fecha_efectiva: string | null;
    ganancia: number | null;
    tipo_documento: number;
    celular: string | number | null;
    id_comunidad: number | null;
    puede_editar: boolean;
    registrado_por?: string | null;
    propio?: boolean;
    canal?: string | null;
    evidencia?: Array<{ path?: string; tipo?: string }>;
    id_operacion?: number | null;
    id_colaborador?: number;
    estado_aprobacion?: "NO_ELEGIBLE" | "PENDIENTE_APROBACION" | "APROBADO" | "RECHAZADO" | "REQUIERE_REVISION";
    comision_propuesta?: number | null;
    motivo_revision?: string | null;
    revisado_por?: string | null;
    fecha_revision?: string | null;
    revision_version?: string;
    puede_resolver?: boolean;
    bloqueo_revision?: string;
    historial?: Array<{ decision: string; motivo: string; fecha: string; usuario: string }>;
    notas?: Array<{ nota: string; fecha: string; usuario: string }>;
    requiere_cuota?: boolean;
    motivo?: string | null;
}
export interface ClientesNuevosFiltros {
    tipo?: string;
    documento?: string;
    nombre?: string;
    colaborador?: string;
    estado?: string;
    desde?: string;
    hasta?: string;
}
export interface ClientesNuevosResult {
    asOf?: string;
    dataState?: "complete" | "partial" | "unknown";
    en_revision?: number;
    total_comision: number;
    items: ClienteNuevo[];
    total: number;
    habilitados: number;
    esperando: number;
    bloqueados: number;
}
/** Conserva estados y metadatos nuevos; una respuesta legacy no confirma integridad. */
export const normalizeClientesNuevosResult = (value: unknown): ClientesNuevosResult => {
    if (!value || typeof value !== "object") throw new Error("No se confirmó la consulta de clientes");
    const result = value as ClientesNuevosResult;
    if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0)
        throw new Error("La consulta de clientes está incompleta; vuelve a intentarlo");
    return {
        ...result,
        asOf: typeof result.asOf === "string" && Number.isFinite(Date.parse(result.asOf)) ? result.asOf : undefined,
        dataState:
            Number(result.en_revision) > 0 || result.items.some((item) => item.estado === "EN_REVISION") || result.dataState === "partial"
                ? "partial"
                : result.dataState === "complete"
                  ? "complete"
                  : "unknown",
        en_revision: Number.isInteger(result.en_revision) && Number(result.en_revision) >= 0 ? result.en_revision : undefined,
    };
};
const rpc = async <T>(name: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    if (!data) throw new Error("No se confirmó la consulta de clientes");
    return data as T;
};
export interface ValidacionPagos {
    id_cliente: number;
    id_evento: number;
    estado: string;
    importe: number | null;
}
export const clientesNuevosService = {
    note: (cliente: number, colaborador: number, nota: string, concepto: ClienteNuevo["concepto_codigo"] = "COMISION_REGISTRO_EFECTIVIZACION") =>
        rpc<ClienteNuevo>("f_post_compensacion_captacion_nota_concepto", {
            p_cliente: cliente,
            p_colaborador: colaborador,
            p_nota: nota.trim(),
            p_concepto: concepto,
        }),
    revision: (cliente: number, colaborador: number, concepto: ClienteNuevo["concepto_codigo"] = "COMISION_REGISTRO_EFECTIVIZACION") =>
        rpc<ClienteNuevo>("f_get_compensacion_captacion_revision_concepto", { p_cliente: cliente, p_colaborador: colaborador, p_concepto: concepto }),
    resolve: (
        cliente: number,
        colaborador: number,
        version: string,
        decision: string,
        concepto: ClienteNuevo["concepto_codigo"] = "COMISION_REGISTRO_EFECTIVIZACION",
        motivo?: string,
    ) =>
        rpc<ClienteNuevo>("f_post_compensacion_captacion_resolver_concepto", {
            p_cliente: cliente,
            p_colaborador: colaborador,
            p_version: version,
            p_decision: decision,
            p_concepto: concepto,
            p_motivo: motivo?.trim() || null,
        }),
    remove: (id: number) => rpc<{ id: number; eliminado: boolean }>("f_delete_compensacion_cliente_nuevo", { p_id: id }),
    /** Solo Administración: validaciones del Jefe Superior de Pagos sobre estos clientes. */
    validacionesPagos: (clientes: number[]) => rpc<{ items: ValidacionPagos[] }>("f_get_compensacion_admin_registros_validacion", { p_clientes: clientes }),
    validate: (documento: string, tipo: number, id?: number) =>
        rpc<{ existe: boolean; motivo?: "PROPIO" | "OTRO_USUARIO" | "VENCIDO" }>("f_get_compensacion_cliente_nuevo_validar", {
            p_documento: documento,
            p_tipo_documento: tipo,
            p_id_excluir: id ?? null,
        }),
    register: (documento: string, nombre: string, tipo: number, celular: string, comunidad: number | null = null) =>
        rpc<{ id: number; fecha_registro: string }>("f_post_compensacion_cliente_nuevo", {
            p_documento: documento,
            p_nombre: nombre.trim(),
            p_tipo_documento: tipo,
            p_celular: celular || null,
            p_id_comunidad: comunidad,
        }),
    update: (id: number, documento: string, nombre: string, tipo: number, celular: string, comunidad: number | null) =>
        rpc<{ id: number; fecha_registro: string }>("f_patch_compensacion_cliente_nuevo", {
            p_id: id,
            p_documento: documento,
            p_nombre: nombre.trim(),
            p_tipo_documento: tipo,
            p_celular: celular || null,
            p_id_comunidad: comunidad,
        }),
    list: (month: string, page: number, size: number, filters: ClientesNuevosFiltros = {}) =>
        rpc<ClientesNuevosResult>("f_get_compensacion_clientes_nuevos", {
            p_mes: `${month}-01`,
            p_pagina: page,
            p_tamano: size,
            p_tipo_documento: filters.tipo ? Number(filters.tipo) : null,
            p_documento: filters.documento ?? "",
            p_estado: filters.estado ?? "",
            p_desde: filters.desde || null,
            p_hasta: filters.hasta || null,
            p_nombre_cliente: filters.nombre ?? "",
            p_colaborador: filters.colaborador ?? "",
        }).then(normalizeClientesNuevosResult),
};
