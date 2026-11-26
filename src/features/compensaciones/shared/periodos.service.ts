import { supabase } from "@/lib/supabase";

export interface PeriodoCompensacion {
    id: number;
    periodo: string;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    estado: string;
    eventosPendientes: number | null;
    reporteConfirmado: boolean;
}

type JsonRecord = Record<string, unknown>;
const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const nullableNumber = (value: unknown) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

export const periodosService = {
    async getPeriods(): Promise<PeriodoCompensacion[]> {
        const { data, error } = await supabase.rpc("f_get_tb_compensacion_periodo", {
            p_estado_periodo: null,
            p_id: null,
            p_periodo_desde: null,
            p_periodo_hasta: null,
        });
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error("No se recibió la consulta de períodos. Actualiza antes de continuar.");
        return data.map((item) => {
            const row = recordValue(item);
            return {
                id: Number(row.id) || 0,
                periodo: String(row.periodo ?? ""),
                nombre: String(row.nombre ?? ""),
                fechaInicio: String(row.fecha_inicio ?? ""),
                fechaFin: String(row.fecha_fin ?? ""),
                estado: String(row.estado_periodo ?? ""),
                eventosPendientes: nullableNumber(row.eventos_pendientes),
                reporteConfirmado: row.tiene_cierre_vigente === true,
            };
        });
    },
};
