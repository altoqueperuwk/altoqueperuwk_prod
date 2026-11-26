import { supabase } from "@/lib/supabase";
import type { CalificacionPolitica } from "./evidencias.types";

export interface CalificacionContextoPublico {
    asesor: string;
    sede: string;
    politica: CalificacionPolitica;
}
export interface CalificacionAsesor {
    id: number;
    nombre: string;
    sede: string;
}
export interface CalificacionPropia {
    asesor: string;
    sede: string;
    token: string;
    expira: string;
}
export const calificacionPublicaService = {
    async propiaContexto(): Promise<Pick<CalificacionPropia, "asesor" | "sede"> | null> {
        const { data, error } = await supabase.rpc("f_get_compensacion_calificacion_propia_contexto");
        if (error) throw error;
        return data;
    },
    async propia(regenerar = false): Promise<CalificacionPropia> {
        const { data, error } = await supabase.rpc("f_post_compensacion_calificacion_propia", { p_regenerar: regenerar });
        if (error) throw error;
        return data;
    },
    async asesores(): Promise<CalificacionAsesor[]> {
        const { data, error } = await supabase.rpc("f_get_compensacion_calificacion_asesores");
        if (error) throw error;
        return data;
    },
    async generar(id: number): Promise<string> {
        const { data, error } = await supabase.rpc("f_post_compensacion_calificacion_enlace", { p_id_colaborador: id });
        if (error) throw error;
        return data.token;
    },
    async publica<T>(body: Record<string, unknown>): Promise<T> {
        // Sin sesión ni JWT de empleado, incluso si el navegador tiene una sesión abierta.
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calificacion-publica`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: "omit",
            referrerPolicy: "no-referrer",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo conectar al servicio de calificaciones");
        return data;
    },
};

export function calificacionUrl(token: string, origin: string): string {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Enlace inválido");
    const base = new URL(origin);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))
        throw new Error("Configura una URL pública HTTPS para compartir el QR");
    return new URL(`/calificar/${token}`, base.origin).href;
}
