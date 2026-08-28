interface SaldoBancoKpi {
    caja_inicial?: number | null;
    caja_recaudacion?: number | null;
    total_recaudado?: number | null;
    ingresos?: number | null;
    salidas?: number | null;
    gastos_banco_salida?: number | null;
}

const CUENTAS_CON_RETENCION_RECAUDACION = new Set([
    "5:3:33",
    "8:3:7",
    "7:4:16",
    "5:2:4",
    "6:2:5",
]);

export const tieneRetencionRecaudacion = (
    idEmpresa?: number | null,
    idBanco?: number | null,
    idCuenta?: number | null,
) => idEmpresa != null && idBanco != null && idCuenta != null
    && CUENTAS_CON_RETENCION_RECAUDACION.has(`${idEmpresa}:${idBanco}:${idCuenta}`);

export const calcularSaldoBanco = (
    kpi: SaldoBancoKpi | null | undefined,
    idEmpresa?: number | null,
    idBanco?: number | null,
    idCuenta?: number | null,
) => {
    const recaudacionDisponible = tieneRetencionRecaudacion(idEmpresa, idBanco, idCuenta)
        ? 0
        : Number(kpi?.caja_recaudacion ?? kpi?.total_recaudado ?? 0);

    return Number(kpi?.caja_inicial ?? 0)
        + Number(kpi?.ingresos ?? 0)
        + recaudacionDisponible
        - Number(kpi?.salidas ?? 0)
        - Number(kpi?.gastos_banco_salida ?? 0);
};
