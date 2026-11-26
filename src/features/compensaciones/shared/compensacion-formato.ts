/** Conserva nombres mixtos; solo normaliza los que llegaron totalmente en mayúsculas. */
export const titleCaseSiMayusculas = (valor: unknown) => {
    const text = String(valor ?? "");
    return text !== text.toLocaleUpperCase("es-PE")
        ? text
        : text.toLocaleLowerCase("es-PE").replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase("es-PE"));
};

const serviceLabels: Record<string, string> = {
    EFECTIVIZACION: "Efectivización",
    POS: "POS",
    LINKPAGO: "Link de pago",
    LINK_PAGO: "Link de pago",
    LINK_WEB: "Link web",
    PAGO_DEUDA: "Pago de deuda",
    PAGO_DE_DEUDA: "Pago de deuda",
};
/** Normaliza únicamente la etiqueta, sin modificar el servicio de Operaciones. */
export const serviceLabel = (valor: unknown) => {
    const text = String(valor ?? "").trim();
    const key = text.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return serviceLabels[key] ?? (text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text);
};

export const vencePronto = (valor: unknown, ahora = Date.now()) => {
    const left = new Date(String(valor ?? "")).getTime() - ahora;
    return left > 0 && left < 24 * 60 * 60 * 1000;
};

export const monedaCompensacion = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
export const formatoMonto = (valor: unknown) => {
    if (valor == null || (typeof valor !== "number" && typeof valor !== "string") || (typeof valor === "string" && !valor.trim())) return "—";
    const amount = Number(valor);
    return Number.isFinite(amount) ? monedaCompensacion.format(amount) : "—";
};
