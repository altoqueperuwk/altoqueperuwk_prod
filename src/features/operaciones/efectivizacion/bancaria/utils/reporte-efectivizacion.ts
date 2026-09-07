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
    derivada_congelada: boolean;
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
): ReporteEfectivizacionUnificadaRow => {
    const derivadaCongelada = row.derivada_congelada === true
        || String(row.derivada_congelada ?? "").trim().toLowerCase() === "true";

    // En el reporte del flujo enviado, empresa/cuenta son el destino actual.
    // empresa_derivada/cuenta_derivada representan el origen y no deben
    // reemplazar al destino en Excel ni PDF.
    const empresa = derivadaCongelada
        ? firstText(row.empresa, row.nombre_empresa_salida, row.nombre_empresa_ingreso, data.empresa)
        : firstText(
            row.empresa_derivada,
            row.empresa,
            isDerived ? row.nombre_empresa_salida_origen : row.nombre_empresa_salida,
            row.nombre_empresa_ingreso,
            data.empresa,
        );
    const cuenta = derivadaCongelada
        ? firstText(row.cuenta, row.nombre_banco_empresa_cuenta_salida, row.nombre_banco_empresa_cuenta_ingreso, data.banco)
        : firstText(
            row.cuenta_derivada,
            row.cuenta,
            isDerived ? row.nombre_banco_empresa_cuenta_salida_origen : row.nombre_banco_empresa_cuenta_salida,
            row.cuenta_cliente,
            row.nombre_banco_empresa_cuenta_ingreso,
            data.banco,
        );

    return {
        facturacion: firstText(row.facturacion, row.tipo_facturacion),
        empresa,
        cuenta,
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
        derivada_congelada: derivadaCongelada,
    };
};

const isPaid = (row: ReporteEfectivizacionUnificadaRow) => row.estado?.trim().toLowerCase() === "pagado";

export const getReporteEfectivizacionUnificada = (data: ReporteEfectivizacionSource) => {
    const efectivizacionRows = [
        ...toRows(data.efectivizacion),
        ...toRows(data.efectivizacion_pendientes),
    ].map((row) => normalizeRow(row, data, false));
    const derivadosAtendidos = [
        ...toRows(data.derivados),
        ...toRows(data.derivados_pendientes),
    ].map((row) => normalizeRow(row, data, true));

    // El backend marca como derivada_congelada la operación derivada enviada
    // por la ruta actual. Las demás operaciones de efectivización son normales.
    const efectivizacion = efectivizacionRows.filter((row) => !row.derivada_congelada);
    const derivadosEnviados = efectivizacionRows.filter((row) => row.derivada_congelada);

    return {
        efectivizacion,
        derivadosAtendidos,
        derivadosEnviados,
        // Compatibilidad para consumidores existentes que aún requieran separar por estado.
        pagadas: efectivizacion.filter(isPaid),
        pendientes: efectivizacion.filter((row) => !isPaid(row)),
    };
};
