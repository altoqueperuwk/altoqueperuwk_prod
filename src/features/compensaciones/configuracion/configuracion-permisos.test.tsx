import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ConfiguracionPermisos } from "./configuracion-permisos";

afterEach(cleanup);
it("dirige a Sistema y no ofrece asignación duplicada de permisos", () => {
    render(
        <MemoryRouter>
            <ConfiguracionPermisos />
        </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Permisos de usuarios" }).getAttribute("href")).toBe("/sistema/permiso-usuario");
    expect(screen.queryByRole("button", { name: "Asignar permiso" })).toBeNull();
});
