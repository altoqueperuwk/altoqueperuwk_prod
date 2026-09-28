import { supabase } from "@/lib/supabase";
import type { EvidenciaCreateValues, EvidenciaEvento, EvidenciaReferencia, EvidenciaRevision, EvidenciasResult, EvidenciaTipo } from "./evidencias.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const arrayValue = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(recordValue) : [];
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableNumber = (value: unknown) => value === null || value === undefined || value === "" ? null : numberValue(value);
const nullableString = (value: unknown) => value === null || value === undefined || value === "" ? null : String(value);

const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

const mapReference = (value: unknown): EvidenciaReferencia => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        tipoReferencia: String(row.tipo_referencia ?? ""),
        idCliente: nullableNumber(row.id_cliente),
        idOperacion: nullableNumber(row.id_operacion),
        identificadorExterno: nullableString(row.identificador_externo),
    };
};

const mapRevision = (value: unknown): EvidenciaRevision => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        numeroPaso: numberValue(row.numero_paso),
        etapa: String(row.etapa ?? ""),
        decision: String(row.decision ?? ""),
        comentario: nullableString(row.comentario),
        usuarioRevisorNombre: String(row.usuario_revisor_nombre ?? ""),
        fechaRegistro: String(row.fecha_registro ?? ""),
    };
};

const mapEvent = (value: unknown): EvidenciaEvento => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idTipoEvento: numberValue(row.id_tipo_evento),
        tipoCodigo: String(row.tipo_codigo ?? ""),
        tipoNombre: String(row.tipo_nombre ?? ""),
        categoria: String(row.categoria ?? "OTRO") as EvidenciaEvento["categoria"],
        conceptoNombre: nullableString(row.concepto_nombre),
        beneficiarioNombre: nullableString(row.beneficiario_nombre),
        beneficiarioDocumento: nullableString(row.beneficiario_documento),
        responsableNombre: nullableString(row.responsable_nombre),
        sucursalOrigenNombre: nullableString(row.sucursal_origen_nombre),
        fechaEvento: String(row.fecha_evento ?? ""),
        periodoImputacion: String(row.periodo_imputacion ?? ""),
        titulo: nullableString(row.titulo),
        descripcion: nullableString(row.descripcion),
        datos: recordValue(row.datos),
        evidencia: Array.isArray(row.evidencia) ? row.evidencia : [],
        estado: String(row.estado_evento ?? "BORRADOR") as EvidenciaEvento["estado"],
        baseCalculo: nullableNumber(row.base_calculo),
        cantidad: nullableNumber(row.cantidad),
        tarifaAplicada: nullableNumber(row.tarifa_aplicada),
        importeAprobado: nullableNumber(row.importe_aprobado),
        usuarioRegistraNombre: String(row.usuario_registra_nombre ?? ""),
        fechaRegistro: String(row.fecha_registro ?? ""),
        referencias: arrayValue(row.referencias).map(mapReference),
        revisiones: arrayValue(row.revisiones).map(mapRevision),
    };
};

export const evidenciasService = {
    async getTypes(): Promise<EvidenciaTipo[]> {
        const data = await rpc<unknown[]>("f_get_tb_compensacion_evento_tipo", {
            p_busqueda: null,
            p_categoria: null,
            p_id: null,
            p_id_estado: null,
        });
        return arrayValue(data).map((value) => ({
            id: numberValue(value.id),
            codigo: String(value.codigo ?? ""),
            nombre: String(value.nombre ?? ""),
            categoria: String(value.categoria ?? "OTRO") as EvidenciaTipo["categoria"],
            conceptoNombre: nullableString(value.concepto_nombre),
            requiereBeneficiario: Boolean(value.requiere_beneficiario),
            requiereResponsable: Boolean(value.requiere_responsable),
            requiereCliente: Boolean(value.requiere_cliente),
            requiereOperacion: Boolean(value.requiere_operacion),
            configuracion: recordValue(value.configuracion),
            estadoNombre: String(value.estado_nombre ?? ""),
        }));
    },

    async getList(filters: { search?: string; category?: string; status?: string; typeId?: number; from?: string; to?: string; page: number; pageSize: number }): Promise<EvidenciasResult> {
        const data = recordValue(await rpc<unknown>("f_get_tb_compensacion_evento", {
            p_busqueda: filters.search?.trim() || null,
            p_categoria: filters.category || null,
            p_estado_evento: filters.status || null,
            p_fecha_desde: filters.from || null,
            p_fecha_hasta: filters.to || null,
            p_id: null,
            p_id_colaborador: null,
            p_id_sucursal: null,
            p_id_tipo_evento: filters.typeId || null,
            p_pagina: filters.page,
            p_tamano_pagina: filters.pageSize,
        }));
        const summary = recordValue(data.resumen);
        return {
            items: arrayValue(data.items).map(mapEvent),
            resumen: {
                borradores: numberValue(summary.borradores),
                pendientes: numberValue(summary.pendientes),
                aprobados: numberValue(summary.aprobados),
                rechazados: numberValue(summary.rechazados),
                anulados: numberValue(summary.anulados),
                importeAprobado: numberValue(summary.importe_aprobado),
            },
            total: numberValue(data.total),
            page: numberValue(data.pagina) || filters.page,
            pageSize: numberValue(data.tamano_pagina) || filters.pageSize,
            totalPages: numberValue(data.total_paginas),
        };
    },

    async create(values: EvidenciaCreateValues) {
        const references: JsonRecord[] = [];
        if (values.clienteId || values.clienteDocumento) references.push({
            tipo_referencia: "CLIENTE",
            id_cliente: values.clienteId,
            identificador_externo: values.clienteDocumento || null,
            datos_snapshot: { documento: values.clienteDocumento, nombre: values.clienteNombre },
        });
        if (values.operacionId) references.push({ tipo_referencia: "OPERACION", id_operacion: values.operacionId, datos_snapshot: {} });
        const result = await rpc<JsonRecord>("f_post_tb_compensacion_evento", {
            p_clave_origen: null,
            p_datos: {
                cliente_documento: values.clienteDocumento || null,
                cliente_nombre: values.clienteNombre || null,
                estrellas: values.estrellas,
            },
            p_descripcion: values.descripcion || null,
            p_evidencia: values.evidenciaUrl ? [{ tipo: "ENLACE", url: values.evidenciaUrl }] : [],
            p_fecha_evento: new Date(values.fechaEvento).toISOString(),
            p_fuente: "MANUAL",
            p_id_colaborador_beneficiario: values.idBeneficiario,
            p_id_colaborador_responsable: values.idResponsable,
            p_id_sucursal_origen: null,
            p_id_sucursal_responsable: null,
            p_id_tipo_evento: values.idTipoEvento,
            p_periodo_imputacion: `${values.fechaEvento.slice(0, 7)}-01`,
            p_referencias: references,
            p_titulo: values.titulo || null,
        });
        return numberValue(result.id);
    },

    send(id: number, comment?: string) {
        return rpc<JsonRecord>("f_post_tb_compensacion_evento_enviar", { p_comentario: comment?.trim() || null, p_id: id });
    },

    resolve(id: number, decision: "APROBADO" | "RECHAZADO", comment: string, base: number | null, quantity: number | null) {
        return rpc<JsonRecord>("f_post_tb_compensacion_evento_resolver", {
            p_base_calculo: base,
            p_cantidad: quantity,
            p_comentario: comment.trim() || null,
            p_decision: decision,
            p_id: id,
        });
    },

    observe(id: number, comment: string) {
        return rpc<JsonRecord>("f_post_tb_compensacion_evento_observar", { p_comentario: comment.trim(), p_id: id });
    },

    annul(id: number, reason: string) {
        return rpc<JsonRecord>("f_post_tb_compensacion_evento_anular", { p_id: id, p_motivo: reason.trim() });
    },
};
