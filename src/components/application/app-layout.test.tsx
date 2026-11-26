import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { RouteProvider } from "@/providers/router-provider";
import { SessionCacheProvider, useSessionCache } from "@/providers/session-cache-provider";
import { AppLayout } from "./app-layout";
import { NavItemBase } from "./app-navigation/base-components/nav-item";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sidebarMount: vi.fn(), sidebarUnmount: vi.fn() }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => ({ businessUser: { id: 20 } }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./header", () => ({ Header: () => <header>Cabecera persistente</header> }));
vi.mock("./sidebar-navigation", () => ({
    SidebarNavigation: () => {
        useEffect(() => {
            mocks.sidebarMount();
            return () => mocks.sidebarUnmount();
        }, []);
        return (
            <aside>
                <NavItemBase type="link" href="/dos">
                    Ir a dos
                </NavItemBase>
            </aside>
        );
    },
}));
const Page = ({ name }: { name: string }) => {
    const cache = useSessionCache();
    return (
        <AppLayout>
            <h1>{name}</h1>
            <p>{cache.isLoading ? "Cargando caché" : "Caché lista"}</p>
        </AppLayout>
    );
};
afterEach(cleanup);
it("conserva layout y catálogos globales al cambiar de pantalla con el menú real", async () => {
    mocks.rpc.mockResolvedValue({ data: [] });
    render(
        <MemoryRouter initialEntries={["/uno"]}>
            <RouteProvider>
                <SessionCacheProvider>
                    <Routes>
                        <Route
                            element={
                                <AppLayout>
                                    <Outlet />
                                </AppLayout>
                            }
                        >
                            <Route path="/uno" element={<Page name="Uno" />} />
                            <Route path="/dos" element={<Page name="Dos" />} />
                        </Route>
                    </Routes>
                </SessionCacheProvider>
            </RouteProvider>
        </MemoryRouter>,
    );
    await screen.findByText("Caché lista");
    const before = mocks.rpc.mock.calls.length;
    expect(before).toBe(7); // Navegación y seis catálogos de sesión.
    const sidebar = screen.getByRole("complementary");
    fireEvent.click(screen.getByRole("link", { name: "Ir a dos" }));
    await screen.findByRole("heading", { name: "Dos" });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(before));
    expect(screen.getByRole("complementary")).toBe(sidebar);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(mocks.sidebarMount).toHaveBeenCalledTimes(1);
    expect(mocks.sidebarUnmount).not.toHaveBeenCalled();
});
