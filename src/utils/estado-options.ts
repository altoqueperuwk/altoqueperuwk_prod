type EstadoLike = Record<string, unknown>;

const CORE_ESTADO_IDS = new Set([1, 2]);

export const getCoreEstadoItems = (estados: EstadoLike[] | null | undefined) =>
    (estados ?? [])
        .filter((estado) => CORE_ESTADO_IDS.has(Number(estado.id)))
        .map((estado) => ({
            id: estado.id as string | number,
            label: estado.nombre as string,
        }));

