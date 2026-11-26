import { supabase } from "@/lib/supabase";
import { type CazaErroresOption, cazaErroresOptions } from "./caza-errores-policy";
import type { IncidenciaPersonalConcept } from "./incidencia-personal-policy";
import type {
    IncidenciaCatalogo,
    IncidenciaCreateValues,
    IncidenciaEvento,
    IncidenciaRevision,
    IncidenciasResult,
    OperacionCliente,
} from "./incidencias.types";

type JsonRecord = Record<string, unknown>;
const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const nullableNumber = (value: unknown) => (value === null || value === undefined || value === "" ? null : numberValue(value));
const nullableString = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
const limaEventTime = (value: string) => new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}-05:00`).toISOString();
const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    // Supabase devuelve un objeto que no es Error: se normaliza para que la interfaz muestre el motivo real del servidor.
    if (error) throw new Error(error.message || "No fue posible completar la operación");
    return data as T;
};

const mapRevision = (value: unknown): IncidenciaRevision => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        numeroPaso: numberValue(row.numero_paso),
        etapa: String(row.etapa ?? ""),
        decision: String(row.decision ?? ""),
        comentario: nullableString(row.comentario),
        usuarioRevisorNombre: String(row.usuario_revisor_nombre ?? ""),
        fechaRegistro: String(row.fecha_registro ?? ""),
        datosDecision: recordValue(row.datos_decision),
    };
};

/** Cliente y operaciones adjuntas, tomados de las referencias guardadas con la incidencia. */
const referenceSummary = (value: unknown) => {
    const refs = arrayValue(value);
    const client = refs.find((ref) => ref.tipo_referencia === "CLIENTE");
    const snapshot = recordValue(client?.datos_snapshot);
    return {
        clienteNombre: nullableString(snapshot.nombre),
        clienteDocumento: nullableString(client?.identificador_externo ?? snapshot.documento),
        operaciones: refs
            .filter((ref) => ref.tipo_referencia === "OPERACION")
            .map((ref) => {
                const data = recordValue(ref.datos_snapshot);
                return { codigo: nullableString(data.codigo), tipo: nullableString(data.tipo) };
            }),
    };
};

const mapEvent = (value: unknown): IncidenciaEvento => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idTipoEvento: numberValue(row.id_tipo_evento),
        idPenalidadTipo: numberValue(row.id_penalidad_tipo),
        usuarioRegistraId: numberValue(row.id_usuario_registra),
        reportanteId: nullableNumber(row.id_colaborador_beneficiario),
        responsableId: nullableNumber(row.id_colaborador_responsable),
        tipoEventoNombre: String(row.tipo_evento_nombre ?? ""),
        categoria: String(row.categoria ?? "PENALIDAD") as IncidenciaEvento["categoria"],
        penalidadNombre: String(row.penalidad_nombre ?? ""),
        montoReferencia: numberValue(row.monto_referencia),
        montoBonoReportante: nullableNumber(row.monto_bono_reportante),
        requiereRespuesta: Boolean(row.requiere_respuesta),
        reportanteNombre: nullableString(row.reportante_nombre),
        reportanteDocumento: nullableString(row.reportante_documento),
        responsableNombre: String(row.responsable_nombre ?? ""),
        responsableDocumento: String(row.responsable_documento ?? ""),
        sucursalOrigenNombre: nullableString(row.sucursal_origen_nombre),
        sucursalResponsableNombre: nullableString(row.sucursal_responsable_nombre),
        fechaEvento: String(row.fecha_evento ?? ""),
        titulo: nullableString(row.titulo),
        motivo: nullableString(row.descripcion),
        evidencia: Array.isArray(row.evidencia) ? row.evidencia : [],
        estado: String(row.estado_evento ?? "BORRADOR") as IncidenciaEvento["estado"],
        importeAprobado: nullableNumber(row.importe_aprobado),
        usuarioRegistraNombre: String(row.usuario_registra_nombre ?? ""),
        revisiones: arrayValue(row.revisiones).map(mapRevision),
        datos: recordValue(row.datos),
        direccion: row.direccion === "ENVIADAS" || row.direccion === "RECIBIDAS" ? row.direccion : undefined,
        ...referenceSummary(row.referencias),
    };
};

const operationReferences = (values: IncidenciaCreateValues): JsonRecord[] =>
    (values.operaciones ?? []).map((item) => ({
        tipo_referencia: "OPERACION",
        id_operacion: item.id,
        datos_snapshot: { tipo: item.tipo, codigo: item.codigo, monto: item.monto, fecha: item.fecha, estado: item.estado },
    }));

export const incidenciasService = {
    async reviewContext(id: number) {
        const data = recordValue(await rpc<unknown>("f_get_compensacion_incidencia_revision_admin", { p_id: id }));
        if (
            data.id !== id ||
            typeof data.version !== "string" ||
            !data.version ||
            ["puede_aprobar", "puede_revisar", "puede_observar", "bloqueado", "requiere_descargo", "descargo_presentado"].some(
                (key) => typeof data[key] !== "boolean",
            ) ||
            typeof data.motivo !== "string" ||
            typeof data.efecto !== "string" ||
            typeof data.estado !== "string" ||
            !Array.isArray(data.fuentes) ||
            (data.descuento_estimado !== null && (typeof data.descuento_estimado !== "number" || !Number.isFinite(data.descuento_estimado)))
        )
            throw new Error("No se pudo verificar el expediente. Actualiza antes de decidir.");
        return data as unknown as {
            id: number;
            version: string;
            estado: string;
            puede_aprobar: boolean;
            puede_revisar: boolean;
            puede_observar: boolean;
            bloqueado: boolean;
            excepcion_independencia?: boolean;
            motivo: string;
            descuento_estimado: number | null;
            efecto: string;
            requiere_descargo: boolean;
            descargo_presentado: boolean;
            fuentes: Array<{ tipo: string; codigo: string; estado: string; monto: number | null }>;
        };
    },
    async reviewDecision(id: number, version: string, decision: "APROBADO" | "RECHAZADO" | "OBSERVADO", comment: string) {
        const data = recordValue(
            await rpc<unknown>("f_post_compensacion_incidencia_revision_admin", {
                p_id: id,
                p_version: version,
                p_decision: decision,
                p_comentario: comment.trim(),
            }),
        );
        if (Number(data.id) !== id) throw new Error("No se confirmó la decisión; actualiza antes de reintentar.");
        return data;
    },
    async savePersonal(values: IncidenciaCreateValues, concept: IncidenciaPersonalConcept, key: string, send: boolean) {
        const data = recordValue(
            await rpc<unknown>("f_post_compensacion_jefatura_incidencia_personal", {
                p_id_responsable: values.idResponsable,
                p_id_penalidad_tipo: values.idPenalidadTipo,
                p_concepto: concept,
                p_fecha_evento: limaEventTime(values.fechaEvento),
                p_motivo: values.motivo.trim(),
                p_evidencia: values.evidenciaUrl.trim() ? [{ tipo: "ENLACE", url: values.evidenciaUrl.trim() }] : [],
                p_clave: key,
                p_enviar: send,
            }),
        );
        const id = numberValue(data.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error("El servidor no confirmó el reporte");
        return id;
    },
    async getCatalog(responsibleId?: number, date?: string): Promise<IncidenciaCatalogo> {
        const data = recordValue(
            await rpc<unknown>("f_get_tb_compensacion_incidencia_catalogo", {
                p_fecha_evento: date || null,
                p_id_colaborador_responsable: responsibleId || null,
            }),
        );
        const people = (value: unknown) =>
            arrayValue(value).map((row) => ({
                id: numberValue(row.id),
                nombre: String(row.nombre ?? ""),
                documento: String(row.documento ?? ""),
                idSucursal: numberValue(row.id_sucursal),
                sucursal: String(row.sucursal ?? ""),
            }));
        return {
            tipos: arrayValue(data.tipos).map((row) => ({
                id: numberValue(row.id),
                codigo: String(row.codigo ?? ""),
                nombre: String(row.nombre ?? ""),
                categoria: String(row.categoria ?? "PENALIDAD") as "PENALIDAD" | "AUDITORIA_PAGO",
                requiereCliente: Boolean(row.requiere_cliente),
                requiereOperacion: Boolean(row.requiere_operacion),
            })),
            reportantes: people(data.reportantes),
            responsables: people(data.responsables),
            penalidades: arrayValue(data.penalidades).map((row) => ({
                id: numberValue(row.id),
                codigo: String(row.codigo ?? ""),
                nombre: String(row.nombre ?? ""),
                descripcion: nullableString(row.descripcion),
                montoReferencia: numberValue(row.monto_referencia),
                montoBonoReportante: nullableNumber(row.monto_bono_reportante),
                requiereRespuesta: Boolean(row.requiere_respuesta),
            })),
        };
    },
    async getList(filters: {
        eventId?: number;
        tray: string;
        category: string;
        status: string;
        penaltyId: number;
        search: string;
        from: string;
        to: string;
        page: number;
        pageSize: number;
        concept?: IncidenciaPersonalConcept | "TODOS" | "ESCALONADA";
        /** Códigos de penalidad a omitir de la lista general (p. ej. los que tienen su propia opción). */
        excludeCodes?: readonly string[];
    }): Promise<IncidenciasResult> {
        const data = recordValue(
            await rpc<unknown>(filters.concept ? "f_get_tb_compensacion_incidencia_personal" : "f_get_tb_compensacion_incidencia", {
                p_bandeja: filters.tray,
                p_busqueda: filters.search.trim() || null,
                p_categoria: filters.category || null,
                p_estado_evento: filters.status || null,
                p_fecha_desde: filters.from || null,
                p_fecha_hasta: filters.to || null,
                p_id: filters.eventId ?? null,
                p_id_colaborador: null,
                p_id_penalidad_tipo: filters.penaltyId || null,
                p_id_sucursal: null,
                p_pagina: filters.page,
                p_tamano_pagina: filters.pageSize,
                ...(filters.concept ? { p_concepto: filters.concept } : {}),
                ...(!filters.concept && filters.excludeCodes?.length ? { p_excluir_codigos: [...filters.excludeCodes] } : {}),
            }),
        );
        const summary = recordValue(data.resumen);
        return {
            items: arrayValue(data.items).map(mapEvent),
            resumen: {
                recibidosPendientes: numberValue(summary.recibidos_pendientes),
                aprobados: numberValue(summary.aprobados),
                rechazados: numberValue(summary.rechazados),
                anulados: numberValue(summary.anulados),
                totalDescuentosAprobados: numberValue(summary.total_descuentos_aprobados),
                totalBonosReportantes: numberValue(summary.total_bonos_reportantes),
            },
            totalPages: numberValue(data.total_paginas),
        };
    },
    async create(values: IncidenciaCreateValues, enviar = false, clave?: string) {
        const references: JsonRecord[] = [];
        if (values.clienteId || values.clienteDocumento)
            references.push({
                tipo_referencia: "CLIENTE",
                id_cliente: values.clienteId,
                identificador_externo: values.clienteDocumento || null,
                datos_snapshot: { documento: values.clienteDocumento, nombre: values.clienteNombre },
            });
        if (values.operacionId) references.push({ tipo_referencia: "OPERACION", id_operacion: values.operacionId, datos_snapshot: {} });
        const payload = {
            p_clave_origen: clave ?? crypto.randomUUID(),
            p_evidencia: values.evidenciaUrl ? [{ tipo: "ENLACE", url: values.evidenciaUrl }] : [],
            p_fecha_evento: limaEventTime(values.fechaEvento),
            p_fuente: "MANUAL",
            p_id_colaborador_reportante: values.idReportante,
            p_id_colaborador_responsable: values.idResponsable,
            p_id_penalidad_tipo: values.idPenalidadTipo,
            p_id_tipo_evento: values.idTipoEvento,
            p_motivo: values.motivo,
            p_referencias: references,
            p_titulo: values.titulo || null,
        };
        const data = recordValue(
            values.montoPerdido
                ? await rpc("f_post_compensacion_pagos_perdida", { p_values: { ...payload, monto_perdido: values.montoPerdido }, p_enviar: enviar })
                : await rpc<unknown>("f_post_tb_compensacion_incidencia", payload),
        );
        const id = numberValue(data.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error("El servidor no confirmó el registro de la incidencia");
        return id;
    },
    async createCazaErrores(values: IncidenciaCreateValues, option: CazaErroresOption, clave: string) {
        const references: JsonRecord[] = [
            {
                tipo_referencia: "CLIENTE",
                id_cliente: values.clienteId,
                identificador_externo: values.clienteDocumento,
                datos_snapshot: { documento: values.clienteDocumento, nombre: values.clienteNombre },
            },
            ...operationReferences(values),
        ];
        const data = recordValue(
            await rpc<unknown>("f_post_compensacion_caza_errores", {
                p_ruta: cazaErroresOptions[option].route,
                p_id_tipo_evento: values.idTipoEvento,
                p_id_penalidad_tipo: values.idPenalidadTipo,
                p_id_colaborador_responsable: values.idResponsable,
                p_fecha_evento: limaEventTime(values.fechaEvento),
                p_motivo: values.motivo.trim(),
                p_titulo: values.titulo.trim(),
                p_evidencia: values.evidenciaUrl.trim() ? [{ tipo: "ENLACE", url: values.evidenciaUrl.trim() }] : [],
                p_referencias: references,
                p_clave_origen: clave,
            }),
        );
        const id = numberValue(data.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error("El servidor no confirmó el hallazgo");
        return id;
    },
    async sendCazaErrores(id: number, option: CazaErroresOption) {
        const data = recordValue(
            await rpc<unknown>("f_post_compensacion_caza_errores_enviar", {
                p_ruta: cazaErroresOptions[option].route,
                p_id: id,
            }),
        );
        if (numberValue(data.id) !== id || data.estado_evento !== "PENDIENTE") throw new Error("El servidor no confirmó el envío del hallazgo");
        return data;
    },
    async createJefePenalty(id: number, code: string, reason: string) {
        const data = recordValue(
            await rpc<unknown>("f_post_compensacion_caza_errores_penalidad_jefe", {
                p_id_evento_origen: id,
                p_codigo_penalidad: code,
                p_motivo: reason.trim(),
            }),
        );
        const childId = numberValue(data.id);
        if (!Number.isSafeInteger(childId) || childId <= 0 || data.estado_evento !== "PENDIENTE")
            throw new Error("El servidor no confirmó la penalidad vinculada");
        return childId;
    },
    /** Lista operaciones recientes del cliente (solo lectura, función propia de Compensaciones). */
    async getClientOperations(document: string, code = ""): Promise<{ cliente: string | null; items: OperacionCliente[] }> {
        const data = recordValue(
            await rpc<unknown>("f_get_compensacion_operaciones_cliente", { p_documento: document, p_codigo: code.trim() || null, p_limite: 30 }),
        );
        return {
            cliente: nullableString(data.cliente),
            items: arrayValue(data.items).map((row) => ({
                id: numberValue(row.id),
                tipo: String(row.tipo ?? ""),
                codigo: nullableString(row.codigo),
                monto: nullableNumber(row.monto),
                fecha: nullableString(row.fecha),
                estado: nullableString(row.estado),
            })),
        };
    },
    async getTeamList(filters: {
        direction: string;
        status: string;
        search: string;
        from: string;
        to: string;
        page: number;
        pageSize: number;
        dni?: string;
        code?: string;
        grupo?: "AUDITORIA" | "PERSONAL" | "ESCALONADA";
    }) {
        const data = recordValue(
            await rpc<unknown>("f_get_compensacion_equipo_incidencias", {
                p_direccion: filters.direction || null,
                p_estado: filters.status || null,
                p_fecha_desde: filters.from || null,
                p_fecha_hasta: filters.to || null,
                p_busqueda: filters.search.trim() || null,
                p_pagina: filters.page,
                p_tamano: filters.pageSize,
                p_dni: filters.dni?.trim() || null,
                p_codigo: filters.code?.trim() || null,
                p_grupo: filters.grupo ?? null,
            }),
        );
        const summary = recordValue(data.resumen);
        return {
            items: arrayValue(data.items).map(mapEvent),
            resumen: {
                recibidasPendientes: numberValue(summary.recibidas_pendientes),
                enviadasPendientes: numberValue(summary.enviadas_pendientes),
                aprobadas: numberValue(summary.aprobadas),
                rechazadas: numberValue(summary.rechazadas),
            },
            totalPages: Math.max(1, numberValue(data.total_paginas)),
        };
    },
    /** Conformidad o descargo de la sede; no aprueba ni rechaza: decide Administración. */
    async respondTeam(id: number, stance: "CONFORME" | "DESCARGO", comment: string) {
        const data = recordValue(
            await rpc<unknown>("f_post_compensacion_equipo_incidencia_respuesta", { p_id: id, p_postura: stance, p_comentario: comment.trim() }),
        );
        if (numberValue(data.id) !== id) throw new Error("El servidor no confirmó la respuesta");
        return data;
    },
    async getCazaConsequences(id: number) {
        const data = await rpc<unknown>("f_get_compensacion_caza_errores_consecuencias", { p_id_evento_origen: id });
        return arrayValue(data).map((row) => ({
            tipo: String(row.tipo ?? ""),
            id: numberValue(row.id),
            codigo: String(row.codigo ?? ""),
            concepto: String(row.concepto ?? ""),
            estado: String(row.estado ?? ""),
            importeAprobado: nullableNumber(row.importe_aprobado),
        }));
    },
    async getCazaPersonal() {
        const data = await rpc<unknown>("f_get_compensacion_caza_errores_personal", {});
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            tipo: String(row.tipo_consecuencia ?? ""),
            concepto: String(row.concepto ?? ""),
            origen: String(row.concepto_origen ?? "Hallazgo de Auditoría Activa"),
            fecha: String(row.fecha_evento ?? ""),
            estado: String(row.estado ?? "PENDIENTE"),
            importe: nullableNumber(row.importe),
            idOrigen: numberValue(row.id_evento_origen),
        }));
    },
    updateDraft: (id: number, values: { titulo: string; motivo: string; evidenciaUrl: string }) =>
        rpc<JsonRecord>("f_patch_tb_compensacion_incidencia", {
            p_id: id,
            p_titulo: values.titulo.trim() || null,
            p_motivo: values.motivo.trim(),
            p_evidencia: values.evidenciaUrl.trim() ? [{ tipo: "ENLACE", url: values.evidenciaUrl.trim() }] : [],
        }),
    send: (id: number, comment = "") => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_enviar", { p_comentario: comment.trim() || null, p_id: id }),
    discharge: (id: number, comment: string, evidenceUrl: string) =>
        rpc<JsonRecord>("f_post_tb_compensacion_incidencia_descargo", {
            p_comentario: comment.trim(),
            p_evidencia: evidenceUrl ? [{ tipo: "ENLACE", url: evidenceUrl }] : [],
            p_id: id,
        }),
    resolve: (id: number, decision: "APROBADO" | "RECHAZADO", comment: string) =>
        rpc<JsonRecord>("f_post_tb_compensacion_incidencia_resolver", { p_comentario: comment.trim() || null, p_decision: decision, p_id: id }),
    observe: (id: number, comment: string) => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_observar", { p_comentario: comment.trim(), p_id: id }),
    annul: (id: number, reason: string) => rpc<JsonRecord>("f_post_tb_compensacion_incidencia_anular", { p_id: id, p_motivo: reason.trim() }),
};
