import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ReportesPage } from "./reportes-page";
import type { ReportePayload } from "./reportes.types";

const mocks = vi.hoisted(() => ({
    getPeriods: vi.fn(),
    getReport: vi.fn(),
    getExports: vi.fn(),
    registerExport: vi.fn(),
    buildReporteFile: vi.fn(),
    downloadBlob: vi.fn(),
}));
vi.mock("../shared/periodos.service", () => ({ periodosService: { getPeriods: mocks.getPeriods } }));
vi.mock("./reportes.service", () => ({ reportesService: mocks }));
vi.mock("./reportes-export", () => ({ buildReporteFile: mocks.buildReporteFile, downloadBlob: mocks.downloadBlob }));
vi.mock("@/services/sucursal.service", () => ({ sucursalService: { getList: async () => [{ id: 3, nombre: "Lince" }] } }));

vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/base/buttons/button", () => ({
    Button: ({ children, onClick, isDisabled }: { children: ReactNode; onClick?: () => void; isDisabled?: boolean }) => (
        <button disabled={isDisabled} onClick={onClick}>
            {children}
        </button>
    ),
}));
vi.mock("@/components/base/select/select", () => ({
    Select: ({
        label,
        items,
        selectedKey,
        onSelectionChange,
        isDisabled,
    }: {
        label: string;
        items: Array<{ id: number | string; label: string }>;
        selectedKey: number | string;
        onSelectionChange: (key: string) => void;
        isDisabled?: boolean;
    }) => (
        <select aria-label={label} disabled={isDisabled} value={selectedKey ?? ""} onChange={(event) => onSelectionChange(event.target.value)}>
            {items.map((item) => (
                <option key={item.id} value={item.id}>
                    {item.label}
                </option>
            ))}
        </select>
    ),
}));
vi.mock("@/components/shared/data-table", () => ({
    DataTable: ({ data, onPageChange }: { data: unknown; onPageChange: (page: number) => void }) => (
        <div>
            <pre>{JSON.stringify(data)}</pre>
            <button onClick={() => onPageChange(2)}>Siguiente</button>
        </div>
    ),
}));

const payload = (): ReportePayload => ({
    periodo: "2026-09",
    items: [{ id_colaborador: 1, colaborador_nombre: "Persona vigente", total_bonos: 70, total_comisiones: 30, total_descuentos: 20, total_pagar: 80 }],
    resumen: { total_colaboradores: 1, total_bonos: 70, total_comisiones: 30, total_ingresos: 100, total_descuentos: 20, total_pagar: 80 },
});
describe("Reportes de Bonos y Penalidades", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPeriods.mockResolvedValue([
            { id: 1, nombre: "Septiembre", periodo: "2026-09", estado: "ABIERTO" },
            { id: 2, nombre: "Octubre", periodo: "2026-10", estado: "ABIERTO" },
        ]);
        mocks.getReport.mockImplementation(async () => payload());
        mocks.getExports.mockResolvedValue([]);
        mocks.buildReporteFile.mockResolvedValue({ blob: new Blob(), fileName: "reporte.pdf", hash: "abc" });
        mocks.registerExport.mockResolvedValue({});
    });
    afterEach(cleanup);
    it("muestra solo Bonos, Penalidades y Neto, sin tipo de reporte ni productividad", async () => {
        render(<ReportesPage />);
        await screen.findByText(/Persona vigente/);
        // Las "comisiones" del servidor se suman a Bonos.
        expect(screen.getByText(/100\.00/)).toBeTruthy();
        expect(screen.getByText("Penalidades")).toBeTruthy();
        expect(screen.getByText("Neto")).toBeTruthy();
        expect(screen.queryByLabelText("Tipo de reporte")).toBeNull();
        expect(screen.queryByText(/Comisi|Productividad|Efectiviza|Clientes nuevos/)).toBeNull();
        expect(mocks.getReport).toHaveBeenCalledWith(1, 0);
        expect(mocks.registerExport).not.toHaveBeenCalled();
    });
    it("sin meses no consulta ni habilita descargar", async () => {
        mocks.getPeriods.mockResolvedValue([]);
        render(<ReportesPage />);
        await waitFor(() => expect(mocks.getPeriods).toHaveBeenCalled());
        expect(mocks.getReport).not.toHaveBeenCalled();
        expect((screen.getByRole("button", { name: "Descargar PDF" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("ignora la respuesta anterior al cambiar mes", async () => {
        let resolveOld!: (value: ReportePayload) => void;
        mocks.getReport.mockImplementation((id: number) =>
            id === 1
                ? new Promise((resolve) => {
                      resolveOld = resolve;
                  })
                : Promise.resolve(payload()),
        );
        render(<ReportesPage />);
        await waitFor(() => expect(mocks.getReport).toHaveBeenCalledWith(1, 0));
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2" } });
        await screen.findByText(/Persona vigente/);
        const old = payload();
        old.items = [{ colaborador_nombre: "Persona obsoleta" }];
        await act(async () => {
            resolveOld(old);
        });
        expect(screen.queryByText(/Persona obsoleta/)).toBeNull();
    });
    it("exporta lo mismo que se ve y registra los filtros seleccionados", async () => {
        render(<ReportesPage />);
        await screen.findByText(/Persona vigente/);
        fireEvent.click(screen.getByRole("button", { name: "Descargar PDF" }));
        await waitFor(() => expect(mocks.downloadBlob).toHaveBeenCalled());
        const [, , , columns, rows] = mocks.buildReporteFile.mock.calls[0];
        expect(columns.map((column: { label: string }) => column.label)).toEqual(["Colaborador", "DNI", "Sede", "Bonos", "Penalidades", "Neto"]);
        expect(rows[0]).toMatchObject({ total_bonos: 100, total_descuentos: 20, total_pagar: 80 });
        expect(mocks.registerExport).toHaveBeenCalledWith(
            expect.objectContaining({ periodId: 1, branchId: 0, format: "PDF", type: "GENERAL_FINANCIERO", totalRows: 1, totalReported: 80 }),
        );
    });
    it("paginar no cambia los registros incluidos en la exportación", async () => {
        mocks.getReport.mockImplementation(async () => ({
            ...payload(),
            items: Array.from({ length: 25 }, (_, index) => ({ id_colaborador: index + 1, colaborador_nombre: `Fila ${index + 1}` })),
        }));
        render(<ReportesPage />);
        await screen.findByText(/Fila 20/);
        expect(screen.queryByText(/Fila 25/)).toBeNull();
        fireEvent.click(screen.getAllByRole("button", { name: "Siguiente" })[0]);
        await screen.findByText(/Fila 25/);
        fireEvent.click(screen.getByRole("button", { name: "Descargar PDF" }));
        await waitFor(() => expect(mocks.registerExport).toHaveBeenCalledWith(expect.objectContaining({ totalRows: 25 })));
    });
});
