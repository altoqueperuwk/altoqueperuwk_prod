import { supabase } from "@/lib/supabase";
import type { CompensacionPeriodo } from "./compensaciones-resumen.types";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});

const asNumber = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const asNullableNumber = (value: unknown) => (value === null || value === undefined ? null : asNumber(value));

const asNullableString = (value: unknown) => (value === null || value === undefined || value === "" ? null : String(value));

const mapPeriodo = (value: unknown): CompensacionPeriodo => {
    const row = asRecord(value);

    return {
        id: asNumber(row.id),
        periodo: String(row.periodo ?? ""),
        nombre: String(row.nombre ?? "Periodo sin nombre"),
        fechaInicio: String(row.fecha_inicio ?? ""),
        fechaFin: String(row.fecha_fin ?? ""),
        zonaHoraria: String(row.zona_horaria ?? "America/Lima"),
        estadoPeriodo: String(row.estado_periodo ?? "ABIERTO"),
        numeroCalculo: asNumber(row.numero_calculo),
        fechaApertura: asNullableString(row.fecha_apertura),
        fechaAprobacion: asNullableString(row.fecha_aprobacion),
        fechaCierre: asNullableString(row.fecha_cierre),
        eventosPendientes: asNullableNumber(row.eventos_pendientes),
        tieneCierreVigente: Boolean(row.tiene_cierre_vigente),
    };
};

export const compensacionesResumenService = {
    async getPeriodos(): Promise<CompensacionPeriodo[]> {
        const { data, error } = await supabase.rpc("f_get_tb_compensacion_periodo", {
            p_estado_periodo: null,
            p_id: null,
            p_periodo_desde: null,
            p_periodo_hasta: null,
        });

        if (error) throw error;
        return (Array.isArray(data) ? data : []).map(mapPeriodo);
    },
};
