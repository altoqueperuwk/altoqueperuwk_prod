import { supabase } from "@/lib/supabase";

export interface PagosColaborador {
    id: number;
    nombre: string;
    documento: string;
    cargo: string;
    cargoNombre: string;
}
type Raw = Record<string, unknown>;

export const pagosCuadreService = {
    /** Solo Administración: colaboradores vigentes del área de Pagos. */
    async colaboradores(): Promise<PagosColaborador[]> {
        const { data, error } = await supabase.rpc("f_get_compensacion_pagos_colaboradores");
        if (error) throw error;
        if (!Array.isArray(data?.items)) throw new Error("No se confirmó la lista de colaboradores de Pagos");
        return (data.items as Raw[]).map((item) => ({
            id: Number(item.id),
            nombre: String(item.nombre ?? ""),
            documento: String(item.documento ?? ""),
            cargo: String(item.cargo ?? ""),
            cargoNombre: String(item.cargo_nombre ?? ""),
        }));
    },
    /** Registra y aprueba el Cuadre Perfecto del mes si la conciliación lo respalda. */
    async registrarCuadre(mes: string, colaborador: number, evidencia: string, motivo: string) {
        const { data, error } = await supabase.rpc("f_post_compensacion_pagos_cuadre_registrar", {
            p_mes: `${mes}-01`,
            p_colaborador: colaborador,
            p_evidencia: evidencia,
            p_motivo: motivo,
        });
        if (error) throw error;
        if (!data?.id) throw new Error("No se confirmó el registro del cuadre.");
        return data;
    },
};
