type RawReportRow = Record<string, unknown>;
type ReportText = string | null;
type ReportNumber = number | null;

export interface ReporteEfectivizacionUnificadaRow {
    facturacion: ReportText;
    empresa: ReportText;
    cuenta: ReportText;
    operacion: ReportText;
    dni: ReportText;
    comunidad: ReportText;
    deposito: ReportNumber;
    porcentaje_comision: ReportNumber;
    soles_comision: ReportNumber;
    gastos: ReportNumber;
    ganancia: ReportNumber;
    transferencia: ReportNumber;
    estado: ReportText;
    fecha: ReportText;
}

interface ReporteEfectivizacionSource {
    empresa?: unknown;
    banco?: unknown;
    efectivizacion?: unknown;
    efectivizacion_pendientes?: unknown;
    derivados?: unknown;
    derivados_pendientes?: unknown;
}

const toRows = (value: unknown): RawReportRow[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((row): row is RawReportRow => row !== null && typeof row === "object" && !Array.isArray(row));
};

const firstValue = (...values: unknown[]): unknown => {
    const value = values.find((candidate) => candidate !== null && candidate !== undefined && String(candidate).trim() !== "");
    return value === undefined || value === null ? null : value;
};

const firstText = (...values: unknown[]): ReportText => {
    const value = firstValue(...values);
    return value === null ? null : String(value);
};

const firstNumber = (...values: unknown[]): ReportNumber => {
    const value = firstValue(...values);
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeRow = (
    row: RawReportRow,
    data: ReporteEfectivizacionSource,
    isDerived: boolean,
): ReporteEfectivizacionUnificadaRow => ({
    facturacion: firstText(row.facturacion, row.tipo_facturacion),
    empresa: firstText(
        row.empresa,
        isDerived ? row.nombre_empresa_salida_origen : row.nombre_empresa_salida,
        row.nombre_empresa_ingreso,
        data.empresa,
    ),
    cuenta: firstText(
        row.cuenta,
        isDerived ? row.nombre_banco_empresa_cuenta_salida_origen : row.nombre_banco_empresa_cuenta_salida,
        row.cuenta_cliente,
        row.nombre_banco_empresa_cuenta_ingreso,
        data.banco,
    ),
    operacion: firstText(row.operacion, row.codigo_operacion_deposito_cliente),
    dni: firstText(row.dni, row.dni_cliente),
    comunidad: firstText(row.comunidad, row.nombre_comunidad),
    deposito: firstNumber(row.deposito, row.monto),
    porcentaje_comision: firstNumber(row.porcentaje_comision, row.comision_servicio),
    soles_comision: firstNumber(row.soles_comision, row.comision),
    gastos: firstNumber(row.gastos, 0),
    ganancia: firstNumber(row.ganancia, 0),
    transferencia: firstNumber(row.transferencia, 0),
    estado: firstText(row.estado, row.nombre_estado),
    fecha: firstText(row.fecha, row.fecha_deposito_cliente, row.fecha_registro),
});

export const getReporteEfectivizacionUnificada = (data: ReporteEfectivizacionSource) => ({
    pagadas: [
        ...toRows(data.efectivizacion).map((row) => normalizeRow(row, data, false)),
        ...toRows(data.derivados).map((row) => normalizeRow(row, data, true)),
    ],
    pendientes: [
        ...toRows(data.efectivizacion_pendientes).map((row) => normalizeRow(row, data, false)),
        ...toRows(data.derivados_pendientes).map((row) => normalizeRow(row, data, true)),
    ],
});
