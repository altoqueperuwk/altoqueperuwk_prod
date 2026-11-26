import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./home-page";

const state = vi.hoisted(() => ({ role: 4, loading: false, routes: ["/compensaciones/resumen"] }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => ({ user: null, businessUser: { id: "test", id_rol: state.role } }) }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ isLoading: state.loading, navegacion: { rutas_permitidas: state.routes } }) }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
afterEach(() => { cleanup(); state.role = 4; state.loading = false; state.routes = ["/compensaciones/resumen"]; });
const open = () => render(<MemoryRouter initialEntries={["/"]}><Routes><Route path="/" element={<HomePage />} /><Route path="/compensaciones/resumen" element={<p>Dashboard propio</p>} /></Routes></MemoryRouter>);
describe("Inicio ATC", () => {
    it("abre el Dashboard propio solo cuando el permiso canónico ya fue recibido", () => {
        open(); expect(screen.getByText("Dashboard propio")).toBeInTheDocument();
    });
    it.each(["loading", "unassigned", "administrator"])("conserva inicio para %s", (mode) => {
        if (mode === "loading") state.loading = true;
        if (mode === "unassigned") state.routes = [];
        if (mode === "administrator") state.role = 1;
        open(); expect(screen.queryByText("Dashboard propio")).toBeNull();
    });
});
