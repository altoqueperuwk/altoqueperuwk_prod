import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const getBancariaEstadoLabel = (row: Pick<OperacionProceso, "id_estado" | "nombre_estado">) => {
    const estado = (row.nombre_estado ?? "").trim().toUpperCase();
    if (Number(row.id_estado) === 10 || estado === "ELIMINADO") return "Eliminado";
    return estado === "PAGADO" ? "Pagado" : "Pendiente";
};

// En la bandeja bancaria, POS Solicitado se presenta como Pendiente.
// No ampliar esta equivalencia a pago de deuda u otros estados operativos.
export const matchesBancariaEstadoFilter = (
    row: Pick<OperacionProceso, "id_estado" | "nombre_estado" | "tipo_servicio" | "ruta_origen">,
    filter: string,
) => {
    const expected = filter.trim().toUpperCase();
    const actual = (row.nombre_estado ?? "").trim().toUpperCase();
    if (expected === "TODOS") return true;
    if (Number(row.id_estado) === 10 || actual === "ELIMINADO") return expected === "ELIMINADO";
    if (actual === expected) return true;
    const isPos = (row.tipo_servicio ?? "").trim().toUpperCase() === "POS"
        || (row.ruta_origen ?? "").trim().toLowerCase() === "pos";
    return expected === "PENDIENTE" && isPos && (Number(row.id_estado) === 7 || actual === "SOLICITADO");
};
