import { supabase } from "@/lib/supabase";
import { type ClientesNuevosFiltros, clientesNuevosService, normalizeClientesNuevosResult } from "../atenciones/clientes-nuevos.service";
import { evidenciasService } from "./evidencias.service";

export const tiktokClientesService = {
    evidenceUrl: evidenciasService.getTiktokEvidenceUrl,
    validate: clientesNuevosService.validate,
    async register(documento: string, nombre: string, tipo: number, celular: string, comunidad: number | null, file: File) {
        const evidence = await evidenciasService.uploadTiktokEvidence(file);
        // Un error de transporte puede seguir a un commit. Conservar la evidencia;
        // la conciliación de huérfanos debe comprobar referencias en servidor.
        const { data, error } = await supabase.rpc("f_post_compensacion_tiktok_cliente", {
            p_documento: documento,
            p_nombre: nombre.trim(),
            p_tipo_documento: tipo,
            p_celular: celular || null,
            p_id_comunidad: comunidad,
            p_evidencia: evidence,
        });
        if (error) throw error;
        if (!data) throw new Error("No se confirmó el registro TikTok Live");
        return data as { id: number; fecha_registro: string };
    },
    async list(month: string, page: number, size: number, filters: ClientesNuevosFiltros = {}) {
        const { data, error } = await supabase.rpc("f_get_compensacion_tiktok_clientes", {
            p_mes: `${month}-01`,
            p_pagina: page,
            p_tamano: size,
            p_tipo_documento: filters.tipo ? Number(filters.tipo) : null,
            p_documento: filters.documento ?? "",
            p_estado: filters.estado ?? "",
            p_desde: filters.desde || null,
            p_hasta: filters.hasta || null,
            p_nombre_cliente: filters.nombre ?? "",
            p_colaborador: filters.colaborador ?? "",
        });
        if (error) throw error;
        if (!data) throw new Error("No se confirmó la consulta TikTok Live");
        return normalizeClientesNuevosResult(data);
    },
};
