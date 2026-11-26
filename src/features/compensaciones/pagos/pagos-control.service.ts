import { supabase } from "@/lib/supabase";

export interface PagosControlOperacion extends Record<string, unknown> {
    id: number;
    dni: string;
    cliente: string;
    codigo: string;
    monto: number;
    estado: string;
    pagada: boolean;
    fecha: string;
    cierre_estado: string;
    fecha_cierre: string | null;
    limite: string | null;
    entrega_id: number | null;
    voucher_estado: string;
    voucher_evidencia: string | null;
    fecha_entrega: string | null;
    entrega_tardia: boolean | null;
}
export interface PagosControlIncidencia extends Record<string, unknown> {
    id: number;
    concepto: string;
    fecha: string;
    estado: string;
    motivo: string;
    importe: number | null;
    puede_descargo: boolean;
}
export interface PagosControlResult {
    id_colaborador: number | null;
    es_admin: boolean;
    /** Lo informa el servidor: el Jefe Superior de Pagos ve en lectura al equipo. */
    es_jefe_superior?: boolean;
    mes: string;
    plazo_horas: number;
    total: number;
    total_paginas: number;
    items: PagosControlOperacion[];
    incidencias: PagosControlIncidencia[];
    incidencias_paginas: number;
    colaboradores: { id: number; nombre: string }[];
    resumen: {
        operaciones: number;
        pagadas: number;
        cerradas: number;
        vouchers_validados: number;
        total: number;
        mes_cerrado: boolean;
        sin_descuadre: boolean;
    };
    cuadre: { estado?: string; importe?: number | null; motivo?: string };
}
const rpc = async <T>(name: string, params: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data as T;
};
/** Lo usa el selector de operación de las penalidades de Pagos (pagos-operacion-select). */
export const pagosControlService = {
    list: (month: string, person: number | null, page: number, size: number, incidentPage = 1) =>
        rpc<PagosControlResult>("f_get_compensacion_pagos_control", {
            p_mes: month + "-01",
            p_colaborador: person,
            p_pagina: page,
            p_tamano: size,
            p_inc_pagina: incidentPage,
        }),
};
