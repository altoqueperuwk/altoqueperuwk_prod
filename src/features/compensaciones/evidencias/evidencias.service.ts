import { supabase } from "@/lib/supabase";
import { leerTarifaRegistro } from "./evidencia-tarifa";
import type {
    CalificacionPolitica,
    CalificacionesResult,
    EvidenciaCreateValues,
    EvidenciaEvento,
    EvidenciaReferencia,
    EvidenciaRevision,
    EvidenciaTipo,
    EvidenciasResult,
    InnovacionImplementacion,
    LlamadaContexto,
    TiktokEvidenceAttachment,
    TiktokOperacionLookup,
} from "./evidencias.types";
import type { CardEvidenceAttachment } from "./tarjetas-evidence.service";

type JsonRecord = Record<string, unknown>;

export interface TiktokCuotaContexto {
    requiereCuota: boolean;
    cuotaCumplida: boolean | null;
    comentario: string;
    fecha: string | null;
}

const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const nullableNumber = (value: unknown) => (value === null || value === undefined || value === "" ? null : numberValue(value));
const nullableString = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));
const TIKTOK_EVIDENCE_BUCKET = "compensaciones-tiktok-live";

const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

const confirmedEvent = (value: JsonRecord | null): JsonRecord => {
    if (!value || value.error || !Number.isSafeInteger(Number(value.id)) || Number(value.id) <= 0) {
        throw new Error("No se confirmó el registro. Reintenta con los mismos datos para verificarlo sin duplicar.");
    }
    return value;
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
        fechaRegistro: String(row.fecha_revision ?? row.fecha_registro ?? ""),
    };
};

const mapEvent = (value: unknown): EvidenciaEvento => {
    const row = recordValue(value);
    return {
        calificacionValida: typeof row.valida === "boolean" ? row.valida : undefined,
        fechaActualizacion: nullableString(row.fecha_actualizacion) ?? undefined,
        id: numberValue(row.id),
        idTipoEvento: numberValue(row.id_tipo_evento),
        tipoCodigo: String(row.tipo_codigo ?? ""),
        tipoNombre: String(row.tipo_nombre ?? ""),
        categoria: String(row.categoria ?? "OTRO") as EvidenciaEvento["categoria"],
        conceptoNombre: nullableString(row.concepto_nombre),
        idColaboradorBeneficiario: nullableNumber(row.id_colaborador_beneficiario),
        idColaboradorResponsable: nullableNumber(row.id_colaborador_responsable),
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
        tarifaRegistro: leerTarifaRegistro(row.criterios_validacion_snapshot),
        importeAprobado: nullableNumber(row.importe_aprobado),
        usuarioRegistraNombre: recordValue(row.datos).autor_externo === true ? "Cliente · formulario público" : String(row.usuario_registra_nombre ?? ""),
        usuarioRegistraId: nullableNumber(row.id_usuario_registra),
        fechaRegistro: String(row.fecha_registro ?? ""),
        referencias: arrayValue(row.referencias).map(mapReference),
        revisiones: arrayValue(row.revisiones).map(mapRevision),
    };
};

export const evidenciasService = {
    async registerInnovation(values: EvidenciaCreateValues, key: string, send: boolean) {
        const result = confirmedEvent(
            await rpc<JsonRecord>("f_post_compensacion_atc_innovacion_registrar", {
                p_fecha: values.fechaEvento.slice(0, 10),
                p_titulo: values.titulo.trim(),
                p_descripcion: values.descripcion.trim(),
                p_clave: key,
                p_enviar: send,
            }),
        );
        if (result.estado_evento !== (send ? "PENDIENTE" : "BORRADOR")) throw new Error("La propuesta tiene otro estado. Actualiza y revisa el listado.");
        return Number(result.id);
    },
    async getInnovationImplementation(id: number): Promise<InnovacionImplementacion> {
        const data = recordValue(await rpc("f_get_compensacion_innovacion_implementacion", { p_id: id }));
        const proof = recordValue(data.constancia);
        return {
            version: String(data.version ?? ""),
            comprobada: data.comprobada === true,
            puedeRevisar: data.puede_revisar === true,
            bloqueado: data.bloqueado === true,
            constancia:
                data.comprobada === true
                    ? {
                          fecha: String(proof.fecha ?? ""),
                          evidencia: String(proof.evidencia ?? ""),
                          motivo: String(proof.motivo ?? ""),
                      }
                    : null,
            importeVariable: data.importe_variable === true,
            importeFijado: data.importe_fijado == null || !Number.isFinite(Number(data.importe_fijado)) ? null : Number(data.importe_fijado),
        };
    },

    // Con importe usa la sobrecarga de seis argumentos (innovación de Jefatura); sin importe, la tarifa de la regla.
    implementInnovation(id: number, version: string, date: string, evidence: string, reason: string, amount?: number) {
        return rpc<JsonRecord>("f_post_compensacion_innovacion_implementar", {
            p_id: id,
            p_version: version,
            p_fecha: date,
            p_evidencia: evidence.trim(),
            p_motivo: reason.trim(),
            ...(amount === undefined ? {} : { p_importe: amount }),
        });
    },

    async getTiktokQuota(id: number): Promise<TiktokCuotaContexto> {
        const data = recordValue(await rpc("f_get_compensacion_tiktok_cuota", { p_id: id }));
        const revision = recordValue(data.revision);
        return {
            requiereCuota: data.requiere_cuota === true,
            cuotaCumplida: typeof revision.cuota_cumplida === "boolean" ? revision.cuota_cumplida : null,
            comentario: String(revision.comentario ?? ""),
            fecha: nullableString(revision.fecha),
        };
    },

    reviewTiktokQuota(id: number, comment: string, quotaMet: boolean) {
        return rpc<JsonRecord>("f_post_compensacion_tiktok_cuota_resolver", {
            p_id: id,
            p_comentario: comment.trim(),
            p_cuota_cumplida: quotaMet,
        });
    },

    searchTiktokOperations: (code: string, dni: string) =>
        rpc<{ items: TiktokOperacionLookup[] }>("f_get_compensacion_tiktok_operaciones", { p_codigo: code.trim() || null, p_dni: dni.trim() || null }),

    async uploadTiktokEvidence(file: File): Promise<TiktokEvidenceAttachment> {
        const allowedTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const extension = allowedTypes[file.type];
        if (!extension) throw new Error("La evidencia debe ser una imagen JPG, PNG o WEBP");
        if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("La imagen debe pesar hasta 5 MB");
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("Inicia sesión nuevamente para adjuntar la evidencia");
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(TIKTOK_EVIDENCE_BUCKET).upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
        });
        if (error) throw error;
        return { tipo: "IMAGEN_TIKTOK", bucket: TIKTOK_EVIDENCE_BUCKET, path, nombre: file.name, mime_type: file.type, size: file.size };
    },

    async removeTiktokEvidence(path: string) {
        const { error } = await supabase.storage.from(TIKTOK_EVIDENCE_BUCKET).remove([path]);
        if (error) throw error;
    },

    async getTiktokEvidenceUrl(path: string) {
        const { data, error } = await supabase.storage.from(TIKTOK_EVIDENCE_BUCKET).createSignedUrl(path, 15 * 60);
        if (error) throw error;
        return data.signedUrl;
    },

    async getCollaboratorOptions() {
        const data = await rpc<unknown[]>("f_get_compensacion_evidencia_colaboradores", {});
        return arrayValue(data).map((row) => ({
            id: numberValue(row.id),
            idUsuario: nullableNumber(row.id_usuario),
            nombreCompleto: String(row.nombre_completo ?? ""),
            numeroDocumento: String(row.numero_documento ?? ""),
        }));
    },
    async getRatings(filters: {
        search: string;
        advisor: number;
        stars: number;
        status: string;
        from: string;
        to: string;
        page: number;
        pageSize: number;
    }): Promise<CalificacionesResult> {
        const data = recordValue(
            await rpc("f_get_compensacion_calificaciones", {
                p_busqueda: filters.search.trim() || null,
                p_id_asesor: filters.advisor || null,
                p_estrellas: filters.stars || null,
                p_estado: filters.status || null,
                p_desde: filters.from || null,
                p_hasta: filters.to || null,
                p_pagina: filters.page,
                p_tamano: filters.pageSize,
            }),
        );
        const summary = recordValue(data.resumen);
        const policy = recordValue(data.politica);
        return {
            items: arrayValue(data.items).map(mapEvent),
            total: numberValue(data.total),
            totalPages: numberValue(data.total_paginas),
            pendientes: numberValue(summary.pendientes),
            aprobados: numberValue(summary.aprobados),
            noValidas: numberValue(summary.no_validas),
            importeAprobado: numberValue(summary.importe_aprobado),
            politica: {
                dni_obligatorio: policy.dni_obligatorio !== false,
                comentario_obligatorio: policy.comentario_obligatorio === true,
                asesor_obligatorio: policy.asesor_obligatorio === true,
            },
            puedeConfigurar: data.puede_configurar === true,
            puedeAdministrar: data.puede_administrar === true,
            asesores: arrayValue(data.asesores).map((r) => ({ id: numberValue(r.id), nombre: String(r.nombre ?? "Sin asesor") })),
            ranking: arrayValue(data.ranking).map((r) => ({
                id: numberValue(r.id),
                nombre: String(r.nombre ?? "Sin asesor"),
                cantidad: numberValue(r.cantidad),
            })),
            distribucion: arrayValue(data.distribucion).map((r) => ({ estrellas: numberValue(r.estrellas), cantidad: numberValue(r.cantidad) })),
        };
    },

    administerRating(
        item: EvidenciaEvento,
        action: "EDITAR" | "PENDIENTE" | "RECHAZADO",
        reason: string,
        values?: { stars: number; dni: string; comment: string },
    ) {
        return rpc("f_patch_compensacion_calificacion_administrar", {
            p_id: item.id,
            p_accion: action,
            p_version: item.fechaActualizacion ?? null,
            p_motivo: reason.trim(),
            p_estrellas: values?.stars ?? null,
            p_dni: values?.dni.trim() ?? null,
            p_comentario: values?.comment.trim() ?? null,
        });
    },
    saveRatingPolicy(policy: CalificacionPolitica) {
        return rpc("f_put_compensacion_calificacion_validez", {
            p_dni_obligatorio: policy.dni_obligatorio,
            p_comentario_obligatorio: policy.comentario_obligatorio,
            p_asesor_obligatorio: policy.asesor_obligatorio,
        });
    },
    async getCallContext(): Promise<LlamadaContexto> {
        const data = recordValue(await rpc("f_get_compensacion_llamada_contexto", {}));
        return {
            idUsuario: numberValue(data.id_usuario),
            idColaborador: nullableNumber(data.id_colaborador),
            puedeRegistrar: data.puede_registrar === true,
            puedeAprobar: data.puede_aprobar === true,
            puedeRevisar: data.puede_revisar === true,
        };
    },

    async getCallsContext(): Promise<LlamadaContexto> {
        const data = recordValue(await rpc("f_get_compensacion_llamadas_contexto", {}));
        return {
            idUsuario: numberValue(data.id_usuario),
            idColaborador: nullableNumber(data.id_colaborador),
            puedeRegistrar: data.puede_registrar === true,
            puedeAprobar: data.puede_aprobar === true,
            puedeRevisar: data.puede_revisar === true,
            puedeElegirColaborador: data.puede_elegir_colaborador === true,
            colaboradores: arrayValue(data.colaboradores).map((c) => ({ id: numberValue(c.id), nombre: String(c.nombre), sede: String(c.sede) })),
        };
    },
    async getCardContext(): Promise<LlamadaContexto> {
        const data = recordValue(await rpc("f_get_compensacion_tarjeta_contexto", {}));
        return {
            idUsuario: numberValue(data.id_usuario),
            idColaborador: nullableNumber(data.id_colaborador),
            puedeRegistrar: data.puede_registrar === true,
            puedeAprobar: data.puede_aprobar === true,
            puedeRevisar: data.puede_revisar === true,
        };
    },
    async registerCall(dni: string, nombre: string, clave: string, colaborador?: number, celular?: string | null, evidencia?: string) {
        return confirmedEvent(
            await rpc<JsonRecord>("f_post_compensacion_llamada_trazable", {
                p_evidencia: evidencia?.trim() || null,
                p_dni: dni.trim(),
                p_nombre: nombre.trim(),
                p_clave: clave,
                p_id_colaborador: colaborador ?? null,
                p_celular: celular?.trim() || null,
            }),
        );
    },

    async registerCard(dni: string, nombre: string, fecha: string, notas: string, ultimos4: string, clave: string, evidencia?: string, codigo?: string | null) {
        return confirmedEvent(
            await rpc<JsonRecord>("f_post_compensacion_tarjeta_trazable", {
                p_evidencia: evidencia?.trim() || null,
                p_codigo_operacion: codigo?.trim() || null,
                p_dni: dni.trim(),
                p_nombre: nombre.trim(),
                p_fecha: fecha,
                p_notas: notas.trim(),
                p_clave: clave,
                p_tarjeta_ultimos4: ultimos4.trim(),
            }),
        );
    },

    async registerCardFile(
        dni: string,
        nombre: string,
        fecha: string,
        notas: string,
        ultimos4: string,
        clave: string,
        evidence: CardEvidenceAttachment,
        codigo?: string | null,
    ) {
        return confirmedEvent(
            await rpc<JsonRecord>("f_post_compensacion_tarjeta_archivo_trazable", {
                p_dni: dni.trim(),
                p_nombre: nombre.trim(),
                p_fecha: fecha,
                p_notas: notas.trim(),
                p_clave: clave,
                p_evidencia: evidence,
                p_codigo_operacion: codigo?.trim() || null,
                p_tarjeta_ultimos4: ultimos4.trim(),
            }),
        );
    },

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

    async getList(filters: {
        eventId?: number;
        search?: string;
        documentoCliente?: string;
        nombreCliente?: string;
        colaborador?: string;
        category?: string;
        status?: string;
        typeId?: number;
        from?: string;
        to?: string;
        page: number;
        pageSize: number;
    }): Promise<EvidenciasResult> {
        const separatedCallFilters =
            ["LLAMADA", "TARJETA_TERCERO"].includes(filters.category ?? "") &&
            Boolean(filters.documentoCliente?.trim() || filters.nombreCliente?.trim() || filters.colaborador?.trim());
        const data = recordValue(
            await rpc<unknown>(
                separatedCallFilters
                    ? filters.category === "LLAMADA"
                        ? "f_get_compensacion_llamadas_filtradas"
                        : "f_get_compensacion_tarjetas_filtradas"
                    : "f_get_tb_compensacion_evento",
                {
                    ...(separatedCallFilters
                        ? {
                              p_documento_cliente: filters.documentoCliente?.trim() || null,
                              p_nombre_cliente: filters.nombreCliente?.trim() || null,
                              p_colaborador: filters.colaborador?.trim() || null,
                          }
                        : {}),
                    p_busqueda: filters.search?.trim() || null,
                    p_categoria: filters.category || null,
                    p_estado_evento: filters.status || null,
                    p_fecha_desde: filters.from || null,
                    p_fecha_hasta: filters.to || null,
                    p_id: filters.eventId || null,
                    p_id_colaborador: null,
                    p_id_sucursal: null,
                    p_id_tipo_evento: filters.typeId || null,
                    p_pagina: filters.page,
                    p_tamano_pagina: filters.pageSize,
                },
            ),
        );
        if (!Array.isArray(data.items) || !data.resumen || typeof data.resumen !== "object") throw new Error("No se confirmó la consulta de registros");
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

    async create(values: EvidenciaCreateValues, tiktokAttachment?: TiktokEvidenceAttachment | null) {
        const references: JsonRecord[] = [];
        if (values.clienteId || values.clienteDocumento)
            references.push({
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
            p_evidencia: tiktokAttachment ? [tiktokAttachment] : values.evidenciaUrl ? [{ tipo: "ENLACE", url: values.evidenciaUrl }] : [],
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
        return Number(confirmedEvent(result).id);
    },

    send(id: number, comment?: string) {
        return rpc<JsonRecord>("f_post_tb_compensacion_evento_enviar", { p_comentario: comment?.trim() || null, p_id: id });
    },

    async updateInnovationDraft(id: number, title: string, description: string) {
        return confirmedEvent(
            await rpc<JsonRecord>("f_patch_tb_compensacion_evento", {
                p_id: id,
                p_titulo: title.trim(),
                p_descripcion: description.trim(),
            }),
        );
    },

    /** Propuesta propia aún pendiente de revisión (el borrador usa updateInnovationDraft). */
    async updateInnovationPending(id: number, title: string, description: string) {
        return confirmedEvent(
            await rpc<JsonRecord>("f_patch_compensacion_atc_innovacion_pendiente", { p_id: id, p_titulo: title.trim(), p_descripcion: description.trim() }),
        );
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

    approveLeadership(id: number, comment: string, checks: { chats: boolean }) {
        return rpc<JsonRecord>("f_post_compensacion_meta_jefatura_resolver", {
            p_id: id,
            p_comentario: comment.trim(),
            p_sin_chats_descuidados: checks.chats,
        });
    },

    observe(id: number, comment: string) {
        return rpc<JsonRecord>("f_post_tb_compensacion_evento_observar", { p_comentario: comment.trim(), p_id: id });
    },

    /** ATC edita su propia llamada o tarjeta mientras esté pendiente de revisión. */
    updateCapture(id: number, values: { dni: string; nombre: string; fecha?: string; notas?: string; celular?: string; ultimos4?: string }) {
        return rpc<JsonRecord>("f_patch_compensacion_captura", {
            p_id: id,
            p_dni: values.dni.trim(),
            p_nombre: values.nombre.trim(),
            p_fecha: values.fecha || null,
            p_notas: values.notas?.trim() || null,
            p_celular: values.celular?.trim() || null,
            p_tarjeta_ultimos4: values.ultimos4?.trim() || null,
        });
    },

    annul(id: number, reason: string) {
        return rpc<JsonRecord>("f_post_tb_compensacion_evento_anular", { p_id: id, p_motivo: reason.trim() });
    },
};
