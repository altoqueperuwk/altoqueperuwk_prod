import { supabase } from "@/lib/supabase";

export interface PagosRegistroNuevo {
    id: number;
    documento: string;
    nombre: string;
    fechaRegistro: string;
    registradoPor: string;
    sede: string;
    operacion: string;
    monto: number | null;
    fechaPago: string;
    areaPagos: string;
    validacion: { id: number; estado: string; importe: number | null } | null;
}
type Raw = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");

export const pagosRegistroNuevoService = {
    /** Solo el Jefe Superior de Pagos valida; el resto de Pagos conserva su Registro Nuevo habitual. */
    async esValidador(): Promise<boolean> {
        const { data, error } = await supabase.rpc("f_get_compensacion_pagos_es_validador");
        if (error) throw error;
        return data === true;
    },
    async listar(mes: string): Promise<PagosRegistroNuevo[]> {
        const { data, error } = await supabase.rpc("f_get_compensacion_pagos_registros_nuevos", { p_mes: `${mes}-01` });
        if (error) throw error;
        if (!Array.isArray(data?.items)) throw new Error("No se confirmó la consulta de registros nuevos");
        return (data.items as Raw[]).map((item) => {
            const validacion = item.validacion as Raw | null;
            return {
                id: Number(item.id),
                documento: text(item.documento),
                nombre: text(item.nombre),
                fechaRegistro: text(item.fecha_registro),
                registradoPor: text(item.registrado_por),
                sede: text(item.sede),
                operacion: text(item.operacion),
                monto: item.monto == null ? null : Number(item.monto),
                fechaPago: text(item.fecha_pago),
                areaPagos: text(item.area_pagos),
                validacion: validacion
                    ? { id: Number(validacion.id), estado: text(validacion.estado), importe: validacion.importe == null ? null : Number(validacion.importe) }
                    : null,
            };
        });
    },
    async validar(cliente: number) {
        const { data, error } = await supabase.rpc("f_post_compensacion_pagos_registro_validar", { p_cliente: cliente });
        if (error) throw error;
        if (!data?.id) throw new Error("No se confirmó la validación del registro.");
        return data;
    },
};
