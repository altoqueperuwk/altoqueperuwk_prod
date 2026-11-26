/** Contrapartida de una Alerta Temprana aprobada: bono de Marketing y penalidad del asesor ligada a la misma alerta. */
export interface AlertaContrapartida {
    bono: number | null;
    asesor: string;
    penalidadCodigo: string;
    penalidadNombre: string;
    penalidadMonto: number | null;
    /** true: otra penalidad aprobada del mismo asesor y día ya cubre el descuento; no se duplica. */
    cubierta: boolean;
}

const money = (value: unknown) => {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};
const text = (value: unknown) => (value == null ? "" : String(value));

/** Lee `vinculo_penalidad` del servidor (SQL 146). Tolerante: si falta o la alerta no está aprobada, no hay contrapartida. */
export const alertaContrapartida = (row: Record<string, unknown>): AlertaContrapartida | null => {
    if (row.estado !== "APROBADO" && row.estado !== "LIQUIDADO") return null;
    const raw = row.vinculo_penalidad;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const link = raw as Record<string, unknown>;
    const result: AlertaContrapartida = {
        bono: money(link.importe_bono),
        asesor: text(link.asesor_responsable),
        penalidadCodigo: text(link.codigo_penalidad),
        penalidadNombre: text(link.nombre_penalidad),
        penalidadMonto: money(link.importe_descuento),
        cubierta: link.penalidad_propia_previa === true,
    };
    return result.bono == null && !result.penalidadCodigo && !result.cubierta ? null : result;
};
