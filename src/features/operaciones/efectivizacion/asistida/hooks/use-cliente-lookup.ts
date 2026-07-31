import { useEffect, useRef, useState } from "react";
import { clienteService } from "@/services/cliente.service";

export interface ClienteLookupResult {
    id: number;
    nombre: string;
    celular: string[];
    id_comunidad: number;
}

const parseJsonArray = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter((v) => typeof v === "string") as string[];
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (Array.isArray(parsed)) return parsed.filter((v: unknown) => typeof v === "string") as string[];
    } catch {
        /* ignore */
    }
    return [];
};

const getExpectedDocumentoLength = (tipoDocumento: number) => (Number(tipoDocumento) === 2 ? 9 : 8);

export const useClienteLookup = (numeroDocumento: string, tipoDocumento = 1) => {
    const [result, setResult] = useState<ClienteLookupResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const cleanDocumento = numeroDocumento.replace(/\D/g, "");
        if (cleanDocumento.length !== getExpectedDocumentoLength(tipoDocumento)) {
            setResult(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setResult(null);
        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
            clienteService
                .getList({ p_tipo_documento: tipoDocumento, p_numero_documento: cleanDocumento, p_id_estado: 1 })
                .then((rows) => {
                    if (rows.length > 0) {
                        const row = rows[0];
                        setResult({
                            id: Number(row.id),
                            nombre: String(row.nombre ?? ""),
                            celular: parseJsonArray(row.celular),
                            id_comunidad: Number(row.id_comunidad ?? 0),
                        });
                    } else {
                        setResult(null);
                    }
                })
                .catch(() => setResult(null))
                .finally(() => setIsLoading(false));
        }, 500);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [numeroDocumento, tipoDocumento]);

    return { result, isLoading };
};
