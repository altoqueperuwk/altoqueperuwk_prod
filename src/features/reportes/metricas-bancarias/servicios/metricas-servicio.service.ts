import { supabase } from "@/lib/supabase";
import type {
    MetricasServicioConsulta,
    MetricasServicioDashboard,
    MetricasServicioDesglose,
    MetricasServicioDistribucion,
    MetricasServicioOperativo,
    MetricasServicioResumen,
    MetricasServicioSede,
    MetricasServicioSerie,
    MetricasServicioValores,
    MetricasPagoDeudaAnalitica,
    MetricasPagoDeudaConsulta,
} from "./metricas-servicio.types";

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const arrayValue = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(recordValue) : [];
const numberValue = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const nullableNumber = (value: unknown) => value === null || value === undefined ? null : numberValue(value);
const textValue = (value: unknown, fallback: string) => String(value ?? fallback);

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
        sinEmpresaComision: numberValue(row.sin_empresa_comision),
        montoProcesado: numberValue(row.monto_procesado),
        montoAtendido: numberValue(row.monto_atendido),
        comisiones: numberValue(row.comisiones),
        gastos: numberValue(row.gastos),
        ganancias: numberValue(row.ganancias),
        salidas: numberValue(row.salidas),
        pendienteTransferencia: numberValue(row.pendiente_transferencia),
        clientesNuevos: numberValue(row.clientes_nuevos),
        tasaExito: numberValue(row.tasa_exito),
        ticketPromedio: numberValue(row.ticket_promedio),
    };
};

const mapSede = (row: JsonRecord): MetricasServicioSede => ({
    idSucursal: nullableNumber(row.id_sucursal),
    sede: String(row.sede ?? "Sin sede"),
    operaciones: numberValue(row.operaciones),
    pagadas: numberValue(row.pagadas),
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
        const [summaryRaw, seriesRaw, sedesRaw, distributionRaw, breakdownRaw, catalogSedesRaw, catalogDistributionRaw, bancosRaw, posRaw] = await Promise.all([
            rpc<unknown>("f_get_dashboard_metricas_servicios_resumen", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_serie", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_sedes", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_distribucion", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_desglose", params),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_sedes", catalogParams),
            rpc<unknown[]>("f_get_dashboard_metricas_servicios_distribucion", catalogParams),
            rpc<unknown[]>("f_get_tb_banco", { p_id_estado: 1 }),
            consulta.servicio === "pos" ? rpc<unknown[]>("f_get_tb_pos", { p_id_estado: 1 }) : Promise.resolve([]),
        ]);

        const summaryRow = recordValue(summaryRaw);
        const periodo = recordValue(summaryRow.periodo);
        const summary: MetricasServicioResumen = {
            servicio: String(summaryRow.servicio ?? consulta.servicio) as MetricasServicioOperativo,
            periodo: { desde: String(periodo.desde ?? consulta.fechaDesde), hasta: String(periodo.hasta ?? consulta.fechaHasta) },
            actual: mapValores(summaryRow.actual),
        };

        const series: MetricasServicioSerie[] = arrayValue(seriesRaw).map((row) => ({
            periodo: String(row.periodo ?? ""),
            operaciones: numberValue(row.operaciones),
            pagadas: numberValue(row.pagadas),
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
            periodo: row.periodo == null ? null : String(row.periodo),
            operaciones: numberValue(row.operaciones),
            pagadas: numberValue(row.pagadas),
            pendientes: numberValue(row.pendientes),
            clientesNuevos: numberValue(row.clientes_nuevos),
            montoProcesado: numberValue(row.monto_procesado),
            montoAtendido: numberValue(row.monto_atendido),
            comisiones: numberValue(row.comisiones),
            gastos: numberValue(row.gastos),
            ganancias: numberValue(row.ganancias),
            salidas: numberValue(row.salidas),
            tasaExito: numberValue(row.tasa_exito),
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
            periodo: row.periodo == null ? null : String(row.periodo),
            operaciones: numberValue(row.operaciones),
            pagadas: numberValue(row.pagadas),
            pendientes: numberValue(row.pendientes),
            clientesNuevos: numberValue(row.clientes_nuevos),
            montoProcesado: numberValue(row.monto_procesado),
            montoAtendido: numberValue(row.monto_atendido),
            comisiones: numberValue(row.comisiones),
            gastos: numberValue(row.gastos),
            ganancias: numberValue(row.ganancias),
            salidas: numberValue(row.salidas),
            tasaExito: numberValue(row.tasa_exito),
        });
        const entidades = arrayValue(bancosRaw)
            .filter((row) => consulta.servicio === "linkpago"
                ? [11, 17].includes(numberValue(row.id))
                : String(row.tipo ?? "").trim().toLocaleUpperCase("es-PE") === "TARJETA COMERCIAL")
            .map((row) => ({ id: numberValue(row.id), nombre: String(row.nombre ?? "Sin entidad") }))
            .filter((row) => row.id > 0)
            .toSorted((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        const pos = arrayValue(posRaw)
            .map((row) => ({ id: numberValue(row.id), nombre: String(row.nombre ?? "Sin POS") }))
            .filter((row) => row.id > 0)
            .toSorted((a, b) => a.nombre.localeCompare(b.nombre, "es"));

        return {
            summary,
            series,
            sedes,
            distribution,
            breakdown,
            filterOptions: {
                sedes: arrayValue(catalogSedesRaw).map(mapSede),
                distribution: arrayValue(catalogDistributionRaw).map(mapDistribution),
                entidades,
                pos,
            },
        };
    },

    async getPagoDeudaAnalytics(consulta: MetricasPagoDeudaConsulta): Promise<MetricasPagoDeudaAnalitica> {
        const raw = recordValue(await rpc<unknown>("f_get_dashboard_metricas_pago_deuda_analitica", {
            p_fecha_desde: consulta.fechaDesde,
            p_fecha_hasta: consulta.fechaHasta,
            p_id_usuario_consulta: consulta.idUsuarioConsulta,
            p_id_banco_cliente: consulta.idBancoCliente,
            p_id_empresa_salida: null,
            p_id_sucursal: consulta.idSucursal,
        }));
        const summary = recordValue(raw.resumen);
        const bestClient = recordValue(raw.mejor_cliente);
        const bestBranch = recordValue(raw.mejor_sede);
        const mapFinancials = (row: JsonRecord) => ({
            porcentaje: numberValue(row.porcentaje),
            operaciones: numberValue(row.operaciones),
            atendidas: numberValue(row.atendidas),
            pendientes: numberValue(row.pendientes),
            recaudacion: numberValue(row.recaudacion),
            comision: numberValue(row.comision),
            gastosOperacionales: numberValue(row.gastos_operacionales),
            ganancias: numberValue(row.ganancias),
            salida: numberValue(row.salida),
            clientesNuevos: numberValue(row.clientes_nuevos),
            tasaAtencion: numberValue(row.tasa_atencion),
        });
        const mapDistribution = (row: JsonRecord, idKey: string, nameKey: string) => ({
            id: nullableNumber(row[idKey]),
            nombre: textValue(row[nameKey], "Sin dato"),
            operaciones: numberValue(row.operaciones),
            atendidas: numberValue(row.atendidas),
            pendientes: numberValue(row.pendientes),
            montoSolicitado: numberValue(row.monto_solicitado),
            montoTransferido: numberValue(row.monto_transferido),
            ganancias: numberValue(row.ganancias),
            clientesNuevos: numberValue(row.clientes_nuevos),
            tasaAtencion: numberValue(row.tasa_atencion),
        });

        return {
            idSucursalSeleccionada: nullableNumber(raw.id_sucursal_seleccionada),
            idBancoSeleccionado: nullableNumber(raw.id_banco_seleccionado),
            idEmpresaSeleccionada: nullableNumber(raw.id_empresa_seleccionada),
            bancos: arrayValue(raw.bancos).map((row) => ({ id: nullableNumber(row.id_banco), nombre: textValue(row.banco, "Sin banco") })),
            sedes: arrayValue(raw.sedes).map((row) => ({ id: nullableNumber(row.id_sucursal), nombre: textValue(row.sede, "Sin sede") })),
            empresas: arrayValue(raw.empresas).map((row) => ({ id: nullableNumber(row.id_empresa), nombre: textValue(row.empresa, "Sin empresa") })),
            resumen: {
                operaciones: numberValue(summary.operaciones),
                recaudacion: numberValue(summary.recaudacion),
                comision: numberValue(summary.comision),
                gastosOperacionales: numberValue(summary.gastos_operacionales),
                ganancias: numberValue(summary.ganancias),
                salida: numberValue(summary.salida),
                clientesNuevos: numberValue(summary.clientes_nuevos),
                operacionesPendientes: numberValue(summary.operaciones_pendientes),
                montoPendiente: numberValue(summary.monto_pendiente),
            },
            serie: arrayValue(raw.serie).map((row) => ({ periodo: textValue(row.periodo, ""), operaciones: numberValue(row.operaciones), ganancias: numberValue(row.ganancias) })),
            comisiones: arrayValue(raw.comisiones).map(mapFinancials),
            comunidades: arrayValue(raw.comunidades).map((row) => ({
                ...mapFinancials(row),
                idComunidad: nullableNumber(row.id_comunidad),
                comunidad: textValue(row.comunidad, "Sin comunidad"),
                operacionesPendientes: numberValue(row.operaciones_pendientes),
            })),
            clientes: arrayValue(raw.clientes).map((row) => ({
                ...mapFinancials(row),
                idCliente: numberValue(row.id_cliente),
                dni: textValue(row.dni, "-"),
                nombreCompleto: textValue(row.nombre_completo, "Sin nombre"),
                comunidad: textValue(row.comunidad, "Sin comunidad"),
                operacionesPendientes: numberValue(row.operaciones_pendientes),
            })),
            mejorCliente: bestClient.id_cliente == null ? null : {
                idCliente: numberValue(bestClient.id_cliente),
                dni: textValue(bestClient.dni, "-"),
                nombreCompleto: textValue(bestClient.nombre_completo, "Sin nombre"),
                operaciones: numberValue(bestClient.operaciones),
                ganancias: numberValue(bestClient.ganancias),
            },
            mejorSede: bestBranch.sede == null ? null : {
                idSucursal: nullableNumber(bestBranch.id_sucursal),
                sede: textValue(bestBranch.sede, "Sin sede"),
                operaciones: numberValue(bestBranch.operaciones),
                ganancias: numberValue(bestBranch.ganancias),
            },
            distribucionSedes: arrayValue(raw.distribucion_sedes).map((row) => mapDistribution(row, "id_sucursal", "sede")),
            distribucionBancos: arrayValue(raw.distribucion_bancos).map((row) => mapDistribution(row, "id_banco_cliente", "banco")),
            pendientes: arrayValue(raw.pendientes).map((row) => ({
                idOperacion: numberValue(row.id_operacion),
                codigoOperacion: textValue(row.codigo_operacion, "-"),
                dni: textValue(row.dni, "-"),
                nombreCompleto: textValue(row.nombre_completo, "Sin nombre"),
                comunidad: textValue(row.comunidad, "Sin comunidad"),
                banco: textValue(row.banco, "Sin banco"),
                empresa: textValue(row.empresa, "Sin empresa"),
                fecha: textValue(row.fecha, ""),
                recaudacion: numberValue(row.recaudacion),
                transferencia: numberValue(row.transferencia),
                ganancias: numberValue(row.ganancias),
                estado: textValue(row.estado, "Sin estado"),
            })),
        };
    },
};
