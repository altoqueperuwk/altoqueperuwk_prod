import { shareInFlight } from "@/lib/share-in-flight";
import { supabase } from "@/lib/supabase";

const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message);
    if (data == null) throw new Error("El servidor no devolvió el seguimiento");
    return data as T;
};
export interface Correccion {
    estado: "PENDIENTE" | "CORREGIDO";
    fecha_correccion: string | null;
    antes_escalamiento: boolean;
    id_colaborador_corrige: number | null;
    nota: string;
    version: number;
    colaborador: string | null;
}
export interface Expediente {
    id: number;
    id_origen: number;
    titulo: string;
    motivo: string;
    fecha: string;
    estado: string;
    reportante: string | null;
    colaborador: string | null;
    id_responsable: number;
    id_reportante: number;
    es_hallazgo: boolean;
    correccion: Correccion | null;
    puede_corregir: boolean;
    puede_descargo: boolean;
    consecuencias: Array<{ id: number; titulo: string; estado: string; importe: number | null; tipo: string }>;
    historial: Array<{ fecha: string; etapa: string; decision: string; comentario: string | null; usuario: string }>;
}
export const seguimientoJefaturaService = {
    misExpedientes: (month: string, status: string, page: number, size: number) => {
        const args = { p_mes: `${month}-01`, p_estado: status || null, p_pagina: page, p_tamano: size };
        return shareInFlight(`expedientes:${JSON.stringify(args)}`, () =>
            rpc<{ total: number; items: Array<Record<string, unknown>> }>("f_get_compensacion_mis_expedientes", args),
        );
    },
    expediente: (id: number) => rpc<Expediente>("f_get_compensacion_expediente", { p_id: id }),
    corregir: (id: number, values: { estado: string; fecha: string | null; antes: boolean; corrige: number | null; nota: string; version: number }) =>
        rpc<Correccion>("f_put_compensacion_hallazgo_correccion", {
            p_id: id,
            ...Object.fromEntries(Object.entries(values).map(([key, value]) => [`p_${key}`, value])),
        }),
};

/** Sólo claves de incidencia/evento: nunca convertir un ID de cliente u operación en un hallazgo. */
export const expedienteIdFromKey = (key: unknown): number | null => {
    const match = String(key ?? "").match(/^(?:EVENTO_PENDIENTE|AUDITORIA_PENDIENTE|INCIDENCIA|EVENTO|PENALIDAD):([1-9]\d*)$/);
    return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
};
