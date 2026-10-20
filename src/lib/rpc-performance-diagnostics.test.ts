import { afterEach, describe, expect, it, vi } from "vitest";
import { installDevelopmentRpcDiagnostics } from "./rpc-performance-diagnostics";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const prepare = (hostname = "127.0.0.1") => {
    const callbacks: Array<(list: { getEntries: () => unknown[] }) => void> = [];
    const disconnect = vi.fn();
    const observe = vi.fn();
    class Observer {
        static supportedEntryTypes = ["resource", "longtask"];
        constructor(callback: (list: { getEntries: () => unknown[] }) => void) { callbacks.push(callback); }
        observe = observe;
        disconnect = disconnect;
    }
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { location: { hostname }, addEventListener, removeEventListener: vi.fn() });
    vi.stubGlobal("PerformanceObserver", Observer);
    return { callbacks, observe, disconnect, addEventListener };
};

describe("Diagnóstico RPC limitado a desarrollo local", () => {
    it("no se instala contra producción", () => {
        const mock = prepare();
        installDevelopmentRpcDiagnostics("https://hyckmismfektoypudzar.supabase.co");
        expect(mock.observe).not.toHaveBeenCalled();
    });

    it("no se instala fuera de localhost", () => {
        const mock = prepare("altoqueperuwk-prod.pages.dev");
        installDevelopmentRpcDiagnostics("https://ouehhtlrcvcixurgonrb.supabase.co");
        expect(mock.observe).not.toHaveBeenCalled();
    });

    it("registra solo función y tiempos, sin URL completa o parámetros", () => {
        const mock = prepare();
        const log = vi.spyOn(console, "info").mockImplementation(() => {});
        installDevelopmentRpcDiagnostics("https://ouehhtlrcvcixurgonrb.supabase.co");
        mock.callbacks[0]({ getEntries: () => [{ name: "https://ouehhtlrcvcixurgonrb.supabase.co/rest/v1/rpc/f_get_example?secret=never-log", startTime: 5.3, duration: 123.7, responseStatus: 200 }] });
        expect(log).toHaveBeenCalledTimes(1);
        expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({ fn: "f_get_example", duration_ms: 124, encoded_bytes: null });
        expect(JSON.stringify(log.mock.calls)).not.toContain("never-log");
        expect(JSON.stringify(log.mock.calls)).not.toContain("supabase.co");
    });

    it("ignora catálogos REST que no sean RPC y desconecta al salir", () => {
        const mock = prepare();
        const log = vi.spyOn(console, "info").mockImplementation(() => {});
        installDevelopmentRpcDiagnostics("https://ouehhtlrcvcixurgonrb.supabase.co");
        mock.callbacks[0]({ getEntries: () => [{ name: "https://ouehhtlrcvcixurgonrb.supabase.co/rest/v1/tb_cliente", startTime: 1, duration: 2 }] });
        expect(log).not.toHaveBeenCalled();
        mock.addEventListener.mock.calls[0][1]();
        expect(mock.disconnect).toHaveBeenCalledTimes(2);
    });
});
