import { supabase } from "@/lib/supabase";

export interface ReporteCierreCajaRow {
    id: number;
    id_empresa: number;
    nombre_empresa: string;
    id_empresa_cuenta_bancaria: number;
    id_banco: number;
    nombre_banco: string;
    id_caja: number | null;
    id_caja_cierre: number | null;
    fecha_cierre: string | null;
    tiene_cierre: boolean;
}

export type ReporteCierreCajaData = Record<string, unknown> & {
    empresa?: string;
    banco?: string;
    fecha_cierre?: string;
};

const rpc = async <T>(functionName: string, params: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await supabase.rpc(functionName, params);
    if (error) throw error;
    if (data && !Array.isArray(data) && typeof data === "object" && "error" in data) {
        throw new Error(String((data as Record<string, unknown>).error));
    }
    return data as T;
};

export const toDateKey = (value: string) => {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    return `${year}-${month}-${day}`;
};

export const formatCierreDate = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
    return new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
};

export const reporteCierreCajaService = {
    getFechas() {
        return rpc<{ fecha_cierre: string }[]>("f_get_tb_reporte_cierre_caja_fechas");
    },

    getBandeja(fechaCierre: string | null) {
        return rpc<ReporteCierreCajaRow[]>("f_get_tb_reporte_cierre_caja_bandeja", {
            p_fecha_cierre: fechaCierre,
        });
    },

    getReporte(row: ReporteCierreCajaRow) {
        return rpc<ReporteCierreCajaData>("f_get_reporte_cierre", {
            p_id_caja: row.id_caja,
            p_id_empresa: row.id_empresa,
            p_id_caja_cierre: row.id_caja_cierre,
            p_fecha_cierre: row.fecha_cierre ? toDateKey(row.fecha_cierre) : null,
        });
    },
};
