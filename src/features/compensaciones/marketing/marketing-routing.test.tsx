import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { OtrosBonosPage } from "../evidencias/otros-bonos-page";
import { CompensacionRouteGuard } from "../shared/compensacion-route-guard";
import { storeManagerRouteAllowed } from "../shared/jefatura-route-policy";

const mocks = vi.hoisted(() => ({ routes: [] as string[], isStoreManager: true, isMarketing: false, isAdministrator: false }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({ ...mocks, isAdvisor: false, isFacturacion: false, isPagos: false, isResolving: false, userId: 3 }),
    advisorRouteAllowed: () => true,
}));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ navegacion: { rutas_permitidas: mocks.routes }, isLoading: false }) }));
vi.mock("./marketing-capturas-page", () => ({
    MarketingCapturasPage: ({ alert, initialRecovery }: { alert?: boolean; initialRecovery?: boolean }) => (
        <h1>{alert ? "Marketing Alerta" : initialRecovery ? "Marketing Recuperación" : "Marketing Videos"}</h1>
    ),
}));

beforeEach(() => {
    mocks.routes = [];
    mocks.isStoreManager = true;
    mocks.isMarketing = false;
    mocks.isAdministrator = false;
});
afterEach(cleanup);
const open = (code: string) =>
    render(
        <MemoryRouter initialEntries={[`/compensaciones/otros-bonos/${code}`]}>
            <Routes>
                <Route
                    path="/compensaciones/otros-bonos/:codigo"
                    element={
                        <CompensacionRouteGuard>
                            <OtrosBonosPage />
                        </CompensacionRouteGuard>
                    }
                />
                <Route path="/403" element={<h1>Sin acceso</h1>} />
            </Routes>
        </MemoryRouter>,
    );

it("jefatura no tiene acceso a recuperacion_cliente aunque el servidor le conceda la ruta", () => {
    expect(storeManagerRouteAllowed("/compensaciones/otros-bonos/recuperacion_cliente")).toBe(false);
    open("recuperacion_cliente");
    expect(screen.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
});
it("jefatura ya no abre la ruta propia de Alerta Temprana: valida en Auditoría Operaciones", () => {
    mocks.routes = ["/compensaciones/otros-bonos/alerta_temprana"];
    open("alerta_temprana");
    expect(screen.queryByRole("heading", { name: "Marketing Alerta" })).toBeNull();
});
it("jefatura no accede a video_viral aunque figure en la navegación", () => {
    mocks.routes = ["/compensaciones/otros-bonos/video_viral"];
    open("video_viral");
    expect(screen.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
});
it("conserva Video Viral y Recuperación para Administración", () => {
    mocks.isStoreManager = false;
    mocks.isAdministrator = true;
    for (const [code, title] of [
        ["video_viral", "Marketing Videos"],
        ["recuperacion_cliente", "Marketing Recuperación"],
    ]) {
        mocks.routes = [`/compensaciones/otros-bonos/${code}`];
        open(code);
        expect(screen.getByRole("heading", { name: title })).toBeVisible();
        cleanup();
    }
});

it("Marketing conserva Video Viral y Recuperación", () => {
    mocks.isStoreManager = false;
    mocks.isMarketing = true;
    for (const [code, title] of [
        ["video_viral", "Marketing Videos"],
        ["recuperacion_cliente", "Marketing Recuperación"],
    ]) {
        mocks.routes = [`/compensaciones/otros-bonos/${code}`];
        open(code);
        expect(screen.getByRole("heading", { name: title })).toBeVisible();
        cleanup();
    }
});
