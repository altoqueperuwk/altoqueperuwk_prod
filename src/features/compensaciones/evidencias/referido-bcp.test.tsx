import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ReferidoOperaciones } from "./referido-operaciones";

const mocks = vi.hoisted(() => ({ operations: vi.fn() }));
vi.mock("./referidos.service", () => ({ referidosService: mocks, referidoError: (cause: Error) => cause.message }));
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("Evidencia BCP: DNI proporcionados para pruebas", () => {
    it.each([
        ["74349643", 21996, "00488153", 212],
        ["75530746", 21997, "00555701", 2550],
        ["76763506", 21998, "00656791", 2000],
        ["70021564", 21999, "00668765", 3500],
        ["70362416", 22000, "00690629", 3000],
        ["46028120", 22001, "00674708", 1980],
    ])("muestra la operación BCP de %s para revisión aunque el referido se registre después", async (dni, id, codigo, monto) => {
        mocks.operations.mockResolvedValue({
            items: [
                {
                    id,
                    codigo,
                    monto,
                    banco: "BCP",
                    servicio: "Efectivizacion",
                    estado: "Pagado",
                    porcentaje: 1,
                    fecha: "2026-10-10T16:54:17.165Z",
                    seleccionable: true,
                    motivo: "Siguiente operacion elegible para validar",
                },
            ],
            limite: 100,
        });
        render(<ReferidoOperaciones dni={String(dni)} />);
        expect(await screen.findByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "Efectivización · BCP")).toBeVisible();
        expect(screen.getByText(`Código: ${codigo}`)).toBeVisible();
        expect(screen.getByText("Pagado")).toBeVisible();
        expect(screen.getByText("Siguiente operacion elegible para validar")).toBeVisible();
        expect(mocks.operations).toHaveBeenCalledWith(null, String(dni));
        expect(screen.queryByRole("button", { name: /aprobar|validar/i })).toBeNull();
    });
});
