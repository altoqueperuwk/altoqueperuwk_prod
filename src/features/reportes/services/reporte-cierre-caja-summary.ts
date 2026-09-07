import { getReporteEfectivizacionUnificada } from "@/features/operaciones/efectivizacion/bancaria/utils/reporte-efectivizacion";

export interface ReporteCierreEmpresaSummaryRow {
    empresa: string;
    cuenta: string;
    monto: number;
}

export interface ReporteCierreEmpresaSummary {
    ingresos: ReporteCierreEmpresaSummaryRow[];
    salidas: ReporteCierreEmpresaSummaryRow[];
}

type ReporteCierreSummarySource = Record<string, unknown>;

type ReportRow = Record<string, unknown>;

const rows = (value: unknown): ReportRow[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ReportRow => item !== null && typeof item === "object" && !Array.isArray(item));
};

const text = (value: unknown) => {
    if (value === null || value === undefined || String(value).trim() === "") return "-";
    return String(value).trim();
};

const amount = (value: unknown) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value ?? "0").replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : 0;
};

const groupKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const movementCompany = (row: ReportRow) => {
    const isInternalTransfer = String(row.tipo_origen ?? "").trim().toUpperCase().replaceAll("_", " ") === "TRANSFERENCIA INTERNA";
    return text(isInternalTransfer ? row.nombre_empresa_relacionada : row.nombre_empresa_contraparte ?? row.nombre_empresa);
};

const movementAccount = (row: ReportRow) => {
    const isInternalTransfer = String(row.tipo_origen ?? "").trim().toUpperCase().replaceAll("_", " ") === "TRANSFERENCIA INTERNA";
    return text(isInternalTransfer ? row.nombre_banco_relacionada : row.nombre_banco_contraparte ?? row.nombre_banco);
};

/**
 * Agrupa los importes usando exactamente la Empresa/Cuenta que se muestra
 * en Movimientos y las columnas comerciales de las demás bandejas del reporte.
 */
export const getReporteCierreEmpresaSummary = (data: unknown): ReporteCierreEmpresaSummary => {
    const source = data !== null && typeof data === "object" ? data as ReporteCierreSummarySource : {};
    const ingresos = new Map<string, ReporteCierreEmpresaSummaryRow>();
    const salidas = new Map<string, ReporteCierreEmpresaSummaryRow>();

    const add = (target: Map<string, ReporteCierreEmpresaSummaryRow>, empresaValue: unknown, cuentaValue: unknown, amountValue: unknown) => {
        const monto = amount(amountValue);
        const empresa = text(empresaValue);
        const cuenta = text(cuentaValue);
        const key = `${groupKey(empresa)}|${groupKey(cuenta)}`;
        const current = target.get(key);

        if (current) {
            current.monto += monto;
            return;
        }

        target.set(key, { empresa, cuenta, monto });
    };

    const { efectivizacion, derivadosAtendidos } = getReporteEfectivizacionUnificada(source);
    derivadosAtendidos.forEach((row) => add(salidas, row.empresa, row.cuenta, row.transferencia));

    rows(source.movimientos).forEach((row) => {
        add(ingresos, movementCompany(row), movementAccount(row), row.monto_ingreso);
        add(salidas, movementCompany(row), movementAccount(row), row.monto_salida);
    });

    efectivizacion.forEach((row) => add(salidas, row.empresa, row.cuenta, row.transferencia));

    [...rows(source.pos), ...rows(source.pos_pendientes)].forEach((row) => {
        add(salidas, row.empresa, row.cuenta, row.transferencia ?? row.monto_transferencia);
    });

    [...rows(source.pago_deuda), ...rows(source.pago_deuda_pendientes)].forEach((row) => {
        add(
            salidas,
            row.empresa_salida ?? row.nombre_empresa_salida,
            row.cuenta_salida ?? row.nombre_banco_empresa_cuenta_salida ?? row.cuenta,
            row.transferencia ?? row.monto_transferencia,
        );
    });

    const withoutZero = (target: Map<string, ReporteCierreEmpresaSummaryRow>) => [...target.values()].filter((row) => Math.abs(row.monto) > Number.EPSILON);

    return {
        ingresos: withoutZero(ingresos),
        salidas: withoutZero(salidas),
    };
};
