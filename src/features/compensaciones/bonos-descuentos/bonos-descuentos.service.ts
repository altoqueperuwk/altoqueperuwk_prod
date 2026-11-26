import { shareInFlight } from "@/lib/share-in-flight";
import { supabase } from "@/lib/supabase";
import type {
    BonosDescuentosDashboard,
    BonosDescuentosDetalle,
    BonosDescuentosFiltros,
    BonosDescuentosRegistros,
    BonosDescuentosResultado,
    BonosDescuentosTipoRegistro,
} from "./bonos-descuentos.types";

const parameters = (filters: BonosDescuentosFiltros) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.mes)) throw new Error("Selecciona un periodo válido");
    for (const date of [filters.desde, filters.hasta]) {
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date))
            throw new Error("Selecciona fechas válidas");
    }
    if (filters.desde && filters.hasta && filters.desde > filters.hasta) throw new Error("Desde no puede ser posterior a Hasta");
    return {
        ...(filters.estado !== undefined || filters.desde !== undefined || filters.hasta !== undefined || filters.criterio !== undefined
            ? {
                  p_estado: filters.estado || null,
                  p_desde: filters.desde || null,
                  p_hasta: filters.hasta || null,
                  p_criterio: filters.criterio || null,
              }
            : {}),
        p_mes: `${filters.mes}-01`,
        p_vista: filters.vista,
        p_concepto: filters.concepto || null,
        p_pagina: filters.pagina,
        p_tamano: filters.tamano,
    };
};

const rpcError = (error: { code?: string; message?: string }) => {
    if (error.code === "PGRST202" || error.code === "PGRST203")
        return new Error("Los filtros del Dashboard aún no están disponibles en el servidor. Solicita la actualización y vuelve a intentarlo.");
    return error;
};

export const bonosDescuentosService = {
    async list(filters: BonosDescuentosFiltros): Promise<BonosDescuentosResultado> {
        const args = { ...parameters(filters), p_tipo: filters.tipo || null };
        const { data, error } = await shareInFlight(`list:${JSON.stringify(args)}`, () => supabase.rpc("f_get_compensacion_mis_bonos_descuentos", args));
        if (error) throw rpcError(error);
        if (!data) throw new Error("No se recibió el resumen del periodo");
        return data as BonosDescuentosResultado;
    },
    /** Una sola llamada: totales + avisos + registros paginados (SQL138). */
    async dashboard(filters: BonosDescuentosFiltros, tipo: BonosDescuentosTipoRegistro): Promise<BonosDescuentosDashboard> {
        const args = { ...parameters(filters), p_tipo: tipo || null };
        const { data, error } = await shareInFlight(`dashboard:${JSON.stringify(args)}`, () => supabase.rpc("f_get_compensacion_mis_dashboard", args));
        if (error) throw rpcError(error);
        if (!data) throw new Error("No se recibió el resumen del periodo");
        return data as BonosDescuentosDashboard;
    },
    async registros(filters: BonosDescuentosFiltros, tipo: BonosDescuentosTipoRegistro): Promise<BonosDescuentosRegistros> {
        const args = { ...parameters(filters), p_tipo: tipo || null };
        const { data, error } = await shareInFlight(`registros:${JSON.stringify(args)}`, () => supabase.rpc("f_get_compensacion_mis_registros", args));
        if (error) throw rpcError(error);
        if (!data) throw new Error("No se recibieron los registros del periodo");
        return data as BonosDescuentosRegistros;
    },
    async detail(filters: BonosDescuentosFiltros): Promise<BonosDescuentosDetalle> {
        const { data, error } = await supabase.rpc("f_get_compensacion_mis_bonos_descuentos_detalle", parameters(filters));
        if (error) throw rpcError(error);
        if (!data) throw new Error("No se recibió el detalle del concepto");
        return data as BonosDescuentosDetalle;
    },
};
