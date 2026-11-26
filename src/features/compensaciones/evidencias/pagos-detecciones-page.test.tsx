import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { PagosDeteccionesPage } from "./pagos-detecciones-page";

const mocks = vi.hoisted(() => ({ operations: vi.fn(), save: vi.fn(), types: vi.fn(), list: vi.fn(), profile: { userId: 11, isResolving: false } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <input aria-label="Periodo" value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ catalogos: { estados: [] } }) }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));
vi.mock("./pagos-detecciones.service", () => ({ pagosDeteccionesService: { operaciones: mocks.operations, guardar: mocks.save } }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { getTypes: mocks.types, getList: mocks.list } }));
vi.mock("./evidencia-detail-modal", () => ({ EvidenciaDetailModal: () => null }));

const result = {
    items: [],
    total: 0,
    totalPages: 1,
    page: 1,
    pageSize: 20,
    resumen: { borradores: 0, pendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 },
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.userId = 11;
    mocks.profile.isResolving = false;
    mocks.types.mockResolvedValue([
        { id: 15, codigo: "DETECCION_ERROR_MANUAL" },
        { id: 16, codigo: "REPORTE_ABANDONO" },
    ]);
    mocks.list.mockResolvedValue(result);
    mocks.operations.mockResolvedValue([]);
});
afterEach(cleanup);
describe("Captura sustentada de Pagos", () => {
    it("consulta exclusivamente el tipo elegido y no ofrece resoluciones ni sanciones", async () => {
        render(<PagosDeteccionesPage tipo="DETECCION_ERROR_MANUAL" />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ typeId: 15, pageSize: 20 })));
        expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: /Aprobar|Descontar|Rechazar/ })).toBeNull();
        expect(screen.queryByRole("textbox", { name: /Dato|Conversación|Evidencia/ })).toBeNull();
    });
    it("descarta búsquedas antiguas al cambiar el DNI", async () => {
        let complete!: (value: unknown[]) => void;
        mocks.operations.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        );
        render(<PagosDeteccionesPage tipo="DETECCION_ERROR_MANUAL" />);
        const dni = screen.getByRole("textbox", { name: /DNI del Cliente/ });
        fireEvent.change(dni, { target: { value: "70176064" } });
        expect(mocks.operations).toHaveBeenCalledWith("70176064", "DETECCION_ERROR_MANUAL");
        fireEvent.change(dni, { target: { value: "87541254" } });
        complete([{ id: 50, codigo: "OPERACION-ANTIGUA", cliente: "Cliente anterior", estado: "PENDIENTE" }]);
        await waitFor(() => expect(mocks.operations).toHaveBeenCalledTimes(2));
        expect(screen.queryByText(/OPERACION-ANTIGUA/)).toBeNull();
    });
    it("registra con DNI y notas, sin operación ni evidencia", async () => {
        mocks.save.mockResolvedValue({ id: 1 });
        render(<PagosDeteccionesPage tipo="REPORTE_ABANDONO" />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ typeId: 16 })));
        fireEvent.change(screen.getByRole("textbox", { name: /DNI del Cliente/ }), { target: { value: "70176064" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Notas/ }), { target: { value: "Chat sin respuesta" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() =>
            expect(mocks.save).toHaveBeenCalledWith(
                "REPORTE_ABANDONO",
                null,
                { motivo: "Chat sin respuesta", dni: "70176064", fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
                expect.any(String),
            ),
        );
    });
    it("un catálogo sin concepto autorizado no consulta la bandeja general", async () => {
        mocks.types.mockResolvedValue([]);
        render(<PagosDeteccionesPage tipo="DETECCION_ERROR_MANUAL" />);
        await screen.findByText("El concepto no está disponible para tu perfil");
        expect(mocks.list).not.toHaveBeenCalled();
    });
    it("Periodo sincroniza las fechas sin cambiar el concepto consultado", async () => {
        render(<PagosDeteccionesPage tipo="REPORTE_ABANDONO" />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ typeId: 16 })));
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-02" } });
        fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
        await waitFor(() =>
            expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ typeId: 16, from: "2026-02-01", to: "2026-02-28", page: 1 })),
        );
    });
});

const item = (estado: string) => ({
    id: 1,
    fechaEvento: "2026-11-05",
    descripcion: "Dato mal digitado",
    estado,
    importeAprobado: 1,
    datos: { operacion: { dni: "70176064", cliente: "Cliente Prueba", codigo: "OP-1", monto: 1500 }, captura: { chat: "chat-123" } },
});
describe("Vocabulario y columnas de Pagos", () => {
    it("auditoría: filtro de tres estados y Monto efectivizado, sin Importe", async () => {
        mocks.list.mockResolvedValue({ ...result, items: [item("APROBADO")] });
        render(<PagosDeteccionesPage tipo="DETECCION_ERROR_MANUAL" />);
        await screen.findByText("Cliente Prueba");
        expect(screen.getByText("Monto efectivizado")).toBeInTheDocument();
        expect(screen.queryByText(/Importe/i)).toBeNull();
        fireEvent.click(screen.getAllByRole("button", { name: /Todos los estados/ })[0]);
        const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
        expect(options).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
    });
    it("abandono: muestra la conversación, no el Monto efectivizado y nada de Importe", async () => {
        mocks.list.mockResolvedValue({ ...result, items: [item("PENDIENTE")] });
        render(<PagosDeteccionesPage tipo="REPORTE_ABANDONO" />);
        await screen.findByText("Cliente Prueba");
        expect(screen.getByText("chat-123")).toBeInTheDocument();
        expect(screen.queryByText("Monto efectivizado")).toBeNull();
        expect(screen.queryByText(/Importe/i)).toBeNull();
    });
});
