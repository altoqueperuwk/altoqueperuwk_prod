import { supabase } from "@/lib/supabase";
import type {
    DistribucionServicio,
    EmpresaDerivada,
    MetricasConsulta,
    MetricasCuenta,
    MetricasCliente,
    MetricasComision,
    MetricasComunidad,
    MetricasDesglose,
    MetricasDerivacion,
    MetricasResumen,
    MetricasOperacionPendiente,
    MetricasMejorCliente,
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
        clientesNuevos: numberValue(row.clientes_nuevos),
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
        clientesNuevos: nullableNumber(row.clientes_nuevos),
    };
};

const mapPeriodo = (value: unknown) => {
    const row = recordValue(value);
    return { desde: String(row.desde ?? ""), hasta: String(row.hasta ?? "") };
};

const mapResumen = (value: unknown): MetricasResumen => {
    const row = recordValue(value);
    const derivaciones = recordValue(row.derivaciones);
    return {
        periodo: mapPeriodo(row.periodo),
        comparacionPeriodo: row.comparacion_periodo ? mapPeriodo(row.comparacion_periodo) : null,
        actual: mapValores(row.actual),
        anterior: row.anterior ? mapValores(row.anterior) : null,
        variacion: mapVariacion(row.variacion_porcentual),
        derivaciones: {
            totalTransferencia: numberValue(derivaciones.total_transferencia),
            empresasDerivadas: arrayValue(derivaciones.empresas_derivadas).map((item): EmpresaDerivada => ({
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
};

const recaudacionFamilies = ["EFECTIVIZACION", "PAGO DEUDA"];

const familyParams = (consulta: MetricasConsulta, servicio = consulta.servicio, comparison = true) => ({
    p_fecha_desde: consulta.fechaDesde,
    p_fecha_hasta: consulta.fechaHasta,
    p_rutas: consulta.ruta ? [consulta.ruta] : null,
    p_id_empresa: consulta.idEmpresa,
    p_id_empresa_cuenta_bancaria: consulta.idCuenta,
    p_id_banco: consulta.idBanco,
    p_familias: servicio === "all" ? recaudacionFamilies : [serviceFamilies[servicio]],
    p_estados: null,
    p_incluir_comparacion: comparison,
});

const distributionMeta: Array<{ key: Exclude<MetricasServicio, "all">; name: string; color: string }> = [
    { key: "efectivizacion", name: "Efectivización", color: "var(--color-utility-brand-500)" },
    { key: "pago-deuda", name: "Pago Deuda", color: "var(--color-utility-blue-500)" },
];

const mapCommunities = (rows: unknown[]): MetricasComunidad[] => arrayValue(rows).map((row) => ({
    idComunidad: numberValue(row.id_comunidad),
    comunidad: String(row.comunidad ?? "Sin comunidad"),
    operaciones: numberValue(row.operaciones),
    recaudacion: numberValue(row.recaudacion),
    comision: numberValue(row.comision),
    gastosOperacionales: numberValue(row.gastos_operacionales),
    ganancias: numberValue(row.ganancias),
    salida: numberValue(row.salida),
    clientesNuevos: numberValue(row.clientes_nuevos),
    operacionesPendientes: numberValue(row.operaciones_pendientes),
}));

const mapClients = (rows: unknown[]): MetricasCliente[] => arrayValue(rows).map((row) => ({
    idCliente: numberValue(row.id_cliente),
    dni: String(row.dni ?? "-"),
    nombreCompleto: String(row.nombre_completo ?? "Sin nombre"),
    comunidad: String(row.comunidad ?? "Sin comunidad"),
    operaciones: numberValue(row.operaciones),
    recaudacion: numberValue(row.recaudacion),
    comision: numberValue(row.comision),
    gastosOperacionales: numberValue(row.gastos_operacionales),
    ganancias: numberValue(row.ganancias),
    salida: numberValue(row.salida),
    operacionesPendientes: numberValue(row.operaciones_pendientes),
}));

const mapCommissions = (rows: unknown[]): MetricasComision[] => arrayValue(rows).map((row) => ({
    porcentaje: numberValue(row.porcentaje),
    operaciones: numberValue(row.operaciones),
    recaudacion: numberValue(row.recaudacion),
    comision: numberValue(row.comision),
    gastosOperacionales: numberValue(row.gastos_operacionales),
    ganancias: numberValue(row.ganancias),
    salida: numberValue(row.salida),
}));

const mapPendingOperations = (rows: unknown[]): MetricasOperacionPendiente[] => arrayValue(rows).map((row) => ({
    idOperacion: numberValue(row.id_operacion),
    idCliente: row.id_cliente == null ? null : numberValue(row.id_cliente),
    codigoOperacion: String(row.codigo_operacion ?? "-"),
    dni: String(row.dni ?? "-"),
    nombreCompleto: String(row.nombre_completo ?? "Sin nombre"),
    idComunidad: row.id_comunidad == null ? null : numberValue(row.id_comunidad),
    comunidad: String(row.comunidad ?? "Sin comunidad"),
    ruta: String(row.ruta ?? ""),
    empresa: String(row.empresa ?? "-"),
    cuenta: String(row.cuenta ?? "-"),
    fecha: String(row.fecha ?? ""),
    recaudacion: numberValue(row.recaudacion),
    transferencia: numberValue(row.transferencia),
    estado: String(row.estado ?? "Sin estado"),
}));

const mapDerivations = (rows: unknown[]): MetricasDerivacion[] => arrayValue(rows).map((row) => ({
    idEmpresaContraparte: row.id_empresa_contraparte == null ? null : numberValue(row.id_empresa_contraparte),
    empresaContraparte: String(row.empresa_contraparte ?? "Sin empresa"),
    idBancoContraparte: row.id_banco_contraparte == null ? null : numberValue(row.id_banco_contraparte),
    bancoContraparte: String(row.banco_contraparte ?? "Sin banco"),
    idComunidad: row.id_comunidad == null ? null : numberValue(row.id_comunidad),
    comunidad: String(row.comunidad ?? "Sin comunidad"),
    porcentajeComision: numberValue(row.porcentaje_comision),
    operaciones: numberValue(row.operaciones),
    gastosOperacionales: numberValue(row.gastos_operacionales),
    montoTransferido: numberValue(row.monto_transferido),
}));

const mapBestClient = (value: unknown): MetricasMejorCliente | null => {
    const row = recordValue(value);
    if (!row.id_cliente) return null;
    return {
        idCliente: numberValue(row.id_cliente),
        dni: String(row.dni ?? "-"),
        nombreCompleto: String(row.nombre_completo ?? "Sin nombre"),
        operaciones: numberValue(row.operaciones),
        ganancias: numberValue(row.ganancias),
    };
};

const mapBreakdown = (rows: unknown[]): MetricasDesglose[] => arrayValue(rows).map((row) => ({
    ruta: String(row.ruta ?? ""),
    idEmpresa: numberValue(row.id_empresa),
    empresa: String(row.empresa ?? "-"),
    idCuenta: numberValue(row.id_empresa_cuenta_bancaria),
    idBanco: numberValue(row.id_banco),
    cuenta: String(row.cuenta ?? "-"),
    operaciones: numberValue(row.operaciones),
    pagadas: numberValue(row.pagadas),
    pendientes: numberValue(row.pendientes),
    clientesNuevos: numberValue(row.clientes_nuevos),
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

const mapSeries = (rows: unknown[]): MetricasSerie[] => arrayValue(rows).map((row) => ({
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
    clientesNuevos: numberValue(row.clientes_nuevos),
}));

export const metricasBancariasService = {
    async getCuentas(): Promise<MetricasCuenta[]> {
        const rows = await rpc<JsonRecord[]>("f_get_tb_ruta_operacion_caja", { p_id_estado: 1 });
        return arrayValue(rows).map((row) => ({
            ruta: String(row.ruta ?? "").toLowerCase(),
            idEmpresa: numberValue(row.id_empresa),
            empresa: String(row.nombre_empresa ?? "-"),
            idCuenta: numberValue(row.id_empresa_cuenta_bancaria),
            idBanco: numberValue(row.id_banco),
            cuenta: String(row.nombre_banco ?? "-"),
        })).filter((row) => row.ruta && row.idEmpresa && row.idCuenta && row.idBanco);
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
                p_id_banco: consulta.idBanco,
                p_estados: null,
            }),
        ]);

        const series = mapSeries(seriesRaw);

        const breakdown = mapBreakdown(breakdownRaw);

        const distributionByFamily = new Map(arrayValue(distributionRaw).map((row) => [String(row.familia ?? ""), numberValue(row.operaciones)]));
        const activeDistribution = consulta.servicio === "all" ? distributionMeta : distributionMeta.filter((item) => item.key === consulta.servicio);
        const distribution: DistribucionServicio[] = activeDistribution.map((item) => ({
            name: item.name,
            value: distributionByFamily.get(serviceFamilies[item.key]) ?? 0,
            color: item.color,
        })).filter((item) => item.value > 0);

        return { summary: mapResumen(summaryRaw), series, breakdown, distribution };
    },

    async getBreakdown(consulta: MetricasConsulta): Promise<MetricasDesglose[]> {
        const params = { ...familyParams(consulta) };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const rows = await rpc<unknown[]>("f_get_dashboard_metricas_bancarias_desglose", params);
        return mapBreakdown(rows);
    },

    async getCommunities(consulta: MetricasConsulta): Promise<MetricasComunidad[]> {
        const params = { ...familyParams(consulta) };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const rows = await rpc<unknown[]>("f_get_dashboard_metricas_bancarias_comunidades", params);
        return mapCommunities(rows);
    },

    async getTopClients(consulta: MetricasConsulta): Promise<MetricasCliente[]> {
        const params = { ...familyParams(consulta) };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const rows = await rpc<unknown[]>("f_get_dashboard_metricas_bancarias_clientes_top", params);
        return mapClients(rows);
    },

    async getCommissions(consulta: MetricasConsulta): Promise<MetricasComision[]> {
        const params = { ...familyParams(consulta) };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const rows = await rpc<unknown[]>("f_get_dashboard_metricas_bancarias_comisiones", params);
        return mapCommissions(rows);
    },

    async getPendingOperations(consulta: MetricasConsulta): Promise<MetricasOperacionPendiente[]> {
        const params = { ...familyParams(consulta) };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const rows = await rpc<unknown[]>("f_get_dashboard_metricas_bancarias_pendientes", params);
        return mapPendingOperations(rows);
    },

    async getDerivations(consulta: MetricasConsulta): Promise<MetricasDerivacion[]> {
        const params = { ...familyParams(consulta) };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const rows = await rpc<unknown[]>("f_get_dashboard_metricas_bancarias_derivaciones", params);
        return mapDerivations(rows);
    },

    async getSeries(consulta: MetricasConsulta): Promise<MetricasSerie[]> {
        const params = { ...familyParams(consulta), p_granularidad: "DIA" };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const rows = await rpc<unknown[]>("f_get_dashboard_metricas_bancarias_serie", params);
        return mapSeries(rows);
    },

    async getBestClient(consulta: MetricasConsulta): Promise<MetricasMejorCliente | null> {
        const params = { ...familyParams(consulta) };
        delete (params as Partial<typeof params>).p_incluir_comparacion;
        const row = await rpc<unknown>("f_get_dashboard_metricas_bancarias_mejor_cliente", params);
        return mapBestClient(row);
    },
};
