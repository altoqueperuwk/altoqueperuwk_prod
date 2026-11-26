import type { ReactNode } from "react";
import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionesResumenPage } from "./compensaciones-resumen-page";

const mocks = vi.hoisted(() => ({ isPagos: false, isMarketing: false, rpc: vi.fn(), generalSummary: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({
        userId: 45,
        isStoreManager: false,
        isFacturacion: !mocks.isPagos && !mocks.isMarketing,
        isPagos: mocks.isPagos,
        isMarketing: mocks.isMarketing,
        isAdvisor: false,
        isResolving: false,
    }),
}));
vi.mock("./use-compensaciones-resumen", () => ({ useCompensacionesResumen: mocks.generalSummary }));
vi.mock("./dashboard-personal", () => ({ DashboardPersonal: () => <h1>Resultados Propios</h1> }));

beforeEach(() => {
    mocks.isPagos = false;
    mocks.isMarketing = false;
    vi.resetAllMocks();
});
afterEach(cleanup);

const open = (url: string) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );

describe("Resumen: entrada por perfil", () => {
    it.each([
        ["Marketing", () => (mocks.isMarketing = true)],
        ["Pagos", () => (mocks.isPagos = true)],
        ["Facturación", () => undefined],
    ])("%s abre resultados propios aunque llegue con una vista heredada", (_perfil, setup) => {
        setup();
        open("/compensaciones/resumen?vista=responsabilidades");
        expect(screen.getByRole("heading", { name: "Resultados Propios" })).toBeVisible();
        expect(mocks.generalSummary).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
});
