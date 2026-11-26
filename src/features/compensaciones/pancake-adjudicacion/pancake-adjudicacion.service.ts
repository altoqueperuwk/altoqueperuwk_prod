import { supabase } from "@/lib/supabase";

export type CriterioMensual = "ATENCIONES" | "CALIFICACIONES";
export interface PancakeMapeo {
    formato?: "JSON" | "CSV";
    separador?: "," | ";" | "\t";
    raiz?: string;
    conversacion: string;
    usuario: string;
    fecha: string;
    efectiva: string;
    valor_efectiva: string;
}
export interface CandidatoMensual {
    id_colaborador: number;
    nombre: string;
    atenciones: number;
    calificaciones: number;
    presenciales: number;
    puntualidad: { estado: string; motivo?: string };
    puesto: number | null;
}
export interface RankingMensual {
    periodo: string;
    criterio: CriterioMensual;
    estado: "SIN_FUENTE" | "EN_REVISION" | "SIN_CANDIDATOS" | "LISTO";
    version: string;
    certificada: boolean;
    candidatos: CandidatoMensual[];
}
const rpc = async <T>(name: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw new Error(error.message);
    if (!data) throw new Error("El servidor no devolvió la evaluación mensual.");
    return data as T;
};

/** Validación local de estructura; la identidad y los permisos los verifica SQL79. */
export function validarExportacionPancake(original: string, mapeo: PancakeMapeo): number | null {
    if (new TextEncoder().encode(original).length > 10_000_000) throw new Error("El archivo supera 10 MB.");
    if ([mapeo.conversacion, mapeo.usuario, mapeo.fecha, mapeo.efectiva, mapeo.valor_efectiva].some((x) => !x.trim())) {
        throw new Error("Completa el mapeo real de los campos de Pancake.");
    }
    // CSV se valida en PostgreSQL contra el original; no reenviar una conversión del navegador.
    if (mapeo.formato === "CSV") return null;
    const doc: unknown = JSON.parse(original);
    const filas: unknown = mapeo.raiz && doc && typeof doc === "object" ? (doc as Record<string, unknown>)[mapeo.raiz] : doc;
    if (!Array.isArray(filas) || filas.length > 20_000) throw new Error("Selecciona un array de hasta 20000 conversaciones.");
    for (const fila of filas) {
        if (
            !fila ||
            typeof fila !== "object" ||
            [mapeo.conversacion, mapeo.usuario, mapeo.fecha, mapeo.efectiva].some((key) => fila[key] === undefined || fila[key] === null)
        ) {
            throw new Error("Una conversación no contiene todos los campos mapeados.");
        }
        if (!/(Z|[+-]\d{2}:\d{2})$/.test(String(fila[mapeo.fecha])) || !Number.isFinite(Date.parse(String(fila[mapeo.fecha])))) {
            throw new Error("La fecha efectiva debe ser ISO con zona horaria.");
        }
    }
    return filas.length;
}

export const pancakeAdjudicacionService = {
    configurar: (mes: string, paginas: string[], identidades: { pagina: string; usuario_externo: string; id_colaborador: number }[]) =>
        rpc("f_post_compensacion_pancake_configurar", { p_mes: mes, p_paginas: paginas, p_identidades: identidades }),
    importar: async (mes: string, pagina: string, archivo: File, mapeo: PancakeMapeo, justificacion: string) => {
        if (archivo.size > 10_000_000) throw new Error("El archivo supera 10 MB.");
        const original = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await archivo.arrayBuffer());
        validarExportacionPancake(original, mapeo);
        return rpc("f_post_compensacion_pancake_importar", {
            p_mes: mes,
            p_pagina: pagina,
            p_archivo: archivo.name,
            p_original: original,
            p_mapeo: mapeo,
            p_justificacion: justificacion,
        });
    },
    certificar: (mes: string, justificacion: string) => rpc("f_post_compensacion_pancake_certificar", { p_mes: mes, p_justificacion: justificacion }),
    ranking: (mes: string, criterio: CriterioMensual) => rpc<RankingMensual>("f_get_compensacion_mes_ranking", { p_mes: mes, p_criterio: criterio }),
    adjudicar: (ranking: RankingMensual, justificacion: string) =>
        rpc("f_post_compensacion_mes_adjudicar", {
            p_mes: ranking.periodo,
            p_criterio: ranking.criterio,
            p_version: ranking.version,
            p_justificacion: justificacion,
        }),
};
