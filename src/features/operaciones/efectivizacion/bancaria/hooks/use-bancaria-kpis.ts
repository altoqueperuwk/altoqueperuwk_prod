import { useEffect, useMemo, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    CajaOperativaCierre,
    OperacionRutaBancaria,
    RutaOperacionKpi,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

const GANANCIAS_ESPECIALES = new Set([
    "scotiabank:5:33",
    "scotiabank:8:7",
    "banbif:7:16",
    "banbif:5:38",
]);

const hasGananciaEspecial = (ruta: OperacionRutaBancaria, idEmpresa: number | null, idCuenta: number | null) =>
    idEmpresa !== null && idCuenta !== null && GANANCIAS_ESPECIALES.has(`${ruta}:${idEmpresa}:${idCuenta}`);

const formatCierreBadge = (value: string | null | undefined) => {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return `Cierre: ${new Intl.DateTimeFormat("es-PE", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Lima",
        year: "numeric",
    }).format(date)}`;
};

const numberFromSnapshot = (snapshot: Record<string, unknown> | null, key: string) => {
    const value = snapshot?.[key];
    return typeof value === "number" ? value : Number(value ?? 0);
};

const toHistoryDateKey = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Lima",
        year: "numeric",
    }).formatToParts(new Date(value));

    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";

    return `${year}-${month}-${day}`;
};

const buildHistoryKpi = (ruta: OperacionRutaBancaria, rows: CajaOperativaCierre[], historyDate: string): RutaOperacionKpi | null => {
    const filtered = rows.filter((row) => toHistoryDateKey(row.fecha_cierre) === historyDate);
    if (!filtered.length) return null;

    const maxSnapshot = (key: string) => Math.max(...filtered.map((row) => numberFromSnapshot(row.kpi_snapshot, key)));
    const sum = (key: keyof CajaOperativaCierre) => filtered.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    const fueraHorario = filtered.reduce(
        (total, row) => total + Number(row.fuera_horario ?? numberFromSnapshot(row.kpi_snapshot, "fuera_horario")),
        0,
    );
    const latest = filtered[0];

    return {
        id: latest.id,
        ruta,
        caja_inicial: sum("saldo_inicial"),
        caja_actual: sum("saldo_actual"),
        total_recaudado: sum("total_recaudado"),
        ingresos: sum("ingresos"),
        salidas: sum("salida"),
        gastos_operacionales: sum("gastos"),
        ganancias: sum("ganancia"),
        ingresos_retenidos: sum("ingresos_retenido"),
        fuera_horario: fueraHorario,
        pendiente_depositar: maxSnapshot("pendiente_depositar"),
        total_efectivizacion: maxSnapshot("total_efectivizacion"),
        total_pago_deuda: maxSnapshot("total_pago_deuda"),
        id_estado: latest.id_estado,
        nombre_estado: latest.nombre_estado,
        id_usuario: latest.id_usuario,
        nombre_usuario: latest.nombre_usuario,
        fecha_registro: latest.fecha_cierre,
    };
};

const mergeKpis = (ruta: OperacionRutaBancaria, rows: RutaOperacionKpi[]): RutaOperacionKpi | null => {
    if (!rows.length) return null;
    const first = rows[0];
    const sum = (key: keyof RutaOperacionKpi) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

    return {
        ...first,
        ruta,
        caja_inicial: sum("caja_inicial"),
        caja_actual: sum("caja_actual"),
        total_recaudado: sum("total_recaudado"),
        ingresos: sum("ingresos"),
        salidas: sum("salidas"),
        gastos_operacionales: sum("gastos_operacionales"),
        ganancias: sum("ganancias"),
        ingresos_retenidos: sum("ingresos_retenidos"),
        fuera_horario: sum("fuera_horario"),
        pendiente_depositar: sum("pendiente_depositar"),
        total_efectivizacion: sum("total_efectivizacion"),
        total_pago_deuda: sum("total_pago_deuda"),
        caja_recaudacion: sum("caja_recaudacion"),
        pendiente_transferencia: sum("pendiente_transferencia"),
        gastos_banco_salida: sum("gastos_banco_salida"),
    };
};

// Feature flag de rollback: permite volver a las funciones KPI existentes sin
// modificar la nueva vía basada directamente en tb_operacion_proceso.
export const USE_OPERACIONES_KPI_V2 = true;

const getKpiLive = (
    ruta: OperacionRutaBancaria,
    idEmpresa: number | null,
    idEmpresaCuentaBancaria: number | null,
    idCaja: number | null,
) => operacionesRpcService.getRutaKpiOperacionesV2({
    p_ruta: ruta,
    p_id_empresa: idEmpresa,
    p_id_empresa_cuenta_bancaria: idEmpresaCuentaBancaria,
    p_id_caja: idCaja,
});

export const useBancariaKpis = (
    ruta: OperacionRutaBancaria,
    activeCompanyId: number | null,
    activeAccountId: number | null,
    activeCajaId: number | null,
    historyDate: string | null = null,
    refreshKey = 0,
    queryRoutes: OperacionRutaBancaria[] = [ruta],
) => {
    const [data, setData] = useState<RutaOperacionKpi | null>(null);
    const [gananciasBadge, setGananciasBadge] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const routes = useMemo(() => Array.from(new Set(queryRoutes.length ? queryRoutes : [ruta])), [queryRoutes, ruta]);
    const requestKey = `${routes.join(",")}:${activeCompanyId ?? ""}:${activeAccountId ?? ""}:${activeCajaId ?? ""}:${historyDate ?? ""}`;
    const [loadedKey, setLoadedKey] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;

        setData(null);
        setGananciasBadge(null);
        setLoadedKey(null);
        setIsLoading(true);
        setError(null);

        if (ruta === "safetypay") {
            setIsLoading(false);
            return;
        }

        const request = (() => {
            if (historyDate && !activeCajaId && !activeCompanyId) return Promise.resolve({ kpi: null, gananciasBadge: null });
            if (historyDate) {
                return operacionesRpcService
                    .getCajaCierres(
                        activeCajaId && routes.length === 1
                            ? { p_id_caja: activeCajaId }
                            : { p_id_empresa: activeCompanyId },
                    )
                    .then(async (rows) => {
                        const filtered = rows.filter((row) => toHistoryDateKey(row.fecha_cierre) === historyDate);
                        if (!filtered.length) return { kpi: null, gananciasBadge: null };

                        if (!USE_OPERACIONES_KPI_V2) {
                            return { kpi: buildHistoryKpi(ruta, rows, historyDate), gananciasBadge: null };
                        }

                        const groups = await Promise.all(
                            filtered.map((row) => operacionesRpcService.getRutaKpiCierreOperacionesV2({
                                p_id_caja_cierre: row.id,
                                p_ruta: ruta,
                                p_id_empresa: activeCompanyId,
                                p_id_empresa_cuenta_bancaria: routes.length === 1 ? activeAccountId : null,
                            })),
                        );

                        const base = mergeKpis(ruta, groups.flatMap((group) => group ?? []));
                        const gastosSalida = await Promise.all(
                            filtered.map((row) => operacionesRpcService.getRutaGastosSalidaV2({
                                p_ruta: ruta,
                                p_id_empresa: activeCompanyId,
                                p_id_empresa_cuenta_bancaria: routes.length === 1 ? activeAccountId : null,
                                p_id_caja: activeCajaId,
                                p_id_caja_cierre: row.id,
                            })),
                        );
                        const baseConGastos = base
                            ? { ...base, gastos_banco_salida: gastosSalida.reduce((total, value) => total + Number(value ?? 0), 0) }
                            : base;
                        const useSpecialGain = routes.length === 1 && hasGananciaEspecial(ruta, activeCompanyId, activeAccountId);
                        if (!useSpecialGain) return { kpi: baseConGastos, gananciasBadge: null };

                        const special = await operacionesRpcService.getRutaGananciasEfectivizacionV2({
                            p_ruta: ruta,
                            p_id_empresa: activeCompanyId,
                            p_id_empresa_cuenta_bancaria: activeAccountId,
                            p_id_caja: activeCajaId,
                            p_historico: true,
                            p_fecha_consulta: historyDate,
                        });
                        const specialRow = special?.[0];
                        const specialGain = Number(specialRow?.ganancias ?? 0);

                        return {
                            kpi: baseConGastos ? { ...baseConGastos, ganancias: specialGain } : baseConGastos,
                            gananciasBadge: formatCierreBadge(specialRow?.fecha_cierre_referencia),
                        };
                    });
            }

            const kpiRequest = Promise.all(
                routes.map((item) => USE_OPERACIONES_KPI_V2
                    ? getKpiLive(
                        item,
                        activeCompanyId,
                        routes.length === 1 ? activeAccountId : null,
                        routes.length === 1 ? activeCajaId : null,
                    )
                    : operacionesRpcService.getRutaKpi(
                        item,
                        activeCompanyId,
                        routes.length === 1 ? activeAccountId : null,
                    )),
            );
            const useSpecialGain = routes.length === 1 && hasGananciaEspecial(ruta, activeCompanyId, activeAccountId);
            const specialRequest = useSpecialGain
                ? operacionesRpcService.getRutaGananciasEfectivizacionV2({
                    p_ruta: ruta,
                    p_id_empresa: activeCompanyId,
                    p_id_empresa_cuenta_bancaria: activeAccountId,
                    p_id_caja: activeCajaId,
                    p_historico: false,
                })
                : Promise.resolve([]);
            const gastosSalidaRequest = Promise.all(
                routes.map((item) => operacionesRpcService.getRutaGastosSalidaV2({
                    p_ruta: item,
                    p_id_empresa: activeCompanyId,
                    p_id_empresa_cuenta_bancaria: routes.length === 1 ? activeAccountId : null,
                    p_id_caja: routes.length === 1 ? activeCajaId : null,
                    p_id_caja_cierre: null,
                })),
            );

            return Promise.all([kpiRequest, specialRequest, gastosSalidaRequest]).then(([groups, special, gastosSalida]) => {
                const base = mergeKpis(ruta, groups.flatMap((group) => group?.[0] ? [group[0]] : []));
                const specialRow = special[0];
                const baseConGastos = base
                    ? { ...base, gastos_banco_salida: gastosSalida.reduce((total, value) => total + Number(value ?? 0), 0) }
                    : base;
                return {
                    kpi: baseConGastos && specialRow
                        ? { ...baseConGastos, ganancias: Number(specialRow.ganancias ?? 0) }
                        : baseConGastos,
                    gananciasBadge: formatCierreBadge(specialRow?.fecha_cierre_referencia),
                };
            });
        })();

        request
            .then((result) => {
                if (!ignore) {
                    setData(result.kpi);
                    setGananciasBadge(result.gananciasBadge);
                    setLoadedKey(requestKey);
                }
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar KPI.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeAccountId, activeCajaId, activeCompanyId, historyDate, queryRoutes, refreshKey, requestKey, ruta, routes]);

    return { data, error, isLoading, loadedKey, gananciasBadge };
};
