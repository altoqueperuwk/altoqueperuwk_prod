import type { EvidenciaTipo } from "./evidencias.types";

export const otrosBonosPath = "/compensaciones/otros-bonos";
export const otroBonoPath = (codigo: string) => `${otrosBonosPath}/${encodeURIComponent(codigo.toLowerCase())}`;
// META_AREA conserva su flujo automático; no se registra como evidencia manual.
export const otrosBonosTypes = (types: EvidenciaTipo[]) =>
    types.filter(
        (type) =>
            (type.categoria === "OTRO" || type.codigo === "COLABORADOR_MES_CALIFICACIONES") &&
            type.codigo !== "META_AREA" &&
            type.estadoNombre.toUpperCase() === "ACTIVO",
    );

/** Sustituye el acceso autorizado por sus tipos, sin crear un grupo intermedio. */
export const expandOtrosBonosMenu = <T extends { nombre: string; ruta: string | null }>(entries: T[], types: EvidenciaTipo[]): T[] => {
    const existing = new Set(entries.map((entry) => entry.ruta));
    return entries.flatMap((entry) =>
        entry.ruta === otrosBonosPath
            ? otrosBonosTypes(types)
                  .filter((type) => !existing.has(otroBonoPath(type.codigo)))
                  .map((type) => ({ ...entry, nombre: type.nombre, ruta: otroBonoPath(type.codigo) }))
            : [entry],
    );
};
