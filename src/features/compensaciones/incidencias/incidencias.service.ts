import { supabase } from "@/lib/supabase";
import type { IncidenciaCatalogo, IncidenciaCreateValues, IncidenciaEvento, IncidenciaRevision, IncidenciasResult } from "./incidencias.types";

type JsonRecord = Record<string, unknown>;
const recordValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const arrayValue = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(recordValue) : [];
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableNumber = (value: unknown) => value === null || value === undefined || value === "" ? null : numberValue(value);
const nullableString = (value: unknown) => value === null || value === undefined || value === "" ? null : String(value);
const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => { const { data, error } = await supabase.rpc(name, params); if (error) throw error; return data as T; };

const mapRevision = (value: unknown): IncidenciaRevision => {
    const row = recordValue(value);
    return { id: numberValue(row.id), numeroPaso: numberValue(row.numero_paso), etapa: String(row.etapa ?? ""), decision: String(row.decision ?? ""), comentario: nullableString(row.comentario), usuarioRevisorNombre: String(row.usuario_revisor_nombre ?? ""), fechaRegistro: String(row.fecha_registro ?? ""), datosDecision: recordValue(row.datos_decision) };
};

const mapEvent = (value: unknown): IncidenciaEvento => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id), idTipoEvento: numberValue(row.id_tipo_evento), idPenalidadTipo: numberValue(row.id_penalidad_tipo),
        tipoEventoNombre: String(row.tipo_evento_nombre ?? ""), categoria: String(row.categoria ?? "PENALIDAD") as IncidenciaEvento["categoria"],
        penalidadNombre: String(row.penalidad_nombre ?? ""), montoReferencia: numberValue(row.monto_referencia), montoBonoReportante: nullableNumber(row.monto_bono_reportante), requiereRespuesta: Boolean(row.requiere_respuesta),
        reportanteNombre: nullableString(row.reportante_nombre), reportanteDocumento: nullableString(row.reportante_documento), responsableNombre: String(row.responsable_nombre ?? ""), responsableDocumento: String(row.responsable_documento ?? ""),
        sucursalOrigenNombre: nullableString(row.sucursal_origen_nombre), sucursalResponsableNombre: nullableString(row.sucursal_responsable_nombre), fechaEvento: String(row.fecha_evento ?? ""), titulo: nullableString(row.titulo), motivo: nullableString(row.descripcion),
        evidencia: Array.isArray(row.evidencia) ? row.evidencia : [], estado: String(row.estado_evento ?? "BORRADOR") as IncidenciaEvento["estado"], importeAprobado: nullableNumber(row.importe_aprobado), usuarioRegistraNombre: String(row.usuario_registra_nombre ?? ""), revisiones: arrayValue(row.revisiones).map(mapRevision),
    };
};

export const incidenciasService = {
    async getCatalog(responsibleId?: number, date?: string): Promise<IncidenciaCatalogo> {
        const data = recordValue(await rpc<unknown>("f_get_tb_compensacion_incidencia_catalogo", { p_fecha_evento: date || null, p_id_colaborador_responsable: responsibleId || null }));
        const people = (value: unknown) => arrayValue(value).map((row) => ({ id: numberValue(row.id), nombre: String(row.nombre ?? ""), documento: String(row.documento ?? ""), idSucursal: numberValue(row.id_sucursal), sucursal: String(row.sucursal ?? "") }));
        return {
            tipos: arrayValue(data.tipos).map((row) => ({ id: numberValue(row.id), codigo: String(row.codigo ?? ""), nombre: String(row.nombre ?? ""), categoria: String(row.categoria ?? "PENALIDAD") as "PENALIDAD" | "AUDITORIA_PAGO", requiereCliente: Boolean(row.requiere_cliente), requiereOperacion: Boolean(row.requiere_operacion) })),
            reportantes: people(data.reportantes), responsables: people(data.responsables),
            penalidades: arrayValue(data.penalidades).map((row) => ({ id: numberValue(row.id), codigo: String(row.codigo ?? ""), nombre: String(row.nombre ?? ""), descripcion: nullableString(row.descripcion), montoReferencia: numberValue(row.monto_referencia), montoBonoReportante: nullableNumber(row.monto_bono_reportante), requiereRespuesta: Boolean(row.requiere_respuesta) })),
        };
    },
    async getList(filters: { tray: string; category: string; status: string; penaltyId: number; search: string; from: string; to: string; page: number; pageSize: number }): Promise<IncidenciasResult> {
        const data = recordValue(await rpc<unknown>("f_get_tb_compensacion_incidencia", { p_bandeja: filters.tray, p_busqueda: filters.search.trim() || null, p_categoria: filters.category || null, p_estado_evento: filters.status || null, p_fecha_desde: filters.from || null, p_fecha_hasta: filters.to || null, p_id: null, p_id_colaborador: null, p_id_penalidad_tipo: filters.penaltyId || null, p_id_sucursal: null, p_pagina: filters.page, p_tamano_pagina: filters.pageSize }));
        const summary = recordValue(data.resumen);
        return { items: arrayValue(data.items).map(mapEvent), resumen: { recibidosPendientes: numberValue(summary.recibidos_pendientes), aprobados: numberValue(summary.aprobados), rechazados: numberValue(summary.rechazados), anulados: numberValue(summary.anulados), totalDescuentosAprobados: numberValue(summary.total_descuentos_aprobados), totalBonosReportantes: numberValue(summary.total_bonos_reportantes) }, totalPages: numberValue(data.total_paginas) };
    },
    async create(values: IncidenciaCreateValues) {
        const references: JsonRecord[] = [];
        if (values.clienteId || values.clienteDocumento) references.push({ tipo_referencia: "CLIENTE", id_cliente: values.clienteId, identificador_externo: values.clienteDocumento || null, datos_snapshot: { documento: values.clienteDocumento, nombre: values.clienteNombre } });
        if (values.operacionId) references.push({ tipo_referencia: "OPERACION", id_operacion: values.operacionId, datos_snapshot: {} });
        const data = recordValue(await rpc<unknown>("f_post_tb_compensacion_incidencia", { p_clave_origen: null, p_evidencia: values.evidenciaUrl ? [{ tipo: "ENLACE", url: values.evidenciaUrl }] : [], p_fecha_evento: new Date(values.fechaEvento).toISOString(), p_fuente: "MANUAL", p_id_colaborador_reportante: values.idReportante, p_id_colaborador_responsable: values.idResponsable, p_id_penalidad_tipo: values.idPenalidadTipo, p_id_tipo_evento: values.idTipoEvento, p_motivo: values.motivo, p_referencias: references, p_titulo: values.titulo || null }));
        return numberValue(data.id);
    },
    send: (id: number, comment = "") => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_enviar", { p_comentario: comment.trim() || null, p_id: id }),
    discharge: (id: number, comment: string, evidenceUrl: string) => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_descargo", { p_comentario: comment.trim(), p_evidencia: evidenceUrl ? [{ tipo: "ENLACE", url: evidenceUrl }] : [], p_id: id }),
    resolve: (id: number, decision: "APROBADO" | "RECHAZADO", comment: string) => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_resolver", { p_comentario: comment.trim() || null, p_decision: decision, p_id: id }),
    observe: (id: number, comment: string) => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_observar", { p_comentario: comment.trim(), p_id: id }),
    annul: (id: number, reason: string) => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_anular", { p_id: id, p_motivo: reason.trim() }),
};
