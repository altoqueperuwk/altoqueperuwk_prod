import type { EvidenciaEvento } from "./evidencias.types";

const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const leerTarifaRegistro = (value: unknown): EvidenciaEvento["tarifaRegistro"] => {
    const snapshot = record(value);
    if (snapshot.politica_tarifa !== "REGISTRO_V1") return null;
    const regla = record(snapshot.regla_registro);
    const tipoCalculo = String(regla.tipo_calculo ?? "");
    if (!["FIJO", "POR_UNIDAD", "POR_MINUTO", "POR_HORA", "POR_DIA", "PORCENTAJE"].includes(tipoCalculo)) return null;
    const raw = tipoCalculo === "PORCENTAJE" ? regla.porcentaje : regla.monto;
    if (raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw))) return null;
    return { tipoCalculo, valor: Number(raw) };
};

export const camposTarifa = (tipo?: string) => ({
    base: !tipo || tipo === "PORCENTAJE",
    cantidad: !tipo || ["POR_UNIDAD", "POR_MINUTO", "POR_HORA", "POR_DIA"].includes(tipo),
    etiquetaCantidad: ({ POR_MINUTO: "Minutos", POR_HORA: "Horas", POR_DIA: "Días" } as Record<string, string>)[tipo ?? ""] ?? "Cantidad",
});

export const textoTarifa = (tarifa: NonNullable<EvidenciaEvento["tarifaRegistro"]>) => {
    if (tarifa.tipoCalculo === "PORCENTAJE") return `${tarifa.valor.toLocaleString("es-PE")}%`;
    const monto = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(tarifa.valor);
    const unidad = ({ POR_UNIDAD: "unidad", POR_MINUTO: "minuto", POR_HORA: "hora", POR_DIA: "día" } as Record<string, string>)[tarifa.tipoCalculo];
    return unidad ? `${monto} por ${unidad}` : monto;
};
