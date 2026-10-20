/** Telemetría local de diagnóstico: no intercepta fetch ni lee cuerpos/parámetros. */
export const installDevelopmentRpcDiagnostics = (supabaseUrl: string): void => {
    if (!import.meta.env.DEV || typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return;

    let host: string;
    try {
        host = new URL(supabaseUrl).hostname;
    } catch {
        return;
    }
    // Nunca instalar este diagnóstico contra producción, aunque el frontend sea local.
    if (host !== "ouehhtlrcvcixurgonrb.supabase.co") return;

    const run = performance.timeOrigin;
    const observers: PerformanceObserver[] = [];
    const resources = new PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
            const entry = item as PerformanceResourceTiming & { responseStatus?: number };
            let url: URL;
            try { url = new URL(entry.name); } catch { continue; }
            if (url.hostname !== host || !url.pathname.startsWith("/rest/v1/rpc/")) continue;
            console.info("ATK_RPC_PERF", JSON.stringify({
                run,
                fn: url.pathname.slice("/rest/v1/rpc/".length),
                start_ms: Math.round(entry.startTime),
                duration_ms: Math.round(entry.duration),
                // Resource Timing puede ocultar estos campos si falta Timing-Allow-Origin.
                encoded_bytes: entry.encodedBodySize || null,
                decoded_bytes: entry.decodedBodySize || null,
                transfer_bytes: entry.transferSize || null,
                status: entry.responseStatus || null,
            }));
        }
    });
    resources.observe({ type: "resource", buffered: true });
    observers.push(resources);

    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        const longTasks = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                console.info("ATK_UI_LONGTASK", JSON.stringify({ run, start_ms: Math.round(entry.startTime), duration_ms: Math.round(entry.duration) }));
            }
        });
        longTasks.observe({ type: "longtask", buffered: true });
        observers.push(longTasks);
    }

    const cleanup = () => observers.forEach((observer) => observer.disconnect());
    window.addEventListener("pagehide", cleanup, { once: true });
    import.meta.hot?.dispose(() => {
        cleanup();
        window.removeEventListener("pagehide", cleanup);
    });
};
