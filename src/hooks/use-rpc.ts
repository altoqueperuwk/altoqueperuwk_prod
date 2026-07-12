import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";

interface UseRpcResult<T> {
    data: T | null;
    error: string | null;
    isLoading: boolean;
    execute: (params?: Record<string, unknown>) => Promise<T | null>;
}

export const useRpc = <T = unknown>(
    fnName: string,
    params?: Record<string, unknown>,
): UseRpcResult<T> => {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const execute = useCallback(
        async (overrideParams?: Record<string, unknown>): Promise<T | null> => {
            setIsLoading(true);
            setError(null);

            try {
                const { data: result, error: rpcError } = await supabase.rpc(
                    fnName,
                    overrideParams ?? params ?? {},
                );

                if (rpcError) {
                    setError(rpcError.message);
                    return null;
                }

                setData(result as T);
                return result as T;
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error";
                setError(message);
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [fnName, params],
    );

    return { data, error, isLoading, execute };
};
