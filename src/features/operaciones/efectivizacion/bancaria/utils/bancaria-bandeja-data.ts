import type {
    OperacionCajaMovimiento,
    OperacionProceso,
    OperacionRutaBancaria,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export type UnifiedFlowFilter = "Todos" | "Efectivizacion" | "Derivados Atendidos" | "Derivados Enviados" | "POS";

export const getUnifiedFlowLabel = (
    row: Pick<OperacionProceso, "flag_derivado" | "ruta_origen" | "ruta_destino">,
    ruta: OperacionRutaBancaria,
): Exclude<UnifiedFlowFilter, "Todos"> => {
    const isDerived = row.flag_derivado === true || String(row.flag_derivado).toLowerCase() === "true";
    if (isDerived) {
        return String(row.ruta_origen ?? "").trim().toLowerCase() === String(ruta).trim().toLowerCase()
            ? "Derivados Enviados"
            : "Derivados Atendidos";
    }

    if (String(row.ruta_origen ?? "").trim().toLowerCase() === "pos") return "POS";
    return "Efectivizacion";
};

export interface MovimientoMerged {
    id: number;
    id_operacion_proceso: number | null;
    tipo_origen: string;
    movimientos: string[];
    tipo_servicio: string;
    tipo_recaudacion_sf: string | null;
    nombre_codigo_servicio: string;
    dni_cliente: string;
    codigo_operacion: string;
    nombre_empresa: string;
    nombre_banco: string;
    nombre_empresa_relacionada?: string | null;
    nombre_banco_relacionada?: string | null;
    id_empresa_contraparte?: number | null;
    nombre_empresa_contraparte?: string | null;
    id_empresa_cuenta_bancaria_contraparte?: number | null;
    id_banco_contraparte?: number | null;
    nombre_banco_contraparte?: string | null;
    monto_ingreso: number;
    monto_salida: number;
    monto_gasto: number;
    monto_ganancia: number;
    tipo_facturacion: string;
    fecha_orden: string;
    fecha_registro: string;
    flag_paso_retencion?: boolean | null;
}

const toChronologicalTime = (value: string | null | undefined, fallback?: string | null) => {
    const time = Date.parse(value ?? fallback ?? "");
    return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
};

export const sortOperacionesChronologically = (rows: OperacionProceso[]) =>
    [...rows].sort((a, b) =>
        toChronologicalTime(a.fecha_deposito_cliente, a.fecha_registro) - toChronologicalTime(b.fecha_deposito_cliente, b.fecha_registro) ||
        toChronologicalTime(a.fecha_registro) - toChronologicalTime(b.fecha_registro) ||
        a.id - b.id,
    );

export const sortMovimientosChronologically = (rows: MovimientoMerged[]) =>
    [...rows].sort((a, b) =>
        toChronologicalTime(a.fecha_orden, a.fecha_registro) - toChronologicalTime(b.fecha_orden, b.fecha_registro) ||
        toChronologicalTime(a.fecha_registro) - toChronologicalTime(b.fecha_registro) ||
        a.id - b.id,
    );

export const mergeMovimientos = (rows: OperacionCajaMovimiento[]): MovimientoMerged[] => {
    const byProceso = new Map<number, OperacionCajaMovimiento[]>();
    const standalone: OperacionCajaMovimiento[] = [];

    for (const row of rows) {
        if (row.id_operacion_proceso != null) {
            const group = byProceso.get(row.id_operacion_proceso) ?? [];
            group.push(row);
            byProceso.set(row.id_operacion_proceso, group);
        } else {
            standalone.push(row);
        }
    }

    const merged: MovimientoMerged[] = [];

    for (const group of byProceso.values()) {
        const ingreso = group.find((row) => row.tipo_movimiento.toUpperCase() === "INGRESO");
        const salida = group.find((row) => row.tipo_movimiento.toUpperCase() === "SALIDA");
        const primary = ingreso ?? group[0];

        merged.push({
            id: primary.id,
            id_operacion_proceso: primary.id_operacion_proceso ?? null,
            tipo_origen: primary.tipo_origen,
            movimientos: group.map((row) => row.tipo_movimiento),
            tipo_servicio: primary.tipo_servicio ?? primary.nombre_codigo_servicio ?? "",
            tipo_recaudacion_sf: primary.tipo_recaudacion_sf ?? null,
            nombre_codigo_servicio: primary.nombre_codigo_servicio ?? "",
            dni_cliente: primary.dni_cliente ?? "",
            codigo_operacion: primary.codigo_operacion ?? "",
            nombre_empresa: primary.nombre_empresa,
            nombre_banco: primary.nombre_banco ?? "",
            nombre_empresa_relacionada: primary.nombre_empresa_relacionada ?? null,
            nombre_banco_relacionada: primary.nombre_banco_relacionada ?? null,
            id_empresa_contraparte: primary.id_empresa_contraparte ?? null,
            nombre_empresa_contraparte: primary.nombre_empresa_contraparte ?? null,
            id_empresa_cuenta_bancaria_contraparte: primary.id_empresa_cuenta_bancaria_contraparte ?? null,
            id_banco_contraparte: primary.id_banco_contraparte ?? null,
            nombre_banco_contraparte: primary.nombre_banco_contraparte ?? null,
            monto_ingreso: ingreso?.monto_ingreso ?? 0,
            monto_salida: salida?.monto_salida ?? 0,
            monto_gasto: (ingreso?.monto_gasto ?? 0) + (salida?.monto_gasto ?? 0),
            monto_ganancia: ingreso?.monto_ganancia ?? 0,
            tipo_facturacion: primary.tipo_facturacion ?? "Boleta",
            fecha_orden: ingreso?.fecha_deposito_cliente ?? primary.fecha_deposito_cliente ?? primary.fecha_registro,
            fecha_registro: primary.fecha_registro,
            flag_paso_retencion: ingreso?.flag_paso_retencion ?? primary.flag_paso_retencion ?? false,
        });
    }

    for (const row of standalone) {
        merged.push({
            id: row.id,
            id_operacion_proceso: row.id_operacion_proceso ?? null,
            tipo_origen: row.tipo_origen,
            movimientos: [row.tipo_movimiento],
            tipo_servicio: row.tipo_servicio ?? row.nombre_codigo_servicio ?? "",
            tipo_recaudacion_sf: row.tipo_recaudacion_sf ?? null,
            nombre_codigo_servicio: row.nombre_codigo_servicio ?? "",
            dni_cliente: row.dni_cliente ?? "",
            codigo_operacion: row.codigo_operacion ?? "",
            nombre_empresa: row.nombre_empresa,
            nombre_banco: row.nombre_banco ?? "",
            nombre_empresa_relacionada: row.nombre_empresa_relacionada ?? null,
            nombre_banco_relacionada: row.nombre_banco_relacionada ?? null,
            id_empresa_contraparte: row.id_empresa_contraparte ?? null,
            nombre_empresa_contraparte: row.nombre_empresa_contraparte ?? null,
            id_empresa_cuenta_bancaria_contraparte: row.id_empresa_cuenta_bancaria_contraparte ?? null,
            id_banco_contraparte: row.id_banco_contraparte ?? null,
            nombre_banco_contraparte: row.nombre_banco_contraparte ?? null,
            monto_ingreso: row.monto_ingreso,
            monto_salida: row.monto_salida,
            monto_gasto: row.monto_gasto,
            monto_ganancia: row.monto_ganancia,
            tipo_facturacion: row.tipo_facturacion ?? "Boleta",
            fecha_orden: row.fecha_deposito_cliente ?? row.fecha_registro,
            fecha_registro: row.fecha_registro,
            flag_paso_retencion: row.flag_paso_retencion ?? false,
        });
    }

    return sortMovimientosChronologically(merged);
};
