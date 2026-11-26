import { estadoVisual } from "@/features/compensaciones/shared/compensacion-estados";
import type { FacturacionRegistro, FacturacionReporte } from "./facturacion-auditoria.service";

export const money = (value: number | null) =>
    value == null ? "Por confirmar" : new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
export const tipos = [
    { id: "DETECCION_ERROR_PAGO", label: "Error de Pago" },
    { id: "OPERACION_EXTRA", label: "Operación Extra" },
];
export const errores = [
    { id: "MONTO", label: "Monto" },
    { id: "CUENTA", label: "Cuenta" },
];
/** Liquidado no es un estado de acción: el filtro Aprobado ya lo incluye. */
export const estados = [
    { id: "", label: "Todos los estados" },
    ...["PENDIENTE", "APROBADO", "RECHAZADO"].map((id) => ({ id, label: estadoVisual("registro", id).label })),
];
export const nuevo = (): FacturacionRegistro => ({
    tipo: "DETECCION_ERROR_PAGO",
    dni: "",
    codigo: "",
    evidencia: "",
    descripcion: "",
    error: "MONTO",
    operacion: null,
});
export const desdeReporte = (r: FacturacionReporte): FacturacionRegistro => ({
    id: r.id,
    tipo: r.tipo,
    dni: r.datos.cliente_documento,
    codigo: r.datos.codigo_externo ?? "",
    evidencia: r.evidencia[0]?.evidencia ?? "",
    descripcion: r.descripcion,
    error: r.datos.error,
    operacion: r.datos.operacion?.id ?? null,
});
