import { supabase } from "@/lib/supabase";
import { incidenciasService } from "../incidencias/incidencias.service";
import { marketingService } from "../marketing/marketing.service";
import { evidenciasService } from "./evidencias.service";
import { facturacionAuditoriaService, facturacionFechasMes } from "./facturacion-auditoria.service";

export type AdminOperacionTipo = "BONO" | "PENALIDAD";
export type AdminOperacionGrupo = "OPERACIONES" | "INDISCIPLINA" | "ESCALONADA";
/** Indica qué revisión abre cada fila: las decisiones siguen en el flujo de origen. */
export type AdminOperacionOrigen = "INCIDENCIA" | "EVIDENCIA" | "FACTURACION" | "ALERTA";

export interface AdminOperacion {
    id: number;
    tipo: AdminOperacionTipo;
    origen: AdminOperacionOrigen;
    concepto: string;
    descripcion: string | null;
    colaborador: string | null;
    cargo: string | null;
    registrado_por: string | null;
    fecha_evento: string;
    estado_evento: string;
    importe_aprobado: number | null;
    documento: string | null;
    validacion_jefe: string | null;
    sede: string | null;
    descargo: string | null;
}
export interface AdminOperaciones {
    items: AdminOperacion[];
    total: number;
    total_paginas: number;
    resumen: { pendientes: number; bonos_aprobados: number; penalidades_aprobadas: number; penalidades_confirmadas?: number };
}
export interface AdminOperacionFiltros {
    tipo: string;
    perfil: string;
    estado: string;
    grupo: AdminOperacionGrupo;
    concepto: string;
    busqueda: string;
    pagina: number;
    tamano: number;
}

const noEncontrado = () => new Error("El registro cambió o ya no está disponible; actualiza el listado.");
const mesLima = (fecha: string) => new Date(Date.parse(fecha) - 5 * 3600e3).toISOString().slice(0, 7);

export const adminOperacionesService = {
    async list(filtros: AdminOperacionFiltros): Promise<AdminOperaciones> {
        const { data, error } = await supabase.rpc("f_get_compensacion_administracion_auditoria", {
            p_tipo: filtros.tipo || null,
            p_perfil: filtros.perfil || null,
            p_estado: filtros.estado || null,
            p_busqueda: filtros.busqueda.trim() || null,
            p_pagina: filtros.pagina,
            p_tamano: filtros.tamano,
            p_grupo: filtros.grupo,
            p_concepto: filtros.concepto || null,
        });
        if (error) throw new Error(error.message || "No fue posible consultar las auditorías");
        const result = data as AdminOperaciones | null;
        if (!result || !Array.isArray(result.items) || !result.resumen) throw new Error("No se confirmó la consulta de auditorías");
        return result;
    },
    async incidencia(id: number) {
        const result = await incidenciasService.getList({
            eventId: id,
            tray: "TODOS",
            category: "",
            status: "",
            penaltyId: 0,
            search: "",
            from: "",
            to: "",
            page: 1,
            pageSize: 20,
        });
        const item = result.items.find((row) => row.id === id);
        if (!item) throw noEncontrado();
        return item;
    },
    async evidencia(id: number) {
        const result = await evidenciasService.getList({ eventId: id, page: 1, pageSize: 20 });
        const item = result.items.find((row) => row.id === id);
        if (!item) throw noEncontrado();
        return item;
    },
    async alerta(row: AdminOperacion) {
        const result = await marketingService.list("ALERTA_TEMPRANA", mesLima(row.fecha_evento), "", "", 1, 100);
        const item = result.items.find((caso) => Number(caso.id) === Number(row.id));
        if (!item) throw noEncontrado();
        return item;
    },
    async facturacion(row: AdminOperacion) {
        const result = await facturacionAuditoriaService.listar({
            ...facturacionFechasMes(mesLima(row.fecha_evento)),
            estado: "",
            dni: /^\d{8}$/.test(row.documento ?? "") ? String(row.documento) : "",
            pagina: 1,
            tamano: 100,
        });
        const item = result.items.find((reporte) => Number(reporte.id) === Number(row.id));
        if (!item) throw noEncontrado();
        return item;
    },
};
