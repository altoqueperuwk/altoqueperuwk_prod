import { supabase } from "@/lib/supabase";

export type FacturacionTipo = "DETECCION_ERROR_PAGO" | "OPERACION_EXTRA";
export interface FacturacionOperacion {
    id: number;
    id_cliente: number;
    dni: string;
    cliente: string;
    codigo: string | null;
    monto: number | null;
    estado: string;
    pagada: boolean;
    fecha_registro: string;
    servicio: string;
}
export interface FacturacionReporte extends Record<string, unknown> {
    id: number;
    tipo: FacturacionTipo;
    descripcion: string;
    estado_evento: string;
    fecha_evento: string;
    fecha_registro: string;
    importe_aprobado: number | null;
    fecha_actualizacion?: string;
    requiere_revision?: boolean;
    beneficiario: string;
    operacion_actual?: FacturacionOperacion | null;
    cliente: string;
    datos: {
        cliente_documento: string;
        codigo_externo: string | null;
        error: "MONTO" | "CUENTA" | null;
        momento_reporte?: string;
        operacion?: FacturacionOperacion;
    };
    evidencia: Array<{ evidencia: string }>;
    criterios_validacion_snapshot: { regla_registro?: { monto?: number } };
    revisiones: Array<{ numero_paso: number; decision: string; comentario: string | null; fecha_revision: string }>;
}
export interface FacturacionContexto {
    es_admin: boolean;
    puede_registrar: boolean;
    id_colaborador: number | null;
}
export interface FacturacionListado {
    items: FacturacionReporte[];
    total: number;
    pendientes: number;
    aprobado: number;
}
export interface FacturacionFiltros {
    desde: string;
    hasta: string;
    estado: string;
    dni: string;
    pagina: number;
    tamano: number;
}
export interface FacturacionRegistro {
    tipo: FacturacionTipo;
    dni: string;
    codigo: string;
    evidencia: string;
    descripcion: string;
    error: "MONTO" | "CUENTA" | null;
    operacion: number | null;
    id?: number;
    clave?: string;
}
const rpc = async <T>(name: string, params: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    if (data == null) throw new Error("No se recibió confirmación del servidor");
    return data as T;
};
const dniValido = (dni: string) => {
    if (!/^\d{8}$/.test(dni)) throw new Error("Ingresa un DNI de 8 dígitos");
};
export const facturacionMesLima = () => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
};
export const facturacionFechasMes = (mes: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error("Selecciona un periodo válido");
    const [year, month] = mes.split("-").map(Number);
    return { desde: `${mes}-01`, hasta: `${mes}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` };
};
export const facturacionError = (error: unknown) =>
    error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo completar la solicitud";
/** Un reporte pagado se muestra Aprobado más la marca de liquidación; no es un cuarto estado. */
export const facturacionLiquidado = (r: { estado_evento: string }) => r.estado_evento === "LIQUIDADO";
export const facturacionEstadoVisible = (r: { estado_evento: string; requiere_revision?: boolean }) =>
    facturacionLiquidado(r) ? "APROBADO" : r.requiere_revision ? "EN_REVISION" : r.estado_evento;
const pedirPagina = async (f: FacturacionFiltros, estado: string | null, pagina: number, tamano: number) => {
    const result = await rpc<FacturacionListado>("f_get_compensacion_facturacion_auditoria", {
        p_desde: f.desde,
        p_hasta: f.hasta,
        p_estado: estado,
        p_dni: f.dni || null,
        p_pagina: pagina,
        p_tamano: tamano,
    });
    if (!Array.isArray(result.items) || !Number.isFinite(result.total)) throw new Error("Respuesta de reportes inválida");
    return result;
};
const reunir = async (f: FacturacionFiltros, estado: string, necesarios: number) => {
    const primera = await pedirPagina(f, estado, 1, 100);
    const items = [...primera.items];
    for (let pagina = 2; items.length < necesarios && items.length < primera.total; pagina++) {
        const siguiente = await pedirPagina(f, estado, pagina, 100);
        if (!siguiente.items.length) break;
        items.push(...siguiente.items);
    }
    return { ...primera, items };
};
export const facturacionAuditoriaService = {
    reabrir: async (id: number, version: string, motivo: string) => {
        if (!version || !motivo.trim()) throw new Error("Actualiza el reporte e indica el motivo de revisión");
        const result = await rpc<FacturacionReporte>("f_post_compensacion_facturacion_auditoria_reabrir", {
            p_id: id,
            p_version: version,
            p_motivo: motivo.trim(),
        });
        if (Number(result.id) !== id || result.estado_evento !== "PENDIENTE") throw new Error("No se confirmó la reapertura solicitada");
        return result;
    },
    anular: async (id: number, motivo: string) => {
        if (motivo.trim().length < 10) throw new Error("Explica el motivo de la anulación con al menos 10 caracteres");
        const result = await rpc<FacturacionReporte>("f_post_compensacion_facturacion_auditoria_anular", { p_id: id, p_motivo: motivo.trim() });
        if (Number(result.id) !== id || result.estado_evento !== "ANULADO") throw new Error("No se confirmó la anulación solicitada");
        return result;
    },
    contexto: () => rpc<FacturacionContexto>("f_get_compensacion_facturacion_auditoria_contexto"),
    operaciones: async (dni: string) => {
        dniValido(dni);
        const result = await rpc<{ dni: string; items: FacturacionOperacion[]; limite: number }>("f_get_compensacion_facturacion_auditoria_operaciones", {
            p_dni: dni,
        });
        if (result.dni !== dni || !Array.isArray(result.items) || result.items.some((item) => item.dni !== dni))
            throw new Error("La respuesta no corresponde al DNI consultado");
        return result.items;
    },
    listar: async (f: FacturacionFiltros) => {
        if (f.dni) dniValido(f.dni);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(f.hasta) || f.desde > f.hasta) throw new Error("Selecciona un rango válido");
        if (f.estado !== "APROBADO") return pedirPagina(f, f.estado || null, f.pagina, f.tamano);
        // El servidor guarda Liquidado como estado aparte; para el usuario sigue siendo Aprobado.
        const necesarios = f.pagina * f.tamano;
        const [aprobados, liquidados] = await Promise.all([reunir(f, "APROBADO", necesarios), reunir(f, "LIQUIDADO", necesarios)]);
        const items = [...aprobados.items, ...liquidados.items]
            .sort((a, b) => Date.parse(b.fecha_evento) - Date.parse(a.fecha_evento) || b.id - a.id)
            .slice((f.pagina - 1) * f.tamano, necesarios);
        return {
            items,
            total: aprobados.total + liquidados.total,
            pendientes: aprobados.pendientes + liquidados.pendientes,
            aprobado: aprobados.aprobado + liquidados.aprobado,
        };
    },
    guardar: (f: FacturacionRegistro) => {
        dniValido(f.dni);
        if (!f.descripcion.trim()) throw new Error("Completa la descripción");
        if (f.tipo === "DETECCION_ERROR_PAGO" && (!f.operacion || !f.error)) throw new Error("Selecciona operación y error de monto/cuenta");
        if (f.tipo === "OPERACION_EXTRA" && !f.codigo.trim()) throw new Error("Ingresa el código del comprobante externo");
        if (f.tipo === "OPERACION_EXTRA" && !f.id && f.operacion) throw new Error("Reporta antes de ingresar la operación");
        if (!f.id && !f.clave) throw new Error("Falta la clave de registro");
        return rpc<FacturacionReporte>("f_post_compensacion_facturacion_auditoria_guardar", {
            p_tipo: f.tipo,
            p_dni: f.dni,
            p_codigo_externo: f.codigo.trim() || null,
            p_evidencia: f.evidencia.trim(),
            p_descripcion: f.descripcion.trim(),
            p_error: f.error,
            p_id_operacion: f.operacion,
            p_id: f.id ?? null,
            p_clave: f.clave ?? null,
        }).then((result) => {
            if (!Number.isSafeInteger(Number(result.id)) || Number(result.id) <= 0 || !result.estado_evento || (f.id != null && Number(result.id) !== f.id))
                throw new Error("No se confirmó el reporte solicitado; actualiza el listado antes de reintentar");
            return result;
        });
    },
    resolver: (id: number, decision: "APROBADO" | "RECHAZADO", comentario: string, version?: string) => {
        if (comentario.trim().length < 10) throw new Error("Explica la revisión (mínimo diez caracteres)");
        if (!version) throw new Error("Actualiza el reporte antes de decidir");
        return rpc<FacturacionReporte>("f_post_compensacion_auditoria_revision", {
            p_id: id,
            p_version: version,
            p_decision: decision,
            p_comentario: comentario.trim(),
        }).then((result) => {
            if (Number(result.id) !== id || result.estado_evento !== decision) throw new Error("No se confirmó la decisión solicitada; actualiza el listado");
            return result;
        });
    },
};
