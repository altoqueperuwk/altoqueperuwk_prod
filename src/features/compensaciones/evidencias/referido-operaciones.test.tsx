import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ReferidoOperaciones } from "./referido-operaciones";

const mocks = vi.hoisted(() => ({ operations: vi.fn() }));
vi.mock("./referidos.service", () => ({ referidosService: mocks, referidoError: (cause: Error) => cause.message }));
afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.operations.mockResolvedValue({ items: [], limite: 100 });
});
describe("Consulta de evidencia de referidos", () => {
    it("muestra POS solicitado sin ofrecer aprobación", async () => {
        mocks.operations.mockResolvedValue({
            items: [
                {
                    id: 1,
                    servicio: "POS",
                    estado: "Solicitado",
                    banco: "Tarjetas Comerciales",
                    monto: 220,
                    porcentaje: 8,
                    fecha: "2026-10-05T05:00:00Z",
                    codigo: "QA-POS",
                    seleccionable: false,
                    motivo: "No está pagada",
                },
            ],
        });
        render(<ReferidoOperaciones dni="99862002" />);
        expect(await screen.findByTitle("Solicitado")).toHaveTextContent("Pendiente");
        expect(screen.getByText("No está pagada")).toBeVisible();
        expect(screen.queryByRole("button", { name: /validar|aprobar/i })).toBeNull();
        expect(mocks.operations).toHaveBeenCalledWith(null, "99862002");
    });
    it("consulta por id de referido sin confiar en un DNI editable", async () => {
        render(<ReferidoOperaciones id={7} />);
        await screen.findByText("No hay operaciones para este DNI dentro de tu alcance.");
        expect(mocks.operations).toHaveBeenCalledWith(7, null);
    });
    it("muestra errores del servidor", async () => {
        mocks.operations.mockRejectedValue(new Error("Consulta no disponible"));
        render(<ReferidoOperaciones id={7} />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Consulta no disponible");
    });
    it("descarta respuestas del cliente anterior", async () => {
        let resolve!: (value: unknown) => void;
        mocks.operations.mockImplementationOnce(
            () =>
                new Promise((r) => {
                    resolve = r;
                }),
        );
        const view = render(<ReferidoOperaciones id={7} />);
        view.rerender(<ReferidoOperaciones id={8} />);
        await screen.findByText("No hay operaciones para este DNI dentro de tu alcance.");
        resolve({ items: [{ id: 1, servicio: "Cliente anterior" }] });
        await waitFor(() => expect(screen.queryByText("Cliente anterior")).toBeNull());
    });
});
