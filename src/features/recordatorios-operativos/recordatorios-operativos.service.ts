import { supabase } from "@/lib/supabase";
import type {
    RecordatorioContexto,
    RecordatorioItem,
    RecordatorioNivel,
    RecordatorioPagina,
    RecordatorioResumen,
    RecordatorioVista,
} from "./recordatorios-operativos.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const stringValue = (value: unknown, fallback = "-") => value === null || value === undefined || value === "" ? fallback : String(value);

const rpc = async (name: string, params: JsonRecord = {}) => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
};

const mapItem = (value: unknown): RecordatorioItem => {
    const row = recordValue(value);
    return {
        id: numberValue(row.id),
        idOperacion: numberValue(row.id_operacion),
        nivelAlerta: numberValue(row.nivel_alerta) as RecordatorioNivel,
        codigoMensaje: stringValue(row.codigo_mensaje),
        comentario: stringValue(row.comentario),
        servicio: stringValue(row.servicio),
        codigoOperacion: stringValue(row.codigo_operacion),
        fechaOperacion: row.fecha_operacion ? String(row.fecha_operacion) : null,
        dni: stringValue(row.dni),
        cliente: stringValue(row.cliente, "Sin nombre"),
        sucursal: stringValue(row.sucursal, "Sin sede"),
        entidad: stringValue(row.entidad, "Sin entidad"),
        monto: numberValue(row.monto),
        estadoOperacion: stringValue(row.estado_operacion),
        estadoRecordatorio: stringValue(row.estado_recordatorio),
        emisor: stringValue(row.emisor, "Sin usuario"),
        fechaUltimoEnvio: String(row.fecha_ultimo_envio ?? ""),
        cantidadEnvios: numberValue(row.cantidad_envios),
        leido: Boolean(row.leido),
        fechaCierre: row.fecha_cierre ? String(row.fecha_cierre) : null,
        rutaOperativa: stringValue(row.ruta_operativa, "/"),
    };
};

export const recordatoriosOperativosService = {
    async getResumen(): Promise<RecordatorioResumen> {
        const row = recordValue(await rpc("f_get_tb_operacion_recordatorio_resumen"));
        return {
            activos: numberValue(row.activos),
            nuevos: numberValue(row.nuevos),
            nivel1: numberValue(row.nivel_1),
            nivel2: numberValue(row.nivel_2),
            nivel3: numberValue(row.nivel_3),
        };
    },

    async getContexto(idOperacion: number): Promise<RecordatorioContexto> {
        const row = recordValue(await rpc("f_get_tb_operacion_recordatorio_contexto", { p_id_operacion_proceso: idOperacion }));
        return {
            idOperacion: numberValue(row.id_operacion),
            codigoOperacion: stringValue(row.codigo_operacion),
            idUsuarioDestinatario: row.id_usuario_destinatario ? numberValue(row.id_usuario_destinatario) : null,
            usuarioDestinatario: stringValue(row.usuario_destinatario, "Sin usuario"),
            servicio: stringValue(row.servicio),
            dni: stringValue(row.dni),
            cliente: stringValue(row.cliente, "Sin nombre"),
            sucursal: stringValue(row.sucursal, "Sin sede"),
            entidad: stringValue(row.entidad, "Sin entidad"),
            monto: numberValue(row.monto),
            fechaOperacion: row.fecha_operacion ? String(row.fecha_operacion) : null,
            estado: stringValue(row.estado),
            estaPendiente: Boolean(row.esta_pendiente),
            recordatorioActivo: Boolean(row.recordatorio_activo),
        };
    },

    async enviar(idOperacion: number, nivel: RecordatorioNivel) {
        return rpc("f_post_tb_operacion_recordatorio", { p_id_operacion_proceso: idOperacion, p_nivel_alerta: nivel });
    },

    async getBandeja(input: { vista: RecordatorioVista; nivel: number | null; servicio: string | null; busqueda: string; pagina: number; tamanoPagina: number }): Promise<RecordatorioPagina> {
        const row = recordValue(await rpc("f_get_tb_operacion_recordatorio_bandeja", {
            p_vista: input.vista,
            p_nivel_alerta: input.nivel,
            p_servicio: input.servicio,
            p_busqueda: input.busqueda || null,
            p_pagina: input.pagina,
            p_tamano_pagina: input.tamanoPagina,
        }));
        return {
            items: Array.isArray(row.items) ? row.items.map(mapItem) : [],
            total: numberValue(row.total),
            pagina: numberValue(row.pagina) || 1,
            tamanoPagina: numberValue(row.tamano_pagina) || input.tamanoPagina,
            totalPaginas: numberValue(row.total_paginas),
        };
    },

    async marcarLeido(id: number) {
        await rpc("f_patch_tb_operacion_recordatorio_lectura", { p_id: id });
    },
};
