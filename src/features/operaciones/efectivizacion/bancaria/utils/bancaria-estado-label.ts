import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

export const getBancariaEstadoLabel = (row: Pick<OperacionProceso, "id_estado" | "nombre_estado">) => {
    const estado = (row.nombre_estado ?? "").trim().toUpperCase();
    if (Number(row.id_estado) === 10 || estado === "ELIMINADO") return "Eliminado";
    return estado === "PAGADO" ? "Pagado" : "Pendiente";
};
