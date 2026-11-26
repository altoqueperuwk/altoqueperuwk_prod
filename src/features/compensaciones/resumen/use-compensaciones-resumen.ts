import { useCallback, useEffect, useState } from "react";
import { compensacionesResumenService } from "./compensaciones-resumen.service";
import type { CompensacionPeriodo } from "./compensaciones-resumen.types";

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) return String(error.message);
    return "No fue posible consultar el resumen de compensaciones.";
};

export const useCompensacionesResumen = () => {
    const [periodos, setPeriodos] = useState<CompensacionPeriodo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);

        compensacionesResumenService
            .getPeriodos()
            .then((result) => {
                if (active) setPeriodos(result);
            })
            .catch((reason: unknown) => {
                if (!active) return;
                setPeriodos([]);
                setError(getErrorMessage(reason));
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [refreshKey]);

    return { periodos, isLoading, error, refresh };
};
