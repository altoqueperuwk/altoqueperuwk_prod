import type { ReactNode } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionesResumenPage } from "./compensaciones-resumen-page";
import type { CompensacionPeriodo } from "./compensaciones-resumen.types";

const state = vi.hoisted(() => ({ periodos: [] as CompensacionPeriodo[] }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({ isAdvisor: false, isStoreManager: false, isFacturacion: false, isPagos: false, isMarketing: false, isResolving: false }),
}));
vi.mock("./use-compensaciones-resumen", () => ({
    useCompensacionesResumen: () => ({ periodos: state.periodos, isLoading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));

const periodo = (id: number, nombre: string, total: number): CompensacionPeriodo => ({
    id,
    periodo: "2026-10-01",
    nombre,
    fechaInicio: "2026-10-01",
    fechaFin: "2026-10-31",
    zonaHoraria: "America/Lima",
    estadoPeriodo: "CERRADO",
    numeroCalculo: id,
    fechaApertura: null,
    fechaAprobacion: null,
    fechaCierre: null,
    tieneCierreVigente: true,
    eventosPendientes: 0,
});

beforeEach(() => {
    state.periodos = [periodo(2, "Noviembre 2026", 300), periodo(1, "Octubre 2026", 200)];
});
afterEach(cleanup);

describe("Resumen global", () => {
    it("conserva todos los datos del histórico al usar DataTable y permite seleccionar un período", () => {
        render(<CompensacionesResumenPage />);

        expect(screen.getByRole("heading", { name: "Períodos recientes" })).toBeVisible();
        expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
            "Periodo",
            "Estado",
            "Cálculo",
            "Eventos por revisar",
            "Reporte",
        ]);
        expect(screen.getByRole("row", { name: /Noviembre 2026/ })).toHaveTextContent("v2");
        expect(screen.getByRole("row", { name: /Noviembre 2026/ })).toHaveTextContent("Confirmado");
        fireEvent.click(screen.getByRole("button", { name: "Octubre 2026" }));
        expect(screen.getAllByText("Octubre 2026").length).toBeGreaterThan(0);
    });
});
