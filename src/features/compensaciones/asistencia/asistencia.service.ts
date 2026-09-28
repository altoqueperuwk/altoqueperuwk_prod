import { supabase } from "@/lib/supabase";
import type {
    AsistenciaCarga,
    AsistenciaImportRow,
    AsistenciaJornada,
    AsistenciaJornadasResult,
    AsistenciaResumen,
    AsistenciaSolicitud,
    AsistenciaSolicitudResumen,
    AsistenciaValidationResult,
} from "./asistencia.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const arrayValue = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(recordValue) : [];
const numberValue = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
const stringValue = (value: unknown) => String(value ?? "");
const nullableString = (value: unknown) => value === null || value === undefined || value === "" ? null : String(value);

const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

const mapSummary = (value: unknown): AsistenciaResumen => {
    const row = recordValue(value);
    return {
        integrantes: numberValue(row.integrantes),
        jornadas: numberValue(row.jornadas),
        tardanzas: numberValue(row.tardanzas),
        faltasEntrada: numberValue(row.faltas_entrada),
        faltasSalida: numberValue(row.faltas_salida),
        ausencias: numberValue(row.ausencias),
        diasCompletos: numberValue(row.dias_completos),
        pendientes: numberValue(row.pendientes),
    };
};

const mapJornada = (value: unknown): AsistenciaJornada => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idColaborador: numberValue(row.id_colaborador),
        colaboradorNombre: stringValue(row.colaborador_nombre),
        colaboradorDocumento: stringValue(row.colaborador_documento),
        fecha: stringValue(row.fecha),
        entradaProgramada: nullableString(row.entrada_programada),
        salidaProgramada: nullableString(row.salida_programada),
        entradaReal: nullableString(row.entrada_real),
        salidaReal: nullableString(row.salida_real),
        minutosTardanza: numberValue(row.minutos_tardanza),
        minutosExtra: numberValue(row.minutos_extra),
        minutosTrabajados: numberValue(row.minutos_trabajados),
        estadoDia: stringValue(row.estado_dia),
        fuente: stringValue(row.fuente),
        version: numberValue(row.version),
        observacion: nullableString(row.observacion),
        idSucursal: numberValue(row.id_sucursal),
        sucursalNombre: stringValue(row.sucursal_nombre),
        cargoNombre: stringValue(row.cargo_nombre),
    };
};

const mapSolicitud = (value: unknown): AsistenciaSolicitud => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idJornada: numberValue(row.id_jornada),
        idColaborador: numberValue(row.id_colaborador),
        colaboradorNombre: stringValue(row.colaborador_nombre),
        colaboradorDocumento: stringValue(row.colaborador_documento),
        fecha: stringValue(row.fecha),
        entradaReal: nullableString(row.entrada_real),
        salidaReal: nullableString(row.salida_real),
        estadoDia: stringValue(row.estado_dia),
        valoresActuales: recordValue(row.valores_actuales),
        valoresSolicitados: recordValue(row.valores_solicitados),
        motivo: stringValue(row.motivo),
        estadoSolicitud: stringValue(row.estado_solicitud),
        usuarioSolicitaNombre: stringValue(row.usuario_solicita_nombre),
        fechaSolicitud: stringValue(row.fecha_solicitud),
        motivoResolucion: nullableString(row.motivo_resolucion),
    };
};

const mapSolicitudSummary = (value: unknown): AsistenciaSolicitudResumen => {
    const row = recordValue(value);
    return { pendientes: numberValue(row.pendientes), aprobadas: numberValue(row.aprobadas), rechazadas: numberValue(row.rechazadas), anuladas: numberValue(row.anuladas) };
};

const mapCarga = (value: unknown): AsistenciaCarga => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        nombreArchivo: stringValue(row.nombre_archivo),
        formato: stringValue(row.formato),
        tamanoBytes: numberValue(row.tamano_bytes),
        nombreHoja: nullableString(row.nombre_hoja),
        fechaDesde: nullableString(row.fecha_desde),
        fechaHasta: nullableString(row.fecha_hasta),
        estadoCarga: stringValue(row.estado_carga),
        totalFilas: numberValue(row.total_filas),
        totalValidas: numberValue(row.total_validas),
        totalInvalidas: numberValue(row.total_invalidas),
        totalDuplicadas: numberValue(row.total_duplicadas),
        fechaRegistro: stringValue(row.fecha_registro),
        fechaConfirmacion: nullableString(row.fecha_confirmacion),
    };
};

export const asistenciaService = {
    async getJornadas(params: { from: string; to: string; search?: string; idSucursal?: number; estado?: string; page: number; pageSize: number }): Promise<AsistenciaJornadasResult> {
        const data = recordValue(await rpc<unknown>("f_get_tb_asistencia_jornada", {
            p_busqueda: params.search?.trim() || null,
            p_estado_dia: params.estado || null,
            p_fecha_desde: params.from,
            p_fecha_hasta: params.to,
            p_id_colaborador: null,
            p_id_sucursal: params.idSucursal || null,
            p_pagina: params.page,
            p_tamano_pagina: params.pageSize,
        }));
        return { items: arrayValue(data.items).map(mapJornada), summary: mapSummary(data.resumen), total: numberValue(data.total), totalPages: numberValue(data.total_paginas) };
    },

    async getSolicitudes(params: { from: string; to: string; estado?: string; page?: number; pageSize?: number }) {
        const data = recordValue(await rpc<unknown>("f_get_tb_asistencia_solicitud", {
            p_busqueda: null,
            p_estado_solicitud: params.estado || null,
            p_fecha_desde: params.from,
            p_fecha_hasta: params.to,
            p_id: null,
            p_id_colaborador: null,
            p_pagina: params.page ?? 1,
            p_tamano_pagina: params.pageSize ?? 20,
        }));
        return { items: arrayValue(data.items).map(mapSolicitud), summary: mapSolicitudSummary(data.resumen), total: numberValue(data.total), totalPages: numberValue(data.total_paginas) };
    },

    async createSolicitud(idJornada: number, values: JsonRecord, motivo: string) {
        return rpc<JsonRecord>("f_post_tb_asistencia_solicitud", { p_evidencia: [], p_id_jornada: idJornada, p_motivo: motivo, p_valores_solicitados: values });
    },

    async resolveSolicitud(id: number, decision: "APROBADA" | "RECHAZADA", reason: string) {
        return rpc<JsonRecord>("f_post_tb_asistencia_solicitud_resolver", { p_decision: decision, p_id: id, p_motivo_resolucion: reason });
    },

    async getCargas(): Promise<AsistenciaCarga[]> {
        const data = await rpc<unknown[]>("f_get_tb_asistencia_carga", { p_estado_carga: null, p_fecha_desde: null, p_fecha_hasta: null, p_id: null });
        return arrayValue(data).map(mapCarga);
    },

    async registerCarga(file: File, hash: string, sheetName: string) {
        return recordValue(await rpc<unknown>("f_post_tb_asistencia_carga", {
            p_formato: file.name.split(".").pop()?.toUpperCase() || "XLSX",
            p_hash_archivo: hash,
            p_mime_type: file.type || null,
            p_nombre_archivo: file.name,
            p_nombre_hoja: sheetName,
            p_ruta_archivo: `local-import://${hash}/${encodeURIComponent(file.name)}`,
            p_tamano_bytes: file.size,
            p_version_plantilla: "HUELLERO-1",
            p_zona_horaria: "America/Lima",
        }));
    },

    async validateCarga(idCarga: number, rows: AsistenciaImportRow[]): Promise<AsistenciaValidationResult> {
        const row = recordValue(await rpc<unknown>("f_post_tb_asistencia_carga_validar", { p_filas: rows, p_id_carga: idCarga }));
        return {
            idCarga: numberValue(row.id_carga),
            estadoCarga: stringValue(row.estado_carga),
            fechaDesde: nullableString(row.fecha_desde),
            fechaHasta: nullableString(row.fecha_hasta),
            totalFilas: numberValue(row.total_filas),
            totalValidas: numberValue(row.total_validas),
            totalInvalidas: numberValue(row.total_invalidas),
            totalDuplicadas: numberValue(row.total_duplicadas),
            errores: arrayValue(row.errores).map((error) => ({ numero_fila: numberValue(error.numero_fila), codigo_error: stringValue(error.codigo_error), mensaje: stringValue(error.mensaje) })),
        };
    },

    async confirmCarga(idCarga: number) {
        return rpc<JsonRecord>("f_post_tb_asistencia_carga_confirmar", { p_id_carga: idCarga });
    },
};

