import { supabase } from "@/lib/supabase";
import type {
    MetricasServicioConsulta,
    MetricasServicioDashboard,
    MetricasServicioDesglose,
    MetricasServicioDistribucion,
    MetricasServicioEmbudo,
    MetricasServicioOperativo,
    MetricasServicioResumen,
    MetricasServicioSede,
    MetricasServicioSerie,
    MetricasServicioValores,
} from "./metricas-servicio.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const arrayValue = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(recordValue) : [];
const numberValue = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : numberValue(value);

const rpc = async <T>(name: string, params: JsonRecord): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};

const paramsFromConsulta = (consulta: MetricasServicioConsulta) => ({
    p_servicio: consulta.servicio,
    p_fecha_desde: consulta.fechaDesde,
    p_fecha_hasta: consulta.fechaHasta,
    p_id_usuario_consulta: consulta.idUsuarioConsulta,
    p_id_sucursal: consulta.idSucursal,
    p_id_estado: consulta.idEstado,
    p_id_banco_cliente: consulta.idBancoCliente,
    p_id_banco_destino: consulta.idBancoDestino,
    p_id_pos: consulta.idPos,
});

const mapValores = (value: unknown): MetricasServicioValores => {
    const row = recordValue(value);
    return {
        operaciones: numberValue(row.operaciones),
        pagadas: numberValue(row.pagadas),
        pendientes: numberValue(row.pendientes),
        montoProcesado: numberValue(row.monto_procesado),
        montoAtendido: numberValue(row.monto_atendido),
        comisiones: numberValue(row.comisiones),
        gastos: numberValue(row.gastos),
        ganancias: numberValue(row.ganancias),
        salidas: numberValue(row.salidas),
        clientesNuevos: numberValue(row.clientes_nuevos),
        tasaExito: numberValue(row.tasa_exito),
        ticketPromedio: numberValue(row.ticket_promedio),
    };
};

const mapEmbudo = (value: unknown): MetricasServicioEmbudo => {
    const row = recordValue(value);
    return {
        solicitudes: numberValue(row.solicitudes),
        procesadas: numberValue(row.procesadas),
        atendidas: numberValue(row.atendidas),
        paso4: numberValue(row.paso4),
    };
};

const mapSede = (row: JsonRecord): MetricasServicioSede => ({
    idSucursal: nullableNumber(row.id_sucursal),
    sede: String(row.sede ?? "Sin sede"),
    operaciones: numberValue(row.operaciones),
    pagadas: numberValue(row.pagadas),
    paso4: numberValue(row.paso4),
    clientesNuevos: numberValue(row.clientes_nuevos),
    montoProcesado: numberValue(row.monto_procesado),
    montoAtendido: numberValue(row.monto_atendido),
    comisiones: numberValue(row.comisiones),
    gastos: numberValue(row.gastos),
    ganancias: numberValue(row.ganancias),
    salidas: numberValue(row.salidas),
    tasaExito: numberValue(row.tasa_exito),
});

export const metricasServicioService = {
    async getDashboard(consulta: MetricasServicioConsulta): Promise<MetricasServicioDashboard> {
        const params = paramsFromConsulta(consulta);
        const catalogParams = {
            ...params,
            p_id_sucursal: null,
            p_id_estado: null,
            p_id_banco_cliente: null,
            p_id_banco_destino: null,
            p_id_pos: null,
        };
        const [summaryRaw, seriesRaw, sedesRaw, distributionRaw, breakdownRaw, catalogSedesRaw, catalogDistributionRaw] = await Promise.all([
            rpc<unknown>("f_get_dashboard_metricas_servicios_resumen", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_serie", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_sedes", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_distribucion", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_desglose", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_sedes", catalogParams),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_distribucion", catalogParams),
        ]);

        const summaryRow = recordValue(summaryRaw);
        const periodo = recordValue(summaryRow.periodo);
        const summary: MetricasServicioResumen = {
            servicio: String(summaryRow.servicio ?? consulta.servicio) as MetricasServicioOperativo,
            periodo: { desde: String(periodo.desde ?? consulta.fechaDesde), hasta: String(periodo.hasta ?? consulta.fechaHasta) },
            actual: mapValores(summaryRow.actual),
            embudo: mapEmbudo(summaryRow.embudo),
        };

        const series: MetricasServicioSerie[] = arrayValue(seriesRaw).map((row) => ({
            periodo: String(row.periodo ?? ""),
            operaciones: numberValue(row.operaciones),
            pagadas: numberValue(row.pagadas),
            paso4: numberValue(row.paso4),
            clientesNuevos: numberValue(row.clientes_nuevos),
            montoProcesado: numberValue(row.monto_procesado),
            montoAtendido: numberValue(row.monto_atendido),
            comisiones: numberValue(row.comisiones),
            gastos: numberValue(row.gastos),
            ganancias: numberValue(row.ganancias),
            salidas: numberValue(row.salidas),
        }));

        const sedes = arrayValue(sedesRaw).map(mapSede);
        const distribution: MetricasServicioDistribucion[] = arrayValue(distributionRaw).map((row) => ({
            dimension: String(row.dimension ?? ""),
            clave: String(row.clave ?? ""),
            nombre: String(row.nombre ?? "Sin dato"),
            operaciones: numberValue(row.operaciones),
            pagadas: numberValue(row.pagadas),
            montoProcesado: numberValue(row.monto_procesado),
            comisiones: numberValue(row.comisiones),
            ganancias: numberValue(row.ganancias),
        }));
        const breakdown: MetricasServicioDesglose[] = arrayValue(breakdownRaw).map((row) => ({
            ...mapSede(row),
            servicio: String(row.servicio ?? consulta.servicio) as MetricasServicioOperativo,
            idBancoCliente: nullableNumber(row.id_banco_cliente),
            entidadTarjeta: String(row.entidad_tarjeta ?? "Sin entidad"),
            idBancoDestino: nullableNumber(row.id_banco_destino),
            bancoDestino: String(row.banco_destino ?? "Sin destino"),
            idPos: nullableNumber(row.id_pos),
            pos: String(row.pos ?? "Sin POS"),
            idEmpresaSalida: nullableNumber(row.id_empresa_salida),
            empresaSalida: String(row.empresa_salida ?? "Sin empresa"),
            idCuentaSalida: nullableNumber(row.id_cuenta_salida),
            cuentaSalida: String(row.cuenta_salida ?? "Sin cuenta"),
            pendientes: numberValue(row.pendientes),
        }));

        const mapDistribution = (row: JsonRecord): MetricasServicioDistribucion => ({
            dimension: String(row.dimension ?? ""),
            clave: String(row.clave ?? ""),
            nombre: String(row.nombre ?? "Sin dato"),
            operaciones: numberValue(row.operaciones),
            pagadas: numberValue(row.pagadas),
            montoProcesado: numberValue(row.monto_procesado),
            comisiones: numberValue(row.comisiones),
            ganancias: numberValue(row.ganancias),
        });

        return {
            summary,
            series,
            sedes,
            distribution,
            breakdown,
            filterOptions: {
                sedes: arrayValue(catalogSedesRaw).map(mapSede),
                distribution: arrayValue(catalogDistributionRaw).map(mapDistribution),
            },
        };
    },
};
