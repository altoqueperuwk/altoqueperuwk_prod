import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IndisciplinaColaboradorPage } from "./indisciplina-colaborador-page";

const state = vi.hoisted(() => ({ isStoreManager: false, isFacturacion: false }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => state }));
vi.mock("../incidencias/incidencias-page", () => ({
    IncidenciasPage: (props: { readOnly?: boolean; conceptFilter?: boolean; title?: string }) => (
        <p>
            Consulta {props.title} solo lectura={String(props.readOnly)} concepto={String(props.conceptFilter)}
        </p>
    ),
}));
vi.mock("../incidencias/incidencias-equipo-page", () => ({ IncidenciasEquipoPage: ({ grupo }: { grupo: string }) => <p>Equipo {grupo}</p> }));

beforeEach(() => {
    state.isStoreManager = false;
    state.isFacturacion = false;
});
afterEach(cleanup);

it("Facturación consulta Uniforme e Indisciplina en solo lectura con filtro de concepto en la tabla", () => {
    state.isFacturacion = true;
    render(<IndisciplinaColaboradorPage />);
    expect(screen.getByText("Consulta Indisciplina Colaborador solo lectura=true concepto=true")).toBeVisible();
});

it("el Jefe de Sede conserva el registro de su equipo", () => {
    state.isStoreManager = true;
    render(<IndisciplinaColaboradorPage />);
    expect(screen.getByText("Equipo PERSONAL")).toBeVisible();
});

it("Pagos consulta Indisciplina en solo lectura con su descargo", () => {
    state.isStoreManager = false;
    render(<IndisciplinaColaboradorPage />);
    expect(screen.getByText("Consulta Indisciplina Colaborador solo lectura=true concepto=true")).toBeVisible();
});
