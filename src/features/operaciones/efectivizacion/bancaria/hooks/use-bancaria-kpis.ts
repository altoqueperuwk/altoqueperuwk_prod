import { useEffect, useMemo, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    CajaOperativaCierre,
    OperacionRutaBancaria,
    RutaOperacionKpi,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

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
        pendiente_depositar: sum("pendiente_depositar"),
        total_efectivizacion: sum("total_efectivizacion"),
        total_pago_deuda: sum("total_pago_deuda"),
    };
};

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
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const routes = useMemo(() => Array.from(new Set(queryRoutes.length ? queryRoutes : [ruta])), [queryRoutes, ruta]);
    const requestKey = `${routes.join(",")}:${activeCompanyId ?? ""}:${activeAccountId ?? ""}:${activeCajaId ?? ""}:${historyDate ?? ""}`;
    const [loadedKey, setLoadedKey] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;

        setData(null);
        setLoadedKey(null);
        setIsLoading(true);
        setError(null);

        const request = (() => {
            if (historyDate && !activeCajaId && !activeCompanyId) return Promise.resolve(null);
            if (historyDate) {
                return operacionesRpcService
                    .getCajaCierres(
                        activeCajaId && routes.length === 1
                            ? { p_id_caja: activeCajaId }
                            : { p_id_empresa: activeCompanyId },
                    )
                    .then((rows) => buildHistoryKpi(ruta, rows, historyDate));
            }

            return Promise.all(
                routes.map((item) => operacionesRpcService.getRutaKpi(
                    item,
                    activeCompanyId,
                    routes.length === 1 ? activeAccountId : null,
                )),
            ).then((groups) => mergeKpis(ruta, groups.flatMap((group) => group?.[0] ? [group[0]] : [])));
        })();

        request
            .then((result) => {
                if (!ignore) {
                    setData(result);
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

    return { data, error, isLoading, loadedKey };
};
