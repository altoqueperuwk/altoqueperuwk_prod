import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCacheProvider, useSessionCache } from "./session-cache-provider";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), actor: { businessUser: { id: "test-a" } as { id: string } | null } }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./auth-provider", () => ({ useAuth: () => mocks.actor }));

const pending = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
};
const navigation = (route: string) => ({ data: { menus: [], rutas_permitidas: [route], usuario: null, nombres_permitidos: [] }, error: null });
const Probe = () => {
    const cache = useSessionCache();
    return <>
        <output data-testid="loading">{String(cache.isLoading)}</output>
        <output data-testid="routes">{JSON.stringify(cache.navegacion?.rutas_permitidas ?? [])}</output>
        <output data-testid="catalog">{JSON.stringify(cache.comunidades)}</output>
        <output data-testid="error">{cache.navigationError}</output>
        <button onClick={cache.reloadNavigation}>Reintentar</button>
    </>;
};
const View = () => <SessionCacheProvider><Probe /></SessionCacheProvider>;
let identity = 0;
beforeEach(() => { mocks.rpc.mockReset(); mocks.actor.businessUser = { id: `test-${++identity}` }; });
afterEach(cleanup);

describe("Autorización independiente de catálogos de sesión", () => {
    it("habilita solo la navegación respondida sin esperar catálogos lentos", async () => {
        mocks.rpc.mockImplementation((name: string) => name === "f_get_tb_navegacion_x_usuario"
            ? Promise.resolve(navigation("/compensaciones/resumen")) : new Promise(() => {}));
        render(<View />);
        await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
        expect(screen.getByTestId("routes")).toHaveTextContent("/compensaciones/resumen");
        expect(screen.getByTestId("catalog")).toHaveTextContent("null");
    });

    it("un error de navegación no concede rutas a partir de catálogos válidos", async () => {
        mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === "f_get_tb_navegacion_x_usuario"
            ? { data: null, error: { message: "Sin autorización" } } : { data: [], error: null }));
        render(<View />);
        await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
        expect(screen.getByTestId("routes")).toHaveTextContent("[]");
        expect(screen.getByTestId("error")).toHaveTextContent("permisos");
        mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === "f_get_tb_navegacion_x_usuario"
            ? navigation("/compensaciones/resumen") : { data: [], error: null }));
        fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
        await waitFor(() => expect(screen.getByTestId("routes")).toHaveTextContent("/compensaciones/resumen"));
        expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    });

    it("no aplica navegación ni catálogo atrasado de otra identidad", async () => {
        const firstId = mocks.actor.businessUser!.id;
        const oldNavigation = pending<ReturnType<typeof navigation>>();
        const oldCatalog = pending<{ data: { nombre: string }[]; error: null }>();
        mocks.rpc.mockImplementation((name: string, params?: { p_id_usuario: string }) => {
            if (name === "f_get_tb_navegacion_x_usuario") return params?.p_id_usuario === firstId
                ? oldNavigation.promise : Promise.resolve(navigation("/compensaciones/llamadas"));
            return mocks.actor.businessUser?.id === firstId ? oldCatalog.promise : Promise.resolve({ data: [{ nombre: "Actual" }], error: null });
        });
        const view = render(<View />);
        mocks.actor.businessUser = { id: `${firstId}-next` };
        view.rerender(<View />);
        await waitFor(() => expect(screen.getByTestId("routes")).toHaveTextContent("/compensaciones/llamadas"));
        await waitFor(() => expect(screen.getByTestId("catalog")).toHaveTextContent("Actual"));
        await act(async () => {
            oldNavigation.resolve(navigation("/compensaciones/liquidaciones"));
            oldCatalog.resolve({ data: [{ nombre: "Anterior" }], error: null });
        });
        expect(screen.getByTestId("routes")).not.toHaveTextContent("liquidaciones");
        expect(screen.getByTestId("catalog")).not.toHaveTextContent("Anterior");
    });
});
