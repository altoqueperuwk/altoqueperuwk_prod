import type { ReactNode } from "react";
import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { EvidenciaTipo } from "./evidencias.types";
import { otroBonoPath, otrosBonosTypes } from "./otros-bonos-navigation";
import { OtrosBonosPage } from "./otros-bonos-page";

const mocks = vi.hoisted(() => ({ getTypes: vi.fn() }));
vi.mock("./evidencias.service", () => ({ evidenciasService: mocks }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./evidencias-page", () => ({
    EvidenciasPage: ({ fixedType }: { fixedType: EvidenciaTipo }) => (
        <h1>
            {fixedType.nombre}:{fixedType.id}
        </h1>
    ),
}));
const type = { id: 10, codigo: "BONO_PUNTUALIDAD", nombre: "Puntualidad", categoria: "OTRO", estadoNombre: "ACTIVO" } as EvidenciaTipo;
const open = (url: string) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path="/compensaciones/otros-bonos/:codigo?" element={<OtrosBonosPage />} />
            </Routes>
        </MemoryRouter>,
    );
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});
describe("Otros bonos por tipo", () => {
    it("excluye tipos inactivos, otras categorías y meta automática", () => {
        expect(otrosBonosTypes([type, { ...type, categoria: "LLAMADA" }, { ...type, codigo: "META_AREA" }, { ...type, estadoNombre: "INACTIVO" }])).toEqual([
            type,
        ]);
    });
    it("muestra accesos individuales en lugar de un formulario combinado", async () => {
        mocks.getTypes.mockResolvedValue([type]);
        open("/compensaciones/otros-bonos");
        expect(await screen.findByRole("link", { name: /Puntualidad/ })).toHaveAttribute("href", otroBonoPath(type.codigo));
    });
    it("abrir directamente una URL muestra la pantalla del tipo", async () => {
        mocks.getTypes.mockResolvedValue([type]);
        open(otroBonoPath(type.codigo));
        expect(await screen.findByRole("heading", { name: "Puntualidad:10" })).toBeVisible();
        expect(mocks.getTypes).toHaveBeenCalledTimes(1);
    });
    it("un código desconocido no abre la bandeja general", async () => {
        mocks.getTypes.mockResolvedValue([type]);
        open("/compensaciones/otros-bonos/desconocido");
        expect(await screen.findByText(/Este tipo de bono no está disponible/)).toHaveTextContent("no está disponible");
    });
    it("muestra un error si falla el catálogo", async () => {
        mocks.getTypes.mockRejectedValue(new Error("fallo"));
        open("/compensaciones/otros-bonos");
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No fue posible cargar");
    });
});
