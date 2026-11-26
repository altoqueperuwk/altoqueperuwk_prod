import { z } from "zod";
import { supabase } from "@/lib/supabase";

const count = z.number().int().nonnegative();
const catalog = z.array(z.object({ id: z.number().int().positive(), nombre: z.string() }));
const panelSchema = z.object({
    ambito: z.literal("GLOBAL"),
    periodo: z.object({ mes: z.string(), estado: z.string() }),
    catalogos: z.object({ sedes: catalog, roles: catalog }),
    kpis: z.object({
        eventos_pendientes: count,
        otro_revisor: count,
    }),
    items: z.array(
        z.object({
            id: z.string(),
            tipo: z.string(),
            rol: z.string(),
            sede: z.string(),
            pendientes: count,
            otro_revisor: count,
            destino: z.string(),
        }),
    ),
    total: count,
    total_paginas: count,
});
export type AdminDashboardPanel = z.infer<typeof panelSchema>;
export interface AdminDashboardFilters {
    mes: string;
    sede: number | null;
    rol: number | null;
    pagina: number;
    tamano: number;
}

export const adminMesLima = () => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
};

/** Lectura exclusiva del panel; no consulta periodos globales ni modifica expedientes. */
export const adminDashboardService = {
    async listar(filters: AdminDashboardFilters): Promise<AdminDashboardPanel> {
        const { data, error } = await supabase.rpc("f_get_compensacion_administracion_panel", {
            p_mes: `${filters.mes}-01`,
            p_sede: filters.sede,
            p_rol: filters.rol,
            p_pagina: filters.pagina,
            p_tamano: filters.tamano,
        });
        if (error) throw error;
        const result = panelSchema.safeParse(data);
        if (!result.success) throw new Error("No se pudo confirmar la respuesta del panel de Administración.");
        return result.data;
    },
};
