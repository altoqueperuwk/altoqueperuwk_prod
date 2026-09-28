import { useCallback, useEffect, useState } from "react";
import { metricasBancariasService } from "./metricas-bancarias.service";
import type {
    MetricasCliente,
    MetricasComision,
    MetricasConsulta,
    MetricasComunidad,
    MetricasCuenta,
    MetricasDesglose,
    MetricasOperacionPendiente,
    MetricasMejorCliente,
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
    const [breakdown, setBreakdown] = useState<MetricasDesglose[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        setBreakdown([]);

        metricasBancariasService.getBreakdown(consulta)
            .then((result) => {
                if (!active) return;
                setBreakdown(result);
            })
            .catch((reason: unknown) => {
                if (!active) return;
                setBreakdown([]);
                setError(getErrorMessage(reason));
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => { active = false; };
    }, [consulta, refreshKey]);

    return { breakdown, isLoading, error, refresh };
};

export const useMetricasBancariasComunidades = (consulta: MetricasConsulta) => {
    const [communities, setCommunities] = useState<MetricasComunidad[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        setCommunities([]);

        metricasBancariasService.getCommunities(consulta)
            .then((result) => {
                if (active) setCommunities(result);
            })
            .catch((reason: unknown) => {
                if (!active) return;
                setCommunities([]);
                setError(getErrorMessage(reason));
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => { active = false; };
    }, [consulta]);

    return { communities, isLoading, error };
};

export const useMetricasBancariasClientes = (consulta: MetricasConsulta) => {
    const [clients, setClients] = useState<MetricasCliente[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        setClients([]);

        metricasBancariasService.getTopClients(consulta)
            .then((result) => {
                if (active) setClients(result);
            })
            .catch((reason: unknown) => {
                if (!active) return;
                setClients([]);
                setError(getErrorMessage(reason));
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => { active = false; };
    }, [consulta]);

    return { clients, isLoading, error };
};

const useMetricasBancariasCollection = <T,>(consulta: MetricasConsulta, loader: (value: MetricasConsulta) => Promise<T[]>) => {
    const [items, setItems] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        setItems([]);
        loader(consulta)
            .then((result) => { if (active) setItems(result); })
            .catch((reason: unknown) => {
                if (!active) return;
                setItems([]);
                setError(getErrorMessage(reason));
            })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [consulta, loader]);

    return { items, isLoading, error };
};

const loadCommissions = (consulta: MetricasConsulta) => metricasBancariasService.getCommissions(consulta);
const loadPendingOperations = (consulta: MetricasConsulta) => metricasBancariasService.getPendingOperations(consulta);
const loadSeries = (consulta: MetricasConsulta) => metricasBancariasService.getSeries(consulta);

export const useMetricasBancariasComisiones = (consulta: MetricasConsulta) => {
    const result = useMetricasBancariasCollection<MetricasComision>(consulta, loadCommissions);
    return { commissions: result.items, isLoading: result.isLoading, error: result.error };
};

export const useMetricasBancariasPendientes = (consulta: MetricasConsulta) => {
    const result = useMetricasBancariasCollection<MetricasOperacionPendiente>(consulta, loadPendingOperations);
    return { pendingOperations: result.items, isLoading: result.isLoading, error: result.error };
};

export const useMetricasBancariasSerie = (consulta: MetricasConsulta) => {
    const result = useMetricasBancariasCollection<MetricasSerie>(consulta, loadSeries);
    return { series: result.items, isLoading: result.isLoading, error: result.error };
};

export const useMetricasBancariasMejorCliente = (consulta: MetricasConsulta) => {
    const [bestClient, setBestClient] = useState<MetricasMejorCliente | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setError(null);
        setBestClient(null);
        metricasBancariasService.getBestClient(consulta)
            .then((result) => { if (active) setBestClient(result); })
            .catch((reason: unknown) => {
                if (!active) return;
                setBestClient(null);
                setError(getErrorMessage(reason));
            })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [consulta]);

    return { bestClient, isLoading, error };
};
