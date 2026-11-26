import { supabase } from "@/lib/supabase";
import type { LlamadaContexto } from "./evidencias.types";

export interface ReferidoOperacion {
    id: number;
    banco: string | null;
    monto: number;
    fecha: string;
    codigo: string | null;
    conversacion?: string | null;
}
export interface ReferidoOperacionEvidencia extends ReferidoOperacion {
    servicio: string;
    estado: string;
    porcentaje: number | null;
    seleccionable: boolean;
    motivo: string;
}
export interface Referido {
    coincidencia?: { estado: "ENCONTRADO" | "ESPERANDO" | "AMBIGUO" | "VENCIDO" | "REQUIERE_DATOS"; cantidad: number; operacion: ReferidoOperacion | null };
    version_evento?: string;
    id: number;
    id_evento: number;
    nombre_referido_snapshot: string;
    documento_referido_snapshot: string;
    referente_nombre: string;
    sucursal_nombre: string;
    fecha_referencia: string;
    observacion: string | null;
    estado_referido: string;
    estado_evento: string;
    id_usuario_registra: number;
    id_colaborador_referente?: number;
    importe_aprobado: number | null;
    monto_declarado?: number | null;
    banco_declarado?: string | null;
    efectivizaciones_pendientes?: number;
    operaciones: { banco_snapshot: string; monto_operacion_snapshot: number; importe_comision: number }[];
}
export interface ReferidoEfectivizacion {
    id: number;
    estado_evento: string;
    periodo_imputacion: string;
    id_usuario_registra: number;
    importe_aprobado: number | null;
    fecha_evento: string;
    banco: string | null;
    monto: number | null;
}
export interface ReferidoHistorial {
    items: ReferidoEfectivizacion[];
    total: number;
    total_paginas: number;
}
export interface ReferidosResult {
    items: Referido[];
    total: number;
    total_paginas: number;
    resumen: { pendientes: number; validados: number; rechazados: number; anulados: number; importe_validado: number; efectivizaciones_pendientes?: number };
}
const rpc = async <T>(name: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};
const confirmedReview = (data: unknown, id: number, decision: string) => {
    const result = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (!(Number(result.id) > 0) || Number(result.id_referido) !== id || result.estado_evento !== decision)
        throw new Error("No se confirmó la revisión del referido");
    return result;
};
export const referidosService = {
    context: async (): Promise<LlamadaContexto> => {
        const value = await rpc<Record<string, unknown>>("f_get_compensacion_referido_contexto", {});
        return {
            idUsuario: Number(value.id_usuario),
            idColaborador: value.id_colaborador == null ? null : Number(value.id_colaborador),
            puedeRegistrar: value.puede_registrar === true,
            puedeAprobar: value.puede_aprobar === true,
            puedeRevisar: value.puede_revisar === true,
            puedeAgregarEfectivizacion: value.puede_agregar_efectivizacion === true,
            puedeRevertir: value.puede_revertir === true,
        };
    },
    operations: (id: number | null, dni: string | null = null) =>
        rpc<{ dni: string; items: ReferidoOperacionEvidencia[]; limite: number }>("f_get_compensacion_referido_operaciones", { p_id: id, p_dni: dni }),
    list: (filters: {
        search?: string;
        documento?: string;
        nombre?: string;
        colaborador?: string;
        desde?: string;
        hasta?: string;
        status: string;
        month: string;
        page: number;
        pageSize: number;
    }) => {
        const [year, month] = filters.month.split("-").map(Number);
        return rpc<ReferidosResult>("f_get_compensacion_referidos_filtrados", {
            p_busqueda: filters.search?.trim() || null,
            p_documento_cliente: filters.documento?.trim() || null,
            p_nombre_cliente: filters.nombre?.trim() || null,
            p_colaborador: filters.colaborador?.trim() || null,
            p_estado_referido: filters.status || null,
            p_fecha_desde: filters.desde || (filters.month ? `${filters.month}-01` : null),
            p_fecha_hasta: filters.hasta || (filters.month ? `${filters.month}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` : null),
            p_pagina: filters.page,
            p_tamano_pagina: filters.pageSize,
        });
    },
    update: (id: number, values: { notas: string; nombre: string; monto: number; idBanco: number }) =>
        rpc<{ id: number; id_evento: number }>("f_patch_compensacion_referido_captura", {
            p_id: id,
            p_notas: values.notas.trim(),
            p_nombre: values.nombre.trim(),
            p_monto: values.monto,
            p_id_banco: values.idBanco,
        }),
    annul: (id: number, motivo: string) => rpc<Record<string, unknown>>("f_post_tb_compensacion_referido_anular", { p_id: id, p_motivo: motivo.trim() }),
    register: async (dni: string, notas: string, clave: string, declaration: { nombre: string; monto: number; idBanco: number }) => {
        const value = await rpc<{ id: number; id_evento: number; error?: string } | null>("f_post_compensacion_referido_declaracion", {
            p_dni: dni.trim(),
            p_notas: notas.trim(),
            p_clave: clave,
            p_nombre: declaration.nombre,
            p_monto: declaration.monto,
            p_id_banco: declaration.idBanco,
        });
        if (
            !value ||
            value.error ||
            !Number.isSafeInteger(Number(value.id)) ||
            Number(value.id) <= 0 ||
            !Number.isSafeInteger(Number(value.id_evento)) ||
            Number(value.id_evento) <= 0
        ) {
            throw new Error("No se confirmó el referido. Reintenta con los mismos datos para verificarlo sin duplicar.");
        }
        return value;
    },
    operation: (id: number) => rpc<ReferidoOperacion | null>("f_get_compensacion_referido_operacion", { p_id: id }),
    history: (id: number, page: number, pageSize: number) =>
        rpc<ReferidoHistorial>("f_get_compensacion_referido_efectivizaciones", { p_id: id, p_pagina: page, p_tamano: pageSize }),
    addOperation: (id: number, operation: number) => rpc("f_post_compensacion_referido_efectivizacion", { p_id: id, p_id_operacion: operation }),
    resolveOperation: (id: number, decision: "APROBADO" | "RECHAZADO", reason: string) =>
        rpc("f_post_compensacion_referido_efectivizacion_resolver", { p_id: id, p_decision: decision, p_comentario: reason.trim() || null }),
    revert: (item: Referido, reason: string) =>
        rpc("f_post_compensacion_referido_revertir", {
            p_id: item.id,
            p_version: item.version_evento ?? null,
            p_motivo: reason.trim(),
        }),
    resolve: (id: number, decision: "APROBADO" | "RECHAZADO", operation: number | null, reason: string, conversation?: string) =>
        (decision === "APROBADO"
            ? rpc("f_post_compensacion_referido_validar", {
                  p_id: id,
                  p_id_operacion: operation,
                  p_conversacion: conversation?.trim() || null,
                  p_comentario: reason.trim() || null,
              })
            : rpc("f_post_tb_compensacion_referido_resolver", {
                  p_id: id,
                  p_decision: decision,
                  p_id_operacion: operation,
                  p_comentario: reason.trim() || null,
              })
        ).then((data) => confirmedReview(data, id, decision)),
};
export const referidoError = (error: unknown) =>
    error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo completar la solicitud";
