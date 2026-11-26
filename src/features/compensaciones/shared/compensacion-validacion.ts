/** Una sola oración, sin listas ni pérdida de problemas detectados por el formulario. */
export const oracionValidacion = (problemas: readonly string[]) => {
    const parts = problemas
        .map((value) => value.trim().replace(/[.;]+$/, ""))
        .filter(Boolean)
        .map((value, index) => (index > 0 && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(value) ? value[0].toLocaleLowerCase("es-PE") + value.slice(1) : value));
    if (!parts.length) return "";
    const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
    return `${text[0].toLocaleUpperCase("es-PE")}${text.slice(1)}.`;
};

/** La longitud la decide el campo existente (DNI, CE o celular), no este helper. */
export const soloDigitos = (value: string, maxLength: number) => value.replace(/\D/g, "").slice(0, maxLength);
