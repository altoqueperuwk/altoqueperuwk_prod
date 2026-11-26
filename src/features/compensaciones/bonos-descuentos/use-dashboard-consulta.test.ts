import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardQueryTimeout, dashboardRefreshInterval, useDashboardConsulta } from "./use-dashboard-consulta";

const session = vi.hoisted(() => ({ id: "user-a" }));
vi.mock("@/providers/auth-provider", () => ({ useOptionalAuth: () => ({ user: session }) }));
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    session.id = "user-a";
});

it("termina una consulta colgada, descarta su respuesta tardía y permite reintentar", async () => {
    vi.useFakeTimers();
    let resolveOld!: (value: string) => void;
    const load = vi
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise<string>((resolve) => {
                    resolveOld = resolve;
                }),
        )
        .mockResolvedValue("nuevo");
    const { result, rerender } = renderHook(({ refresh }) => useDashboardConsulta(load, ["2026-10"], refresh), { initialProps: { refresh: 0 } });
    await act(async () => {
        await Promise.resolve();
    });
    await act(async () => {
        vi.advanceTimersByTime(dashboardQueryTimeout);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toContain("tardando demasiado");
    await act(async () => {
        resolveOld("viejo");
    });
    expect(result.current.data).toBeNull();
    rerender({ refresh: 1 });
    await act(async () => {
        await Promise.resolve();
    });
    expect(result.current.data).toBe("nuevo");
});

it("aísla los datos por identidad y periodo, conservándolos solo al actualizar el mismo ámbito", async () => {
    const load = vi
        .fn()
        .mockResolvedValueOnce("propio")
        .mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ month, refresh }) => useDashboardConsulta(load, [month], refresh), {
        initialProps: { month: "2026-10", refresh: 0 },
    });
    await waitFor(() => expect(result.current.data).toBe("propio"));
    rerender({ month: "2026-10", refresh: 1 });
    expect(result.current.data).toBe("propio");
    session.id = "user-b";
    rerender({ month: "2026-10", refresh: 1 });
    expect(result.current.data).toBeNull();
    rerender({ month: "2026-09", refresh: 1 });
    expect(result.current.data).toBeNull();
});

it("refresca por lectura cada 60s y al recuperar foco, y limpia recursos al desmontar", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue("worker-mensual");
    const { result, unmount } = renderHook(() => useDashboardConsulta(load, ["2026-10", "PENDIENTE"], 0));
    await act(async () => {
        await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
        vi.advanceTimersByTime(dashboardRefreshInterval - 1);
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
        vi.advanceTimersByTime(1);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe("worker-mensual");
    await act(async () => {
        window.dispatchEvent(new Event("focus"));
    });
    expect(load).toHaveBeenCalledTimes(3);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
        window.dispatchEvent(new Event("focus"));
        vi.advanceTimersByTime(dashboardRefreshInterval);
    });
    expect(load).toHaveBeenCalledTimes(3);
});
it("un refresco automático conserva el filtro vigente e ignora respuestas anteriores", async () => {
    vi.useFakeTimers();
    let oldResolve!: (value: string) => void;
    const load = vi
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise<string>((resolve) => {
                    oldResolve = resolve;
                }),
        )
        .mockResolvedValue("nuevo-filtro");
    const { result, rerender } = renderHook(({ state }) => useDashboardConsulta(load, [state], 0), { initialProps: { state: "PENDIENTE" } });
    await act(async () => {
        await Promise.resolve();
    });
    rerender({ state: "HABILITADO" });
    await act(async () => {
        await Promise.resolve();
    });
    await act(async () => {
        window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {
        oldResolve("antiguo-filtro");
    });
    expect(result.current.data).toBe("nuevo-filtro");
    expect(load).toHaveBeenCalledTimes(3);
});
