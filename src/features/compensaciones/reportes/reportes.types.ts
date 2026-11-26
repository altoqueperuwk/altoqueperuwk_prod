export type ReporteFormato = "PDF" | "XLSX" | "CSV";
export interface ReportePayload {
    periodo: string;
    resumen: Record<string, unknown>;
    items: Record<string, unknown>[];
}
export interface ExportacionHistorial {
    id: number;
    formato: string;
    nombreArchivo: string;
    totalRegistros: number;
    estado: string;
    fechaRegistro: string;
}
export interface ReporteColumna {
    key: string;
    label: string;
    kind?: "money" | "percent" | "date" | "number" | "text";
}
