import { supabase } from "@/lib/supabase";

export interface PagosValidacionItem {
    id: number;
    tipoCodigo: string;
    tipoNombre: string;
    estado: string;
    fecha: string;
    beneficiario: string;
    descripcion: string;
    evidencia: string | null;
    operacion: string | null;
    decision: "APROBADO" | "RECHAZADO" | null;
}
type Raw = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");

export const pagosValidacionService = {
    async listar(): Promise<PagosValidacionItem[]> {
        const { data, error } = await supabase.rpc("f_get_compensacion_pagos_validacion");
        if (error) throw error;
        if (!Array.isArray(data?.items)) throw new Error("No se confirmó la consulta de reportes por validar");
        return (data.items as Raw[]).map((item) => {
            const decision = (item.validacion as Raw | null)?.decision;
            const operacion = item.operacion as Raw | null;
            return {
                id: Number(item.id),
                tipoCodigo: text(item.tipo_codigo),
                tipoNombre: text(item.tipo_nombre),
                estado: text(item.estado_evento),
                fecha: text(item.fecha_evento),
                beneficiario: text(item.beneficiario),
                descripcion: text(item.descripcion),
                evidencia: text(item.evidencia) || null,
                operacion: operacion?.codigo ? String(operacion.codigo) : null,
                decision: decision === "APROBADO" || decision === "RECHAZADO" ? decision : null,
            };
        });
    },
    async validar(id: number, decision: "APROBADO" | "RECHAZADO", comentario: string) {
        const { data, error } = await supabase.rpc("f_post_compensacion_pagos_validar", { p_id: id, p_decision: decision, p_comentario: comentario });
        if (error) throw error;
        if (data?.decision !== decision) throw new Error("No se confirmó la validación del reporte.");
        return data;
    },
};
