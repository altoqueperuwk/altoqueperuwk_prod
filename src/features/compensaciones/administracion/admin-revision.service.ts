import { supabase } from "@/lib/supabase";

export interface AdminRevision {
    id: number;
    version: string;
    estado: string;
    puede_revisar: boolean;
    puede_aprobar: boolean;
    puede_observar: boolean;
    puede_anular: boolean;
    bloqueado: boolean;
    motivo: string;
    automatico: boolean;
    requiere_implementacion: boolean;
    destino: string;
    fuentes: Array<{ tipo: string; codigo: string; estado: string; monto: number | null }>;
}
const fields = ["puede_revisar", "puede_aprobar", "puede_observar", "puede_anular", "bloqueado", "automatico", "requiere_implementacion"] as const;
export const parseAdminRevision = (data: unknown): AdminRevision => {
    if (!data || typeof data !== "object") throw new Error("No se recibió el contexto de revisión administrativa (SQL96).");
    const row = data as Record<string, unknown>;
    if (
        !Number.isSafeInteger(row.id) ||
        Number(row.id) <= 0 ||
        typeof row.version !== "string" ||
        !row.version ||
        fields.some((field) => typeof row[field] !== "boolean") ||
        typeof row.estado !== "string" ||
        typeof row.motivo !== "string" ||
        typeof row.destino !== "string" ||
        !Array.isArray(row.fuentes)
    )
        throw new Error("El contexto de revisión está incompleto. Actualiza el detalle.");
    if (
        row.fuentes.some(
            (value) =>
                !value ||
                typeof value !== "object" ||
                ["tipo", "codigo", "estado"].some((key) => typeof value[key] !== "string") ||
                (value.monto !== null && (typeof value.monto !== "number" || !Number.isFinite(value.monto))),
        )
    )
        throw new Error("No se pudieron verificar las fuentes de revisión.");
    return row as unknown as AdminRevision;
};
export const adminRevisionService = {
    async get(id: number) {
        const { data, error } = await supabase.rpc("f_get_compensacion_administracion_revision", { p_id: id });
        if (error) throw error;
        const result = parseAdminRevision(data);
        if (result.id !== id) throw new Error("La respuesta no corresponde al expediente abierto.");
        return result;
    },
    async resolve(values: {
        id: number;
        version: string;
        action: "APROBADO" | "RECHAZADO" | "OBSERVADO" | "ANULADO";
        reason: string;
        base?: number | null;
        quantity?: number | null;
        chats?: boolean;
    }) {
        const { data, error } = await supabase.rpc("f_post_compensacion_administracion_revision", {
            p_id: values.id,
            p_version: values.version,
            p_accion: values.action,
            p_motivo: values.reason.trim(),
            p_base: values.base ?? null,
            p_cantidad: values.quantity ?? null,
            p_chats_revisados: values.chats ?? false,
        });
        if (error) throw error;
        if (!data || Number((data as Record<string, unknown>).id) !== values.id) throw new Error("No se confirmó la decisión. Actualiza antes de reintentar.");
        return data;
    },
};
