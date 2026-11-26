import { type DependencyList, useEffect, useState } from "react";
import { useOptionalAuth } from "@/providers/auth-provider";

export const dashboardQueryTimeout = 20_000;
export const dashboardRefreshInterval = 60_000;

/** Retains a completed response only while refreshing the same personal query. */
export const useDashboardConsulta = <T>(load: () => Promise<T>, dependencies: DependencyList, refresh: number) => {
    const [automaticRefresh, setAutomaticRefresh] = useState(0);
    useEffect(() => {
        // Read RPCs only. The worker and its cron never run from the browser.
        const reload = () => setAutomaticRefresh((value) => value + 1);
        const timer = window.setInterval(reload, dashboardRefreshInterval);
        window.addEventListener("focus", reload);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", reload);
        };
    }, []);
    const identity = useOptionalAuth()?.user?.id;
    const key = JSON.stringify([identity, ...dependencies]);
    const [state, setState] = useState<{ key: string; data: T | null; busy: boolean; error: string }>({ key, data: null, busy: true, error: "" });
    useEffect(() => {
        let active = true;
        setState((old) => ({ key, data: old.key === key ? old.data : null, busy: true, error: "" }));
        const timer = setTimeout(() => {
            if (!active) return;
            active = false;
            setState((old) => ({ ...old, busy: false, error: "La consulta está tardando demasiado. Pulsa Actualizar para reintentar." }));
        }, dashboardQueryTimeout);
        Promise.resolve()
            .then(load)
            .then((data) => {
                if (active) setState({ key, data, busy: false, error: "" });
            })
            .catch((cause: unknown) => {
                if (active)
                    setState((old) => ({
                        ...old,
                        busy: false,
                        error: cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No fue posible consultar los registros",
                    }));
            })
            .finally(() => clearTimeout(timer));
        return () => {
            active = false;
            clearTimeout(timer);
        };
        // The key includes identity and all explicit query dependencies; refresh retains that scope.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, refresh, automaticRefresh]);
    return state.key === key ? state : { data: null, busy: true, error: "" };
};
