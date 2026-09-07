import { useEffect, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    CajaOperativaCierre,
    OperacionRutaBancaria,
    SafetyPayDerivedCompany,
    SafetyPayKpi,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

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

const emptyKpi = (): SafetyPayKpi => ({
    caja_recaudacion: 0,
    ganancias: 0,
    salidas: 0,
    gastos_operacionales: 0,
    pendiente_transferencia: 0,
    empresas_derivadas: [],
    total_transferencia: 0,
});

const numberValue = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeKpi = (value: SafetyPayKpi | null | undefined): SafetyPayKpi => ({
    caja_recaudacion: numberValue(value?.caja_recaudacion),
    ganancias: numberValue(value?.ganancias),
    salidas: numberValue(value?.salidas),
    gastos_operacionales: numberValue(value?.gastos_operacionales),
    pendiente_transferencia: numberValue(value?.pendiente_transferencia),
    total_transferencia: numberValue(value?.total_transferencia),
    empresas_derivadas: Array.isArray(value?.empresas_derivadas)
        ? value.empresas_derivadas.map((item) => ({
            empresa: String(item?.empresa ?? "-"),
            cuenta: String(item?.cuenta ?? "-"),
            monto: numberValue(item?.monto),
        }))
        : [],
});

const mergeKpis = (values: SafetyPayKpi[]): SafetyPayKpi => {
    const merged = emptyKpi();
    const companies = new Map<string, SafetyPayDerivedCompany>();

    values.forEach((value) => {
        merged.caja_recaudacion += value.caja_recaudacion;
        merged.ganancias += value.ganancias;
        merged.salidas += value.salidas;
        merged.gastos_operacionales += value.gastos_operacionales;
        merged.pendiente_transferencia += value.pendiente_transferencia;
        merged.total_transferencia += value.total_transferencia;
        value.empresas_derivadas.forEach((item) => {
            const key = `${item.empresa.trim().toLocaleLowerCase()}|${item.cuenta.trim().toLocaleLowerCase()}`;
            const current = companies.get(key);
            if (current) {
                current.monto += item.monto;
            } else {
                companies.set(key, { ...item });
            }
        });
    });

    merged.empresas_derivadas = [...companies.values()];
    return merged;
};

interface UseBancariaSafetyPayKpiResult {
    data: SafetyPayKpi | null;
    error: string | null;
    isLoading: boolean;
}

export const useBancariaSafetyPayKpi = (
    ruta: OperacionRutaBancaria,
    activeCompanyId: number | null,
    activeAccountId: number | null,
    activeCajaId: number | null,
    historyDate: string | null = null,
    historyClosureId: number | null = null,
    refreshKey = 0,
): UseBancariaSafetyPayKpiResult => {
    const [data, setData] = useState<SafetyPayKpi | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        let ignore = false;

        if (ruta !== "safetypay" || activeCajaId == null || activeCompanyId == null || activeAccountId == null) {
            setData(null);
            setError(null);
            setIsLoading(false);
            return;
        }

        setData(null);
        setError(null);
        setIsLoading(true);

        const baseParams = {
            p_id_caja: activeCajaId,
            p_id_empresa: activeCompanyId,
            p_id_empresa_cuenta_bancaria: activeAccountId,
        };

        const request = historyDate
            ? historyClosureId != null
                ? operacionesRpcService.getSafetyPayKpi({
                    ...baseParams,
                    p_id_caja_cierre: historyClosureId,
                }).then(normalizeKpi)
                : operacionesRpcService.getCajaCierres({ p_id_caja: activeCajaId }).then(async (closures: CajaOperativaCierre[]) => {
                    const matchingClosures = closures.filter((closure) => toHistoryDateKey(closure.fecha_cierre) === historyDate);
                    if (!matchingClosures.length) return emptyKpi();

                    const values = await Promise.all(matchingClosures.map((closure) => operacionesRpcService.getSafetyPayKpi({
                        ...baseParams,
                        p_id_caja_cierre: closure.id,
                    })));
                    return mergeKpis(values.map(normalizeKpi));
                })
            : operacionesRpcService.getSafetyPayKpi({
                ...baseParams,
                p_id_caja_cierre: null,
            }).then(normalizeKpi);

        request
            .then((value) => {
                if (!ignore) setData(value);
            })
            .catch((reason) => {
                if (!ignore) setError(reason instanceof Error ? reason.message : "No se pudo cargar KPI de SafetyPay.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeAccountId, activeCajaId, activeCompanyId, historyClosureId, historyDate, refreshKey, ruta]);

    return { data, error, isLoading };
};
