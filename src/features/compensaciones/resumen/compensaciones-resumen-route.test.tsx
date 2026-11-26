import type { ReactNode } from "react";
import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionesResumenRoute } from "./compensaciones-resumen-route";

const mocks = vi.hoisted(() => ({ profile: { isAdministrator: false, isResolving: false }, old: vi.fn() }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));
vi.mock("../administracion/admin-dashboard-page", () => ({ AdminDashboardPage: () => <p>Gestión Global</p> }));
vi.mock("../centro-trabajo/centro-trabajo-page", () => ({ CentroTrabajoPage: () => <p>Accesos rápidos</p> }));
vi.mock("./compensaciones-resumen-page", () => ({
    CompensacionesResumenPage: () => {
        mocks.old();
        return <p>Resultados económicos</p>;
    },
}));

afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.isAdministrator = false;
    mocks.profile.isResolving = false;
});
describe("Vistas de Resumen", () => {
    it.each([
        ["?vista=centro", "Accesos rápidos"],
        ["?vista=control-pagos", "Resultados económicos"],
        ["?concepto=BONO_PUNTUALIDAD", "Resultados económicos"],
        ["", "Resultados económicos"],
    ])("selecciona la vista sin perder los filtros existentes: %s", (query, text) => {
        render(
            <MemoryRouter initialEntries={[`/compensaciones/resumen${query}`]}>
                <CompensacionesResumenRoute />
            </MemoryRouter>,
        );
        expect(screen.getByText(text)).toBeInTheDocument();
    });
    it("despacha Administración sin montar el resumen que consulta periodos globales", () => {
        mocks.profile.isAdministrator = true;
        render(
            <MemoryRouter>
                <CompensacionesResumenRoute />
            </MemoryRouter>,
        );
        expect(screen.getByText("Gestión Global")).toBeVisible();
        expect(mocks.old).not.toHaveBeenCalled();
    });
    it.each([
        ["centro", "Accesos rápidos"],
        ["control-pagos", "Gestión Global"],
    ])("conserva %s para Administración", (view, text) => {
        mocks.profile.isAdministrator = true;
        render(
            <MemoryRouter initialEntries={[`/compensaciones/resumen?vista=${view}`]}>
                <CompensacionesResumenRoute />
            </MemoryRouter>,
        );
        expect(screen.getByText(text)).toBeVisible();
        expect(mocks.old).not.toHaveBeenCalled();
    });
    it("espera la sesión antes de montar cualquier vista", () => {
        mocks.profile.isResolving = true;
        render(
            <MemoryRouter>
                <CompensacionesResumenRoute />
            </MemoryRouter>,
        );
        expect(screen.getByRole("status")).toHaveTextContent("Verificando acceso");
        expect(mocks.old).not.toHaveBeenCalled();
        expect(screen.queryByText("Gestión Global")).toBeNull();
    });
});
