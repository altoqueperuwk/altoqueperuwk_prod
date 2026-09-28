import { supabase } from "@/lib/supabase";
import type { ExportacionHistorial, ReportePayload, ReporteTipo } from "./reportes.types";

type JsonRecord = Record<string, unknown>;
const recordValue = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {});
const arrayValue = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(recordValue) : []);
const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};
const functions: Record<ReporteTipo, string> = {
    FINANCIERO: "f_get_tb_compensacion_reporte_financiero",
    SEDES: "f_get_tb_compensacion_reporte_sedes",
    CONCEPTOS: "f_get_tb_compensacion_reporte_conceptos",
    ASISTENCIA: "f_get_tb_compensacion_reporte_asistencia",
    PRODUCTIVIDAD: "f_get_tb_compensacion_reporte_productividad",
    PAGOS: "f_get_tb_compensacion_reporte_pagos",
};

export const reportesService = {
    async getReport(type: ReporteTipo, periodId: number, branchId: number): Promise<ReportePayload> {
        const params: JsonRecord = { p_id_periodo: periodId, p_id_sucursal: branchId || null };
        if (type !== "SEDES") params.p_id_colaborador = null;
        if (type === "CONCEPTOS") params.p_categoria = null;
        const row = recordValue(await rpc<unknown>(functions[type], params));
        const items = arrayValue(row.items);
        let summary = recordValue(row.resumen);
        if (type === "CONCEPTOS")
            summary = {
                total_ingresos: numberValue(row.total_ingresos),
                total_descuentos: numberValue(row.total_descuentos),
                total_neto: numberValue(row.total_neto),
                total_conceptos: items.length,
            };
        if (type === "SEDES")
            summary = items.reduce<JsonRecord>(
                (total, item) => ({
                    total_sedes: numberValue(total.total_sedes) + 1,
                    total_colaboradores: numberValue(total.total_colaboradores) + numberValue(item.total_colaboradores),
                    total_pagar: numberValue(total.total_pagar) + numberValue(item.total_pagar),
                    total_pendiente: numberValue(total.total_pendiente) + numberValue(item.total_pendiente),
                }),
                { total_sedes: 0, total_colaboradores: 0, total_pagar: 0, total_pendiente: 0 },
            );
        return {
            periodo: String(row.periodo ?? ""),
            estadoPeriodo: String(row.estado_periodo ?? ""),
            fuente: String(row.fuente ?? ""),
            resumen: summary,
            resumenSedes: arrayValue(row.resumen_sedes),
            items,
            nota: String(row.nota_cierre ?? row.regla_atribucion_sede ?? ""),
        };
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
            tipoReporte: String(item.tipo_reporte ?? ""),
            formato: String(item.formato ?? ""),
            nombreArchivo: String(item.nombre_archivo ?? ""),
            totalRegistros: numberValue(item.total_registros),
            totalReportado: item.total_reportado === null || item.total_reportado === undefined ? null : numberValue(item.total_reportado),
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
