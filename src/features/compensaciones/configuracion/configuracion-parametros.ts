export interface CambioParametro {
    tipo: "REGLA" | "PENALIDAD";
    id: number;
    anterior: string;
    valor: string;
}

export const prepararCambiosParametros = (values: Record<string, string>, initial: Record<string, string>): CambioParametro[] => {
    const tipos: Record<string, CambioParametro["tipo"]> = {
        rule: "REGLA",
        penalty: "PENALIDAD",
    };
    return Object.entries(values).flatMap(([key, value]) => {
        if (value === initial[key]) return [];
        const [category, rawId] = key.split("-");
        const tipo = tipos[category];
        const id = Number(rawId);
        if (!tipo || !Number.isSafeInteger(id) || id <= 0 || initial[key] === undefined) {
            throw new Error("Actualiza la configuración antes de guardar.");
        }
        if (!value.trim()) throw new Error("Completa los campos modificados.");
        if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error("Usa valores numéricos no negativos.");
        return [{ tipo, id, anterior: initial[key], valor: value }];
    });
};
