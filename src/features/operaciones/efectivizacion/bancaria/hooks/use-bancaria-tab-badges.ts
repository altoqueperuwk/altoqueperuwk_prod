import { useEffect, useMemo, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import type { BancariaTab } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja";

type BadgeMap = Partial<Record<BancariaTab, number>>;
type CompanyBadgeMap = Record<number, number>;

const emptyBadges: BadgeMap = {
    Efectivizacion: 0,
    Unificado: 0,
    "Pago Deuda": 0,
    Derivados: 0,
    POS: 0,
    Retenidos: 0,
};
const retentionRoutes = new Set<OperacionRutaBancaria>(["bcp", "scotiabank", "banbif", "safetypay"]);

export const useBancariaTabBadges = (
    ruta: OperacionRutaBancaria,
    activeCompanyId: number | null,
    activeAccountId: number | null = null,
    historyDate: string | null = null,
    refreshKey = 0,
    enabled = true,
) => {
    const [data, setData] = useState<BadgeMap>(emptyBadges);
    const [error, setError] = useState<string | null>(null);

    const params = useMemo(() => {
        const payload: Record<string, unknown> = {
            p_ruta: ruta,
            p_id_empresa: activeCompanyId,
            p_id_empresa_cuenta_bancaria: activeAccountId,
        };

        if (historyDate) {
            payload.p_fecha_caja_cierre_desde = `${historyDate}T00:00:00`;
            payload.p_fecha_caja_cierre_hasta = `${historyDate}T23:59:59`;
        }

        return payload;
    }, [activeAccountId, activeCompanyId, historyDate, ruta]);

    useEffect(() => {
        let ignore = false;

        if (!enabled) {
            setData(emptyBadges);
            setError(null);
            return () => {
                ignore = true;
            };
        }

        setError(null);

        const request = retentionRoutes.has(ruta)
            ? operacionesRpcService.getOperacionRetencionBandejaBadges(params)
            : operacionesRpcService.getOperacionBandejaBadges(params);

        request
            .then((rows) => {
                if (ignore) return;

                const next: BadgeMap = { ...emptyBadges };
                for (const row of rows ?? []) {
                    next[row.tab as BancariaTab] = Number(row.cantidad ?? 0);
                }
                next.Unificado = ["Efectivizacion", "Derivados", "POS"].reduce(
                    (total, tab) => total + Number(next[tab as BancariaTab] ?? 0),
                    0,
                );
                setData(next);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar conteos de bandeja.");
            });

        return () => {
            ignore = true;
        };
    }, [enabled, params, refreshKey, ruta]);

    return { data, error };
};

export const useBancariaEmpresaBadges = (
    ruta: OperacionRutaBancaria,
    activeTab: BancariaTab,
    activeAccountId: number | null = null,
    historyDate: string | null = null,
    refreshKey = 0,
    enabled = true,
) => {
    const [data, setData] = useState<CompanyBadgeMap>({});
    const [error, setError] = useState<string | null>(null);

    const params = useMemo(() => {
        const payload: Record<string, unknown> = {
            p_ruta: ruta,
            p_id_empresa_cuenta_bancaria: activeAccountId,
        };

        if (historyDate) {
            payload.p_fecha_caja_cierre_desde = `${historyDate}T00:00:00`;
            payload.p_fecha_caja_cierre_hasta = `${historyDate}T23:59:59`;
        }

        return payload;
    }, [activeAccountId, historyDate, ruta]);

    useEffect(() => {
        let ignore = false;

        if (!enabled) {
            setData({});
            setError(null);
            return () => {
                ignore = true;
            };
        }

        setError(null);

        if (activeTab === "Movimientos") {
            setData({});
            return () => {
                ignore = true;
            };
        }

        const request = retentionRoutes.has(ruta)
            ? operacionesRpcService.getOperacionRetencionEmpresaBadges(params)
            : operacionesRpcService.getOperacionEmpresaBadges(params);

        request
            .then((rows) => {
                if (ignore) return;

                const next: CompanyBadgeMap = {};
                for (const row of rows ?? []) {
                    const matchesTab = activeTab === "Unificado"
                        ? ["Efectivizacion", "Derivados", "POS"].includes(row.tab)
                        : row.tab === activeTab;
                    if (matchesTab && row.id_empresa != null) {
                        const companyId = Number(row.id_empresa);
                        next[companyId] = Number(next[companyId] ?? 0) + Number(row.cantidad ?? 0);
                    }
                }
                setData(next);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar conteos por empresa.");
            });

        return () => {
            ignore = true;
        };
    }, [activeTab, enabled, params, refreshKey, ruta]);

    return { data, error };
};
