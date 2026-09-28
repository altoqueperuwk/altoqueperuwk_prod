export type ReporteTipo = "FINANCIERO" | "SEDES" | "CONCEPTOS" | "ASISTENCIA" | "PRODUCTIVIDAD" | "PAGOS";
export type ReporteFormato = "PDF" | "XLSX" | "CSV";
export interface ReportePayload {
    periodo: string;
    estadoPeriodo: string;
    fuente: string;
    resumen: Record<string, unknown>;
    resumenSedes: Record<string, unknown>[];
    items: Record<string, unknown>[];
    nota: string;
}
export interface ExportacionHistorial {
    id: number;
    tipoReporte: string;
    formato: string;
    nombreArchivo: string;
    totalRegistros: number;
    totalReportado: number | null;
    estado: string;
    fechaRegistro: string;
}
export interface ReporteColumna {
    key: string;
    label: string;
    kind?: "money" | "percent" | "date" | "number" | "text";
}
