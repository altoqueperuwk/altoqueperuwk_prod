import { supabase } from "@/lib/supabase";
import type {
    DistribucionServicio,
    EmpresaDerivada,
    MetricasConsulta,
    MetricasCuenta,
    MetricasDesglose,
    MetricasResumen,
    MetricasSerie,
    MetricasServicio,
    MetricasValores,
    MetricasVariacion,
} from "./metricas-bancarias.types";

type JsonRecord = Record<string, unknown>;

const numberValue = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown) => value === null || value === undefined ? null : numberValue(value);

const recordValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const arrayValue = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(recordValue) : [];

const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

const mapValores = (value: unknown): MetricasValores => {
    const row = recordValue(value);
    return {
        cajaRecaudacion: numberValue(row.caja_recaudacion),
        ingresosMovimientos: numberValue(row.ingresos_movimientos),
        salidas: numberValue(row.salidas),
        gastosOperacionales: numberValue(row.gastos_operacionales),
        ganancias: numberValue(row.ganancias),
        margenGanancia: numberValue(row.margen_ganancia),
        saldoBanco: numberValue(row.saldo_banco),
        pendienteTransferencia: numberValue(row.pendiente_transferencia),
        operacionesRegistradas: numberValue(row.operaciones_registradas),
        operacionesPagadas: numberValue(row.operaciones_pagadas),
        operacionesPendientes: numberValue(row.operaciones_pendientes),
        tasaPago: numberValue(row.tasa_pago),
        ticketPromedio: numberValue(row.ticket_promedio),
    };
};

const mapVariacion = (value: unknown): MetricasVariacion | null => {
    if (!value) return null;
    const row = recordValue(value);
    return {
        cajaRecaudacion: nullableNumber(row.caja_recaudacion),
        salidas: nullableNumber(row.salidas),
        gastosOperacionales: nullableNumber(row.gastos_operacionales),
        ganancias: nullableNumber(row.ganancias),
        operacionesRegistradas: nullableNumber(row.operaciones_registradas),
        operacionesPagadas: nullableNumber(row.operaciones_pagadas),
    };
};

const mapPeriodo = (value: unknown) => {
    const row = recordValue(value);
    return { desde: String(row.desde ?? ""), hasta: String(row.hasta ?? "") };
};

const mapResumen = (value: unknown): MetricasResumen => {
    const row = recordValue(value);
    const safetypay = recordValue(row.safetypay);
    return {
        periodo: mapPeriodo(row.periodo),
        comparacionPeriodo: row.comparacion_periodo ? mapPeriodo(row.comparacion_periodo) : null,
        actual: mapValores(row.actual),
        anterior: row.anterior ? mapValores(row.anterior) : null,
        variacion: mapVariacion(row.variacion_porcentual),
        safetypay: {
            totalTransferencia: numberValue(safetypay.total_transferencia),
            empresasDerivadas: arrayValue(safetypay.empresas_derivadas).map((item): EmpresaDerivada => ({
                empresa: String(item.empresa ?? "-"),
                cuenta: String(item.cuenta ?? "-"),
                operaciones: numberValue(item.operaciones),
                transferencia: numberValue(item.transferencia),
            })),
        },
    };
};

const serviceFamilies: Record<Exclude<MetricasServicio, "all">, string> = {
    efectivizacion: "EFECTIVIZACION",
    "pago-deuda": "PAGO DEUDA",
    movimientos: "MOVIMIENTOS",
    directo: "DIRECTO",
};

const familyParams = (consulta: MetricasConsulta, servicio = consulta.servicio, comparison = true) => ({
    p_fecha_desde: consulta.fechaDesde,
    p_fecha_hasta: consulta.fechaHasta,
    p_rutas: consulta.ruta ? [consulta.ruta] : null,
    p_id_empresa: consulta.idEmpresa,
    p_id_empresa_cuenta_bancaria: consulta.idCuenta,
    p_familias: servicio === "all" ? null : [serviceFamilies[servicio]],
    p_estados: null,
    p_incluir_comparacion: comparison,
});

const distributionMeta: Array<{ key: Exclude<MetricasServicio, "all">; name: string; color: string }> = [
    { key: "efectivizacion", name: "Efectivización", color: "var(--color-utility-brand-500)" },
    { key: "pago-deuda", name: "Pago Deuda", color: "var(--color-utility-blue-500)" },
    { key: "movimientos", name: "Movimientos", color: "var(--color-utility-green-500)" },
    { key: "directo", name: "Directo", color: "var(--color-utility-orange-500)" },
];

export const metricasBancariasService = {
    async getCuentas(): Promise<MetricasCuenta[]> {
        const rows = await rpc<JsonRecord[]>("f_get_tb_ruta_operacion_caja", { p_id_estado: 1 });
        return arrayValue(rows).map((row) => ({
            ruta: String(row.ruta ?? "").toLowerCase(),
            idEmpresa: numberValue(row.id_empresa),
            empresa: String(row.nombre_empresa ?? "-"),
            idCuenta: numberValue(row.id_empresa_cuenta_bancaria),
            cuenta: String(row.nombre_banco ?? "-"),
        })).filter((row) => row.ruta && row.idEmpresa && row.idCuenta);
    },

    async getDashboard(consulta: MetricasConsulta) {
        const commonParams = familyParams(consulta);
        const serieParams = { ...commonParams, p_granularidad: consulta.granularidad };
        delete (serieParams as Partial<typeof commonParams>).p_incluir_comparacion;
        const breakdownParams = { ...commonParams };
        delete (breakdownParams as Partial<typeof commonParams>).p_incluir_comparacion;

        const [summaryRaw, seriesRaw, breakdownRaw, distributionRaw] = await Promise.all([
            rpc<unknown>("f_get_dashboard_metricas_bancarias_resumen", commonParams),
            rpc<unknown[]>("f_get_dashboard_metricas_bancarias_serie", serieParams),
            rpc<unknown[]>("f_get_dashboard_metricas_bancarias_desglose", breakdownParams),
            rpc<unknown[]>("f_get_dashboard_metricas_bancarias_distribucion", {
                p_fecha_desde: consulta.fechaDesde,
                p_fecha_hasta: consulta.fechaHasta,
                p_rutas: consulta.ruta ? [consulta.ruta] : null,
                p_id_empresa: consulta.idEmpresa,
                p_id_empresa_cuenta_bancaria: consulta.idCuenta,
                p_estados: null,
            }),
        ]);

        const series: MetricasSerie[] = arrayValue(seriesRaw).map((row) => ({
            periodo: String(row.periodo ?? ""),
            granularidad: String(row.granularidad ?? ""),
            ruta: String(row.ruta ?? ""),
            cajaRecaudacion: numberValue(row.caja_recaudacion),
            ingresosMovimientos: numberValue(row.ingresos_movimientos),
            salidas: numberValue(row.salidas),
            gastosOperacionales: numberValue(row.gastos_operacionales),
            ganancias: numberValue(row.ganancias),
            margenGanancia: numberValue(row.margen_ganancia),
            operacionesRegistradas: numberValue(row.operaciones_registradas),
            operacionesPagadas: numberValue(row.operaciones_pagadas),
        }));

        const breakdown: MetricasDesglose[] = arrayValue(breakdownRaw).map((row) => ({
            ruta: String(row.ruta ?? ""),
            idEmpresa: numberValue(row.id_empresa),
            empresa: String(row.empresa ?? "-"),
            idCuenta: numberValue(row.id_empresa_cuenta_bancaria),
            cuenta: String(row.cuenta ?? "-"),
            operaciones: numberValue(row.operaciones),
            pagadas: numberValue(row.pagadas),
            pendientes: numberValue(row.pendientes),
            tasaPago: numberValue(row.tasa_pago),
            cajaRecaudacion: numberValue(row.caja_recaudacion),
            ingresosMovimientos: numberValue(row.ingresos_movimientos),
            salidas: numberValue(row.salidas),
            gastosOperacionales: numberValue(row.gastos_operacionales),
            ganancias: numberValue(row.ganancias),
            margenGanancia: numberValue(row.margen_ganancia),
            pendienteTransferencia: numberValue(row.pendiente_transferencia),
            saldoBanco: numberValue(row.saldo_banco),
            ticketPromedio: numberValue(row.ticket_promedio),
        }));

        const distributionByFamily = new Map(arrayValue(distributionRaw).map((row) => [String(row.familia ?? ""), numberValue(row.operaciones)]));
        const activeDistribution = consulta.servicio === "all" ? distributionMeta : distributionMeta.filter((item) => item.key === consulta.servicio);
        const distribution: DistribucionServicio[] = activeDistribution.map((item) => ({
            name: item.name,
            value: distributionByFamily.get(serviceFamilies[item.key]) ?? 0,
            color: item.color,
        })).filter((item) => item.value > 0);

        return { summary: mapResumen(summaryRaw), series, breakdown, distribution };
    },
};
