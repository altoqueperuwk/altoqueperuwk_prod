import { supabase } from "@/lib/supabase";
import {
    getUnifiedFlowLabel,
    mergeMovimientos,
    sortOperacionesChronologically,
} from "@/features/operaciones/efectivizacion/bancaria/utils/bancaria-bandeja-data";
import type {
    OperacionCajaMovimiento,
    OperacionProceso,
    OperacionRutaBancaria,
    RutaGananciaEspecial,
    RutaOperacionKpi,
    SafetyPayKpi,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export interface ReporteCierreCajaRow {
    id: number;
    id_empresa: number;
    nombre_empresa: string;
    id_empresa_cuenta_bancaria: number;
    id_banco: number;
    nombre_banco: string;
    ruta: string | null;
    id_caja: number | null;
    id_caja_cierre: number | null;
    fecha_cierre: string | null;
    tiene_cierre: boolean;
}

export type ReporteCierreCajaData = Record<string, unknown> & {
    id_caja?: number;
    id_caja_cierre?: number;
    id_empresa?: number;
    id_empresa_cuenta_bancaria?: number;
    id_banco?: number;
    ruta?: string;
    empresa?: string;
    banco?: string;
    fecha_cierre?: string;
    safetypay_kpi?: SafetyPayKpi;
};

export interface ReporteCierreHistoricoContext {
    idCaja: number;
    idCajaCierre: number;
    idEmpresa: number;
    idEmpresaCuentaBancaria: number;
    idBanco?: number | null;
    ruta: OperacionRutaBancaria;
    nombreEmpresa: string;
    nombreBanco: string;
    fechaCierre: string;
}

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

const toNumber = (value: unknown) => {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
};

const toReportEfectivizacionRow = (
    row: OperacionProceso,
    flow: ReturnType<typeof getUnifiedFlowLabel>,
    context: ReporteCierreHistoricoContext,
) => {
    const isDerivedSent = flow === "Derivados Enviados";
    const isDerivedAttended = flow === "Derivados Atendidos";
    const deposito = toNumber(row.monto_deposito_cliente);
    const transferenciaReal = toNumber(row.monto_transferencia_cliente);
    const gastoIngreso = toNumber(row.resultado_comision_banco_ingreso);
    const gastoSalida = isPaid(row as unknown as Record<string, unknown>)
        ? toNumber(row.resultado_comision_banco_salida)
        : 0;
    const directFlow = ["DIRECTO_CAJA", "RETORNO", "RETORNO_DIRECTO"].includes(
        String(row.tipo_flujo_pago_deuda ?? "").trim().toUpperCase(),
    );
    const empresa = isDerivedSent
        ? row.nombre_empresa_salida
        : isDerivedAttended
            ? row.nombre_empresa_salida_origen
            : row.nombre_empresa_ingreso ?? context.nombreEmpresa;
    const cuenta = isDerivedSent
        ? row.nombre_banco_empresa_cuenta_salida
        : isDerivedAttended
            ? row.nombre_banco_empresa_cuenta_salida_origen
            : row.nombre_banco_empresa_cuenta_ingreso ?? context.nombreBanco;

    return {
        ...row,
        facturacion: row.tipo_facturacion,
        empresa,
        cuenta,
        empresa_derivada: isDerivedSent ? empresa : null,
        cuenta_derivada: isDerivedSent ? cuenta : null,
        operacion: row.codigo_operacion_deposito_cliente,
        dni: row.dni_cliente,
        comunidad: row.nombre_comunidad,
        deposito,
        porcentaje_comision: toNumber(row.comision_servicio),
        soles_comision: toNumber(row.resultado_comision_servicio),
        gastos: directFlow ? 0 : gastoIngreso + gastoSalida,
        ganancia: directFlow
            ? 0
            : deposito
                - transferenciaReal
                - gastoIngreso
                - toNumber(row.resultado_comision_banco_salida),
        transferencia: isDerivedSent && context.ruta !== "safetypay" ? 0 : transferenciaReal,
        fuera_horario: Boolean(row.flag_fuera_horario),
        estado: row.nombre_estado,
        fecha: row.fecha_deposito_cliente ?? row.fecha_registro,
        flujo: flow,
        derivada_congelada: isDerivedSent,
    };
};

const toReportPagoDeudaRow = (row: OperacionProceso) => {
    const returns = Array.isArray(row.pd_retorno_empresas_cuentas)
        ? row.pd_retorno_empresas_cuentas
        : [];
    const empresasRetorno = returns.map((item) => item.empresa).filter(Boolean).join("\n");
    const cuentasRetorno = returns.map((item) => item.cuenta).filter(Boolean).join("\n");

    return {
        ...row,
        operacion: row.codigo_operacion_deposito_cliente,
        id_operacion_banco: row.id,
        flujo: row.tipo_flujo_pago_deuda,
        dni: row.dni_cliente,
        empresa_salida: row.nombre_empresa_salida,
        cuenta_salida: row.nombre_banco_empresa_cuenta_salida,
        monto_transferencia: toNumber(row.monto_transferencia_cliente ?? row.monto_deposito_cliente),
        transferencia: toNumber(row.monto_transferencia_cliente ?? row.monto_deposito_cliente),
        empresa_ingreso: empresasRetorno || row.pd_retorno_nombre_empresa_ingreso || row.nombre_empresa_ingreso,
        cuenta_ingreso: cuentasRetorno || row.pd_retorno_nombre_banco_empresa_cuenta_ingreso || row.nombre_banco_empresa_cuenta_ingreso,
        deposito: toNumber(row.pd_retorno_monto_devolucion ?? row.monto_devuelto),
        porcentaje_comision: toNumber(row.comision_servicio),
        soles_comision: toNumber(row.resultado_comision_servicio),
        estado: row.nombre_estado,
        fecha: row.fecha_registro,
    };
};

const toReportPosRow = (row: OperacionProceso) => ({
    ...row,
    operacion: row.codigo_operacion_deposito_cliente,
    dni: row.dni_cliente,
    empresa: row.nombre_empresa_salida,
    cuenta: row.nombre_banco_empresa_cuenta_salida,
    deposito: toNumber(row.monto_deposito_cliente),
    porcentaje_comision: toNumber(row.comision_servicio),
    soles_comision: toNumber(row.resultado_comision_servicio),
    transferencia: toNumber(row.monto_transferencia_cliente),
    estado: row.nombre_estado,
    fecha: row.fecha_registro,
    flujo: "POS",
});

const splitByPaidState = <T extends Record<string, unknown>>(rows: T[]) => ({
    paid: rows.filter(isPaid),
    pending: rows.filter((row) => !isPaid(row)),
});

const specialGainAccounts = new Set([
    "scotiabank:5:33",
    "scotiabank:8:7",
    "banbif:7:16",
]);

const hasSpecialGain = (context: ReporteCierreHistoricoContext) =>
    specialGainAccounts.has(`${context.ruta}:${context.idEmpresa}:${context.idEmpresaCuentaBancaria}`);

export const getPaidTableRows = (data: ReporteCierreCajaData, flow: ReporteCierreCajaFlow): ReporteCierreCajaTableRow[] => {
    const rows = flow === "pago_deuda"
        ? [...reportRows(data, "pago_deuda"), ...reportRows(data, "pago_deuda_pendientes")]
        : reportRows(data, flow).filter(isPaid);

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
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

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

export const getReporteCierreHistorico = async (
    context: ReporteCierreHistoricoContext,
): Promise<ReporteCierreCajaData> => {
    const dateKey = toDateKey(context.fechaCierre);
    const fechaDesde = `${dateKey}T00:00:00-05:00`;
    const fechaHasta = `${dateKey}T23:59:59-05:00`;

    const [unifiedRows, pagoDeudaRows, movementRows, kpiRows, gastosSalida, specialGainRows, safetyPayKpi] = await Promise.all([
        rpc<OperacionProceso[]>("f_get_tb_operacion_bandeja_unificada", {
            p_tab: "UNIFICADO",
            p_ruta: context.ruta,
            p_id_empresa: context.idEmpresa,
            p_id_empresa_cuenta_bancaria: context.idEmpresaCuentaBancaria,
            p_filtro_estado: "Todos",
            p_fecha_caja_cierre_desde: fechaDesde,
            p_fecha_caja_cierre_hasta: fechaHasta,
        }),
        rpc<OperacionProceso[]>("f_get_tb_pago_deuda_bandeja", {
            p_ruta: context.ruta,
            p_id_empresa_salida: context.idEmpresa,
            p_id_empresa_cuenta_salida: context.idEmpresaCuentaBancaria,
            p_fecha_caja_cierre_desde: fechaDesde,
            p_fecha_caja_cierre_hasta: fechaHasta,
        }),
        rpc<OperacionCajaMovimiento[]>("f_get_tb_operacion_caja", {
            p_id_caja: context.idCaja,
            p_fecha_caja_cierre_desde: fechaDesde,
            p_fecha_caja_cierre_hasta: fechaHasta,
        }),
        rpc<RutaOperacionKpi[]>("f_get_tb_ruta_operacion_kpi_cierre_operaciones_v2", {
            p_id_caja_cierre: context.idCajaCierre,
            p_ruta: context.ruta,
            p_id_empresa: context.idEmpresa,
            p_id_empresa_cuenta_bancaria: context.idEmpresaCuentaBancaria,
        }),
        rpc<number>("f_get_tb_ruta_operacion_gastos_salida_v2", {
            p_ruta: context.ruta,
            p_id_empresa: context.idEmpresa,
            p_id_empresa_cuenta_bancaria: context.idEmpresaCuentaBancaria,
            p_id_caja: context.idCaja,
            p_id_caja_cierre: context.idCajaCierre,
        }),
        hasSpecialGain(context)
            ? rpc<RutaGananciaEspecial[]>("f_get_tb_ruta_operacion_ganancias_efectivizacion_v2", {
                  p_ruta: context.ruta,
                  p_id_empresa: context.idEmpresa,
                  p_id_empresa_cuenta_bancaria: context.idEmpresaCuentaBancaria,
                  p_id_caja: context.idCaja,
                  p_historico: true,
                  p_fecha_consulta: dateKey,
              })
            : Promise.resolve([]),
        context.ruta === "safetypay"
            ? rpc<SafetyPayKpi>("f_get_tb_ruta_operacion_kpi_safetypay", {
                  p_id_caja: context.idCaja,
                  p_id_caja_cierre: context.idCajaCierre,
                  p_id_empresa: context.idEmpresa,
                  p_id_empresa_cuenta_bancaria: context.idEmpresaCuentaBancaria,
              })
            : Promise.resolve(null as SafetyPayKpi | null),
    ]);

    const uniqueUnifiedRows = sortOperacionesChronologically(
        (unifiedRows ?? []).filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index),
    );
    const effectRows: Record<string, unknown>[] = [];
    const derivedAttendedRows: Record<string, unknown>[] = [];
    const posRows: Record<string, unknown>[] = [];

    for (const row of uniqueUnifiedRows) {
        const flow = getUnifiedFlowLabel(row, context.ruta, {
            idEmpresa: context.idEmpresa,
            idEmpresaCuentaBancaria: context.idEmpresaCuentaBancaria,
        });
        if (flow === "POS") {
            posRows.push(toReportPosRow(row));
        } else if (flow === "Derivados Atendidos") {
            derivedAttendedRows.push(toReportEfectivizacionRow(row, flow, context));
        } else {
            effectRows.push(toReportEfectivizacionRow(row, flow, context));
        }
    }

    const effect = splitByPaidState(effectRows);
    const derivedAttended = splitByPaidState(derivedAttendedRows);
    const pos = splitByPaidState(posRows);
    const pagoDeuda = splitByPaidState(
        sortOperacionesChronologically(pagoDeudaRows ?? []).map(toReportPagoDeudaRow),
    );
    const movimientos = mergeMovimientos(
        (movementRows ?? []).filter((row) => String(row.nombre_estado ?? "").trim().toUpperCase() !== "RETENIDO"),
    );
    const specialGain = specialGainRows?.[0];
    const baseKpi = kpiRows?.[0] ?? {};
    const kpi = {
        ...baseKpi,
        ...(specialGain ? { ganancias: toNumber(specialGain.ganancias) } : {}),
        gastos_banco_salida: toNumber(gastosSalida),
    };

    return {
        id_caja: context.idCaja,
        id_caja_cierre: context.idCajaCierre,
        id_empresa: context.idEmpresa,
        id_empresa_cuenta_bancaria: context.idEmpresaCuentaBancaria,
        id_banco: context.idBanco ?? undefined,
        ruta: context.ruta,
        empresa: context.nombreEmpresa,
        banco: context.nombreBanco,
        fecha_cierre: context.fechaCierre,
        safetypay_kpi: safetyPayKpi ?? undefined,
        kpi,
        efectivizacion: effect.paid,
        efectivizacion_pendientes: effect.pending,
        derivados: derivedAttended.paid,
        derivados_pendientes: derivedAttended.pending,
        pago_deuda: pagoDeuda.paid,
        pago_deuda_pendientes: pagoDeuda.pending,
        pos: pos.paid,
        pos_pendientes: pos.pending,
        movimientos,
        retenciones: [],
        retenciones_pagadas: [],
        retenciones_pendientes: [],
        operaciones_unificadas: uniqueUnifiedRows,
        pago_deuda_bandeja: pagoDeudaRows ?? [],
        movimientos_bandeja: movementRows ?? [],
    };
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
        if (row.id_caja == null || row.id_caja_cierre == null || !row.ruta || !row.fecha_cierre) {
            return Promise.reject(new Error("El cierre seleccionado no tiene caja, ruta o fecha completa."));
        }

        return getReporteCierreHistorico({
            idCaja: row.id_caja,
            idCajaCierre: row.id_caja_cierre,
            idEmpresa: row.id_empresa,
            idEmpresaCuentaBancaria: row.id_empresa_cuenta_bancaria,
            idBanco: row.id_banco,
            ruta: row.ruta as OperacionRutaBancaria,
            nombreEmpresa: row.nombre_empresa,
            nombreBanco: row.nombre_banco,
            fechaCierre: row.fecha_cierre,
        });
    },
};
