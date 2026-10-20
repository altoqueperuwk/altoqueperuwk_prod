// Solo RPC de pago cuyo 55P03 aborta la transacción completa.
// No ampliar a importadores o respuestas JSON de error con éxito HTTP.
const RETRYABLE_PAYMENT_RPCS = new Set([
    "f_patch_tb_operacion_proceso_pagado",
    "f_patch_tb_operacion_proceso_pagado_lote",
    "f_patch_tb_pago_deuda_pagado",
]);

const RETRY_DELAYS_MS = [750, 1500, 3000] as const;

/** Un intento inicial + hasta tres reintentos; nunca repite errores de red. */
export const rpcWithLockRetry = async <T extends { error: { code?: string } | null }>(
    fn: string,
    execute: () => PromiseLike<T>,
): Promise<T> => {
    let retry = 0;
    while (true) {
        // Las excepciones de transporte se propagan: su resultado puede ser incierto.
        const result = await execute();
        if (!RETRYABLE_PAYMENT_RPCS.has(fn) || result.error?.code !== "55P03" || retry >= RETRY_DELAYS_MS.length) {
            return result;
        }

        // Pequeña variación para que varios usuarios no reintenten al mismo tiempo.
        const delay = RETRY_DELAYS_MS[retry++] + Math.floor(Math.random() * 251);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
};
