/**
 * Vocabulario único de Compensaciones: solo existen Bono (+) y Penalidad (−), según el PDF.
 * «Comisión» es el nombre de un concepto de bono y «Descuento» es el efecto en dinero de una penalidad.
 * Las claves del servidor (BONO, COMISION, DESCUENTO, «Comisión», «Penalidad») no cambian: solo se traducen al mostrarlas.
 */
export type CompensacionTipo = "BONO" | "PENALIDAD";

export const compensacionTipoOptions: { id: CompensacionTipo; label: string }[] = [
    { id: "BONO", label: "Bono" },
    { id: "PENALIDAD", label: "Penalidad" },
];

const normalize = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toUpperCase();

/** BONO / COMISION / «Comisión» / «Bono» → BONO; DESCUENTO / PENALIDAD / «Penalidad» → PENALIDAD. */
export const compensacionTipo = (value: unknown): CompensacionTipo => {
    const key = normalize(value);
    return key.startsWith("DESCUENTO") || key.startsWith("PENALIDAD") ? "PENALIDAD" : "BONO";
};

export const compensacionTipoLabel = (value: unknown) => (compensacionTipo(value) === "PENALIDAD" ? "Penalidad" : "Bono");

/** Clave del servidor que corresponde al filtro; Bono abarca BONO y COMISION, por eso no se envía (se filtra al mostrar). */
export const compensacionTipoServidor = (tipo: CompensacionTipo | ""): "" | "DESCUENTO" => (tipo === "PENALIDAD" ? "DESCUENTO" : "");
