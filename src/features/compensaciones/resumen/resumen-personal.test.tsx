import { cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { CompensacionPeriodo } from "./compensaciones-resumen.types";
import { ResumenPersonal } from "./resumen-personal";

const perfil = vi.hoisted(() => ({ isFacturacion: false }));
const rutas = vi.hoisted(() => ({ lista: ["/compensaciones/colaboradores", "/compensaciones/mis-bonos-descuentos"] }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ navegacion: { rutas_permitidas: rutas.lista } }) }));
vi.mock("@/features/compensaciones/shared/compensacion-perfil", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useCompensacionPerfil: () => ({ isFacturacion: perfil.isFacturacion }),
}));
afterEach(() => {
    cleanup();
    perfil.isFacturacion = false;
    rutas.lista = ["/compensaciones/colaboradores", "/compensaciones/mis-bonos-descuentos"];
});
it("no reutiliza importes ni pendientes globales y solo enlaza rutas concedidas", () => {
    const periodo = {
        nombre: "Octubre 2026",
        estadoPeriodo: "ABIERTO",
        eventosPendientes: 777,
    } as CompensacionPeriodo;
    render(
        <MemoryRouter>
            <ResumenPersonal periodo={periodo} />
        </MemoryRouter>,
    );
    expect(screen.getByText("Octubre 2026")).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Mis Bonos y Penalidades/ })).toHaveAttribute("href", "/compensaciones/mis-bonos-descuentos");
    expect(screen.queryByRole("link", { name: /Mis calificaciones/ })).toBeNull();
    expect(screen.queryByText(/999999|888888|777|Pendientes operativos/)).toBeNull();
});
it("sin período mantiene navegación personal sin simular importes", () => {
    render(
        <MemoryRouter>
            <ResumenPersonal periodo={null} />
        </MemoryRouter>,
    );
    expect(screen.getByText(/Aún no tienes un período/)).toBeVisible();
    expect(screen.queryByRole("link", { name: /Mi sueldo/ })).toBeNull();
    expect(screen.queryByText(/S\//)).toBeNull();
});
it("ordena seguimiento, consulta de período y accesos personales", () => {
    render(
        <MemoryRouter>
            <ResumenPersonal periodo={null} toolbar={<button>Consultar mes</button>} />
        </MemoryRouter>,
    );
    const tracking = screen.getByRole("heading", { name: "Mi seguimiento mensual" });
    const controls = screen.getByRole("region", { name: "Consultar período" });
    const shortcuts = screen.getByRole("navigation", { name: "Mis opciones de compensaciones" });
    expect(tracking).toHaveClass("text-xs", "font-medium");
    expect(tracking.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(controls.compareDocumentPosition(shortcuts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Consultar mes" })).toBeVisible();
});
it("Facturación no recibe Mi ficha ni tarjetas de rutas retiradas aunque el servidor las conceda", () => {
    perfil.isFacturacion = true;
    rutas.lista = ["/compensaciones/colaboradores", "/compensaciones/mis-bonos-descuentos", "/compensaciones/evidencias", "/compensaciones/calificaciones"];
    render(
        <MemoryRouter>
            <ResumenPersonal periodo={null} />
        </MemoryRouter>,
    );
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryByRole("link", { name: /Mi ficha|Mis Bonos y Penalidades|Evidencias/ })).toBeNull();
});
