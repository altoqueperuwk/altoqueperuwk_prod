export const configurationSections = {
    pagos: "Generales",
    bonos: "Auditoría Operaciones",
    cargos: "Valores por cargo",
    penalidades: "Penalidades",
} as const;

export type ConfigurationSection = keyof typeof configurationSections;
