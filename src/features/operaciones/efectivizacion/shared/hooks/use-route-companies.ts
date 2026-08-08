import { useEffect, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const useRouteCompanies = (ruta: string, refreshKey: string | number = 0) => {
    const [data, setData] = useState<RutaOperacionCaja[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let ignore = false;

        setIsLoading(true);
        setError(null);

        operacionesRpcService
            .getRutaCajas(ruta)
            .then((result) => {
                if (!ignore) setData(result ?? []);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar empresas.");
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
