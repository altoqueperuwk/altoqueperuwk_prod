import { cleanup, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { FacturacionAuditoriaRoute } from "../evidencias/facturacion-auditoria-route";
import { AdminAuditoriaNavigation } from "./admin-auditoria-navigation";

const profile = vi.hoisted(() => ({ isAdministrator: true, isFacturacion: false, isPagos: false, isResolving: false }));
vi.mock("./compensacion-perfil", () => ({ useCompensacionPerfil: () => profile }));
vi.mock("../evidencias/facturacion-auditoria-page", () => ({
    FacturacionAuditoriaPage: () => (
        <>
            <h1>Reportes de Facturación</h1>
            <AdminAuditoriaNavigation />
        </>
    ),
}));
vi.mock("../evidencias/pagos-detecciones-page", () => ({
    PagosDeteccionesPage: () => (
        <>
            <h1>Hallazgos del Gestor</h1>
            <AdminAuditoriaNavigation />
        </>
    ),
}));
vi.mock("../incidencias/incidencias-page", () => ({
    IncidenciasPage: () => (
        <>
            <h1>Reportes del Equipo</h1>
            <AdminAuditoriaNavigation />
        </>
    ),
}));

const Location = () => <output data-testid="url">{useLocation().search}</output>;
beforeEach(() => {
    profile.isAdministrator = true;
    profile.isPagos = false;
    profile.isFacturacion = false;
});
afterEach(cleanup);
it("Administracion accede a las tres bandejas existentes conservando la ruta y los parametros", () => {
    render(
        <MemoryRouter initialEntries={["/compensaciones/auditoria-activa?referencia=centro"]}>
            <FacturacionAuditoriaRoute />
            <Location />
        </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Reportes de Facturación" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hallazgos de Pagos" }));
    expect(screen.getByRole("heading", { name: "Hallazgos del Gestor" })).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("referencia=centro&vista=pagos");
    fireEvent.click(screen.getByRole("button", { name: "Reportes del Equipo" }));
    expect(screen.getByRole("heading", { name: "Reportes del Equipo" })).toBeInTheDocument();
});
it("la navegacion no aparece fuera de Auditoria", () => {
    render(
        <MemoryRouter initialEntries={["/compensaciones/incidencias"]}>
            <AdminAuditoriaNavigation />
        </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
});
