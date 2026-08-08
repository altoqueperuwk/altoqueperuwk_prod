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

export type ReporteCierreCajaFlow = "efectivizacion" | "derivados" | "pago_deuda";

export interface ReporteCierreCajaTableRow {
    id: string;
    values: string[];
}

const displayText = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);

const displayMoney = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "-";
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount)) return "-";
    return `S/ ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const displayPercent = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "-";
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount)) return "-";
    return `${amount.toLocaleString("es-PE", { maximumFractionDigits: 2 })}%`;
};

const displayDate = (value: unknown) => {
    if (!value) return "-";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
};

const reportRows = (data: ReporteCierreCajaData, key: string) => {
    const value = data[key];
    return Array.isArray(value) ? value as Record<string, unknown>[] : [];
};

const isPaid = (row: Record<string, unknown>) => String(row.estado ?? row.nombre_estado ?? "").trim().toLowerCase() === "pagado";

export const getPaidTableRows = (data: ReporteCierreCajaData, flow: ReporteCierreCajaFlow): ReporteCierreCajaTableRow[] => {
    const rows = reportRows(data, flow).filter(isPaid);

    if (flow === "efectivizacion") {
        return rows.map((row, index) => ({
            id: `efectivizacion-${index}-${String(row.operacion ?? row.codigo_operacion_deposito_cliente ?? "")}`,
            values: [
                displayText(row.facturacion ?? row.tipo_facturacion),
                displayText(row.operacion ?? row.codigo_operacion_deposito_cliente),
                displayText(row.dni ?? row.dni_cliente),
                displayText(row.comunidad ?? row.nombre_comunidad),
                displayMoney(row.deposito ?? row.monto),
                displayPercent(row.porcentaje_comision ?? row.comision_servicio),
                displayMoney(row.soles_comision ?? row.comision ?? row.resultado_comision_servicio),
                displayMoney(row.transferencia ?? row.monto_transferencia_cliente),
                displayText(row.estado ?? row.nombre_estado),
                displayDate(row.fecha ?? row.fecha_deposito_cliente ?? row.fecha_registro),
            ],
        }));
    }

    if (flow === "derivados") {
        return rows.map((row, index) => ({
            id: `derivados-${index}-${String(row.operacion ?? row.codigo_operacion_deposito_cliente ?? "")}`,
            values: [
                displayText(row.facturacion ?? row.tipo_facturacion),
                displayText(row.derivo ?? row.ruta_origen),
                displayText(row.operacion ?? row.codigo_operacion_deposito_cliente),
                displayText(row.dni ?? row.dni_cliente),
                displayText(row.comunidad ?? row.nombre_comunidad),
                displayText(row.cuenta_cliente ?? row.nombre_banco_empresa_cuenta_salida),
                displayMoney(row.monto ?? row.monto_deposito_cliente),
                displayPercent(row.porcentaje_comision ?? row.comision_servicio),
                displayMoney(row.soles_comision ?? row.comision ?? row.resultado_comision_servicio),
                displayMoney(row.transferencia ?? row.monto_transferencia_cliente),
                displayText(row.estado ?? row.nombre_estado),
                displayDate(row.fecha ?? row.fecha_deposito_cliente ?? row.fecha_registro),
            ],
        }));
    }

    return rows.map((row, index) => ({
        id: `pago-deuda-${index}-${String(row.operacion ?? row.codigo_operacion_deposito_cliente ?? "")}`,
        values: [
            displayText(row.operacion ?? row.codigo_operacion_deposito_cliente),
            displayText(row.dni ?? row.dni_cliente),
            displayText(row.empresa_salida ?? row.nombre_empresa_salida),
            displayText(row.cuenta_salida ?? row.nombre_banco_empresa_cuenta_salida ?? row.cuenta),
            displayMoney(row.transferencia ?? row.monto_transferencia),
            displayText(row.empresa_ingreso ?? row.nombre_empresa_ingreso),
            displayText(row.cuenta_ingreso ?? row.nombre_banco_empresa_cuenta_ingreso),
            displayMoney(row.deposito ?? row.monto_devolucion),
            displayPercent(row.porcentaje_comision ?? row.comision_servicio),
            displayMoney(row.soles_comision ?? row.comision ?? row.resultado_comision_servicio),
            displayText(row.estado ?? row.nombre_estado),
            displayDate(row.fecha ?? row.fecha_registro),
        ],
    }));
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
