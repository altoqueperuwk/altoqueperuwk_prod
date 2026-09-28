import { useCallback, useEffect, useState } from "react";
import { metricasServicioService } from "./metricas-servicio.service";
import type { MetricasPagoDeudaAnalitica, MetricasPagoDeudaConsulta, MetricasServicioConsulta, MetricasServicioDashboard } from "./metricas-servicio.types";

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) return String(error.message);
    return "No fue posible consultar las métricas del servicio.";
};

export const useMetricasServicio = (consulta: MetricasServicioConsulta | null) => {
    const [data, setData] = useState<MetricasServicioDashboard | null>(null);
    const [isLoading, setIsLoading] = useState(Boolean(consulta));
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

    useEffect(() => {
        if (!consulta) {
            setData(null);
            setIsLoading(false);
            return;
        }

        let active = true;
        setIsLoading(true);
        setError(null);

        metricasServicioService.getDashboard(consulta)
            .then((result) => { if (active) setData(result); })
            .catch((reason: unknown) => {
                if (!active) return;
                setData(null);
                setError(getErrorMessage(reason));
            })
            .finally(() => { if (active) setIsLoading(false); });

        return () => { active = false; };
    }, [consulta, refreshKey]);

    return { data, isLoading, error, refresh };
};

export const useMetricasPagoDeuda = (consulta: MetricasPagoDeudaConsulta | null) => {
    const [data, setData] = useState<MetricasPagoDeudaAnalitica | null>(null);
    const [isLoading, setIsLoading] = useState(Boolean(consulta));
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

    useEffect(() => {
        if (!consulta) {
            setData(null);
            setIsLoading(false);
            return;
        }
        let active = true;
        setIsLoading(true);
        setError(null);
        metricasServicioService.getPagoDeudaAnalytics(consulta)
            .then((result) => { if (active) setData(result); })
            .catch((reason: unknown) => {
                if (!active) return;
                setData(null);
                setError(getErrorMessage(reason));
            })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [consulta, refreshKey]);

    return { data, isLoading, error, refresh };
};
