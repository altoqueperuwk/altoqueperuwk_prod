import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type MontosReferencia = Readonly<Record<string, number>>;
const vacio: MontosReferencia = {};

/** Monto configurado por concepto para el cargo del usuario de Pagos (SQL 148). Si falla, la ayuda queda solo con la regla. */
export const useMontosReferencia = (habilitado: boolean): MontosReferencia => {
    const [montos, setMontos] = useState<MontosReferencia>(vacio);
    useEffect(() => {
        if (!habilitado) return;
        let activo = true;
        void supabase
            .rpc("f_get_compensacion_montos_referencia")
            .then(({ data, error }) => {
                if (!activo || error || !data || typeof data !== "object") return;
                const limpio = Object.fromEntries(
                    Object.entries(data as Record<string, unknown>)
                        .filter(([, v]) => Number.isFinite(Number(v)))
                        .map(([k, v]) => [k, Number(v)]),
                );
                setMontos(limpio);
            })
            .then(undefined, () => undefined);
        return () => {
            activo = false;
        };
    }, [habilitado]);
    return habilitado ? montos : vacio;
};

/** Ayuda del concepto con su monto de referencia, si el servidor lo configura para el cargo. */
export const ayudaConMonto = (ayuda: string | undefined, monto: number | undefined) =>
    ayuda && monto ? `${ayuda}. Monto de tu cargo: S/ ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ayuda;
