import { type DependencyList, useEffect, useState } from "react";
import { useOptionalAuth } from "@/providers/auth-provider";

/** Descarta respuestas anteriores y vacía los datos durante cada cambio de consulta. */
export const usePersonalConsulta = <T>(load: () => Promise<T>, dependencies: DependencyList) => {
    const identity = useOptionalAuth()?.user?.id;
    const [data, setData] = useState<T | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        setData(null);
        setBusy(true);
        setError("");
        Promise.resolve()
            .then(load)
            .then((result) => {
                if (active) setData(result);
            })
            .catch((cause) => {
                if (active) setError(cause?.message ?? "No fue posible consultar los registros");
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
        // Los consumidores declaran explícitamente todas las claves de la consulta.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...dependencies, identity]);
    return { data, busy, error };
};
