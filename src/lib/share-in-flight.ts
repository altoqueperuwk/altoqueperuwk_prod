const pending = new Map<string, Promise<unknown>>();

/**
 * Comparte una consulta de solo lectura idéntica que aún está en curso (por ejemplo el doble montaje de
 * StrictMode o dos componentes que piden lo mismo). No guarda resultados: al terminar, la siguiente
 * llamada vuelve a consultar el servidor.
 */
export const shareInFlight = <T>(key: string, load: () => PromiseLike<T>): Promise<T> => {
    const current = pending.get(key);
    if (current) return current as Promise<T>;
    const request = Promise.resolve(load()).finally(() => {
        if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
    return request;
};
