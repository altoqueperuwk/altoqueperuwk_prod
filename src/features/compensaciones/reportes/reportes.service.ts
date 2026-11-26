import { supabase } from "@/lib/supabase";
import type { ExportacionHistorial, ReportePayload } from "./reportes.types";

type JsonRecord = Record<string, unknown>;
const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

export const reportesService = {
    async getReport(periodId: number, branchId: number): Promise<ReportePayload> {
        const row = recordValue(
            await rpc<unknown>("f_get_tb_compensacion_reporte_financiero", {
                p_id_periodo: periodId,
                p_id_sucursal: branchId || null,
                p_id_colaborador: null,
            }),
        );
        return { periodo: String(row.periodo ?? ""), resumen: recordValue(row.resumen), items: arrayValue(row.items) };
    },
    async getExports(periodId: number): Promise<ExportacionHistorial[]> {
        const row = recordValue(
            await rpc<unknown>("f_get_tb_compensacion_exportacion", {
                p_estado_exportacion: null,
                p_formato: null,
                p_id_periodo: periodId,
                p_limite: 50,
                p_pagina: 1,
                p_tipo_reporte: null,
            }),
        );
        return arrayValue(row.items).map((item) => ({
            id: numberValue(item.id),
            formato: String(item.formato ?? ""),
            nombreArchivo: String(item.nombre_archivo ?? ""),
            totalRegistros: numberValue(item.total_registros),
            estado: String(item.estado_exportacion ?? ""),
            fechaRegistro: String(item.fecha_registro ?? ""),
        }));
    },
    registerExport(values: {
        periodId: number;
        type: string;
        format: string;
        fileName: string;
        hash: string;
        totalRows: number;
        totalReported: number;
        branchId: number;
    }) {
        return rpc("f_post_tb_compensacion_exportacion", {
            p_clave_idempotencia: `${values.periodId}:${values.type}:${values.format}:${values.hash}`,
            p_estado_exportacion: "GENERADA",
            p_filtros: { id_sucursal: values.branchId || null },
            p_formato: values.format,
            p_hash_archivo: values.hash,
            p_id_periodo: values.periodId,
            p_mensaje_error: null,
            p_nombre_archivo: values.fileName,
            p_tipo_reporte: values.type,
            p_total_registros: values.totalRows,
            p_total_reportado: values.totalReported,
        });
    },
};
