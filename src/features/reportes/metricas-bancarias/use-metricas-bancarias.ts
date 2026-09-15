import { useCallback, useEffect, useState } from "react";
import { metricasBancariasService } from "./metricas-bancarias.service";
import type {
    DistribucionServicio,
    MetricasConsulta,
    MetricasCuenta,
    MetricasDesglose,
    MetricasResumen,
    MetricasSerie,
} from "./metricas-bancarias.types";

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) return String(error.message);
    return "No fue posible consultar las métricas bancarias.";
};

export const useMetricasBancariasCatalogo = () => {
    const [cuentas, setCuentas] = useState<MetricasCuenta[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        metricasBancariasService.getCuentas()
            .then((result) => {
                if (active) setCuentas(result);
            })
            .catch((reason: unknown) => {
                if (active) setError(getErrorMessage(reason));
            });
        return () => { active = false; };
    }, []);

    return { cuentas, error };
};

export const useMetricasBancarias = (consulta: MetricasConsulta) => {
    const [summary, setSummary] = useState<MetricasResumen | null>(null);
    const [series, setSeries] = useState<MetricasSerie[]>([]);
    const [breakdown, setBreakdown] = useState<MetricasDesglose[]>([]);
    const [distribution, setDistribution] = useState<DistribucionServicio[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);

        metricasBancariasService.getDashboard(consulta)
            .then((result) => {
                if (!active) return;
                setSummary(result.summary);
                setSeries(result.series);
                setBreakdown(result.breakdown);
                setDistribution(result.distribution);
            })
            .catch((reason: unknown) => {
                if (!active) return;
                setSummary(null);
                setSeries([]);
                setBreakdown([]);
                setDistribution([]);
                setError(getErrorMessage(reason));
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => { active = false; };
    }, [consulta, refreshKey]);

    return { summary, series, breakdown, distribution, isLoading, error, refresh };
};
