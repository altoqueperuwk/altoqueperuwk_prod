import { useEffect, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionRutaBancaria,
    RutaOperacionKpi,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const useBancariaKpis = (ruta: OperacionRutaBancaria, refreshKey = 0) => {
    const [data, setData] = useState<RutaOperacionKpi | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let ignore = false;

        setIsLoading(true);
        setError(null);

        operacionesRpcService
            .getRutaKpi(ruta)
            .then((result) => {
                if (!ignore) setData(result?.[0] ?? null);
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
    }, [refreshKey, ruta]);

    return { data, error, isLoading };
};
