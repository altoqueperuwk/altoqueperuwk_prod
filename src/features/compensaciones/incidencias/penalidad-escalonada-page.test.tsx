import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PenalidadEscalonadaBonosPage } from "./penalidad-escalonada-page";

const state = vi.hoisted(() => ({ isPagos: false, isAdministrator: false }));
vi.mock("../evidencias/admin-operaciones-page", () => ({ AdminOperacionesPage: ({ grupo }: { grupo: string }) => <p>Administración {grupo}</p> }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => state }));
vi.mock("./incidencias-page", () => ({
    IncidenciasPage: (props: { readOnly?: boolean; fixedList?: string; title?: string }) => (
        <p>
            Consulta {props.title} solo lectura={String(props.readOnly)} lista={props.fixedList}
        </p>
    ),
}));
vi.mock("./incidencias-equipo-page", () => ({ IncidenciasEquipoPage: ({ grupo }: { grupo: string }) => <p>Equipo {grupo}</p> }));

beforeEach(() => {
    state.isPagos = false;
    state.isAdministrator = false;
});
afterEach(cleanup);

it("Pagos consulta sus penalidades escalonadas en solo lectura", () => {
    state.isPagos = true;
    render(<PenalidadEscalonadaBonosPage />);
    expect(screen.getByText("Consulta Penalidad Escalonada Bonos solo lectura=true lista=ESCALONADA")).toBeVisible();
});

it("el Jefe de Sede conserva la vista de su sede", () => {
    render(<PenalidadEscalonadaBonosPage />);
    expect(screen.getByText("Equipo ESCALONADA")).toBeVisible();
});

it("Administración registra y resuelve desde el listado de errores en cuadro", () => {
    state.isAdministrator = true;
    render(<PenalidadEscalonadaBonosPage />);
    expect(screen.getByText("Administración ESCALONADA")).toBeVisible();
});
