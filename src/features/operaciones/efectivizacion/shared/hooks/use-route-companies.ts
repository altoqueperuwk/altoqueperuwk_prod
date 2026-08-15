import { useEffect, useState } from "react";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const useRouteCompanies = (ruta: string | string[], refreshKey: string | number = 0) => {
    const [data, setData] = useState<RutaOperacionCaja[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let ignore = false;

        setIsLoading(true);
        setError(null);

        const rutas = Array.from(new Set(Array.isArray(ruta) ? ruta : [ruta]));

        Promise.all(rutas.map((item) => operacionesRpcService.getRutaCajas(item)))
            .then((groups) => {
                if (ignore) return;

                const unique = new Map<string, RutaOperacionCaja>();
                groups.flat().forEach((item) => {
                    const key = `${item.ruta}:${item.id_empresa}:${item.id_empresa_cuenta_bancaria}`;
                    if (!unique.has(key)) unique.set(key, item);
                });
                setData(Array.from(unique.values()));
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
    }, [refreshKey, Array.isArray(ruta) ? ruta.join(",") : ruta]);

    return { data, error, isLoading };
};
