import { supabase } from "@/lib/supabase";

export interface OperacionCliente {
    id: number;
    flujo: "EFECTIVIZACION" | "PAGO_DEUDA";
    /** Código de la operación; el Pago de deuda no tiene. */
    codigo: string | null;
    /** Lo que se envía al guardar: el código, o `ID:<id>` cuando la operación no tiene código. */
    referencia: string;
    monto: number;
    comision: number | null;
    estado: string;
    fecha: string;
}

export const tarjetaOperacionesService = {
    /** Efectivizaciones y pagos de deuda del cliente en los últimos 7 días, de cualquier banco o flujo. */
    async deCliente(documento: string): Promise<OperacionCliente[]> {
        const { data, error } = await supabase.rpc("f_get_compensacion_atc_operaciones_cliente", { p_documento: documento, p_dias: 7 });
        if (error) throw error;
        if (!Array.isArray(data?.items)) throw new Error("No se pudieron consultar las operaciones del cliente");
        return data.items.map((item: Record<string, unknown>) => ({
            id: Number(item.id),
            flujo: item.flujo === "PAGO_DEUDA" ? "PAGO_DEUDA" : "EFECTIVIZACION",
            codigo: item.codigo ? String(item.codigo) : null,
            referencia: String(item.referencia ?? ""),
            monto: Number(item.monto ?? 0),
            comision: item.comision == null ? null : Number(item.comision),
            estado: String(item.estado ?? ""),
            fecha: String(item.fecha ?? ""),
        }));
    },
};
