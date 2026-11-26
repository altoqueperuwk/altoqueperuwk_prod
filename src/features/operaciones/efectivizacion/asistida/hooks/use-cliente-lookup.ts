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
    if (typeof value === "number") return [String(value)];
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (Array.isArray(parsed)) return parsed.filter((v: unknown) => typeof v === "string") as string[];
    } catch {
        /* ignore */
    }
    return typeof value === "string" ? [value] : [];
};

const getExpectedDocumentoLength = (tipoDocumento: number) => (Number(tipoDocumento) === 2 ? 9 : 8);

export const useClienteLookup = (numeroDocumento: string, tipoDocumento = 1) => {
    const [result, setResult] = useState<ClienteLookupResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let active = true;
        setError("");
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
                    if (!active) return;
                    const row = rows.find((candidate) => String(candidate.numero_documento).trim() === cleanDocumento);
                    if (row) {
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
                .catch(() => {
                    if (!active) return;
                    setResult(null);
                    setError("No se pudo consultar el cliente. Intenta nuevamente o ingresa sus datos manualmente.");
                })
                .finally(() => {
                    if (active) setIsLoading(false);
                });
        }, 500);

        return () => {
            active = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [numeroDocumento, tipoDocumento]);

    return { result, isLoading, error };
};
