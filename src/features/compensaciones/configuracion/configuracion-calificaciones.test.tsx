import { StrictMode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ConfiguracionCalificaciones } from "./configuracion-calificaciones";

const mocks = vi.hoisted(() => ({ types: vi.fn(), save: vi.fn() }));
vi.mock("../evidencias/evidencias.service", () => ({ evidenciasService: { getTypes: mocks.types, saveRatingPolicy: mocks.save } }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.types.mockResolvedValue([
        {
            codigo: "CALIFICACION_PRESENCIAL",
            configuracion: { validez_calificacion: { dni_obligatorio: true, comentario_obligatorio: false, asesor_obligatorio: false } },
        },
    ]);
    mocks.save.mockResolvedValue({});
});
afterEach(cleanup);

describe("Requisitos de calificaciones en configuración", () => {
    it("una respuesta antigua no reemplaza la política más reciente", async () => {
        let reject!: (cause: Error) => void;
        mocks.types.mockImplementationOnce(
            () =>
                new Promise((_, no) => {
                    reject = no;
                }),
        );
        render(
            <StrictMode>
                <ConfiguracionCalificaciones />
            </StrictMode>,
        );
        await screen.findByRole("checkbox", { name: "DNI obligatorio" });
        await act(async () => reject(new Error("Error antiguo")));
        expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
        expect(screen.getByRole("checkbox", { name: "DNI obligatorio" })).toBeTruthy();
    });
    it("carga el catálogo y guarda solo después de una modificación explícita", async () => {
        render(<ConfiguracionCalificaciones />);
        const comment = await screen.findByRole("checkbox", { name: "Comentario obligatorio" });
        expect(mocks.save).not.toHaveBeenCalled();
        fireEvent.click(comment);
        fireEvent.click(screen.getByRole("button", { name: "Guardar requisitos" }));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ dni_obligatorio: true, comentario_obligatorio: true, asesor_obligatorio: false }));
        await waitFor(() => expect(mocks.types).toHaveBeenCalledTimes(2));
    });
    it("un error de consulta no habilita requisitos con valores ficticios", async () => {
        mocks.types.mockRejectedValueOnce(new Error("Sin permiso"));
        render(<ConfiguracionCalificaciones />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Sin permiso");
        expect(screen.queryByRole("button", { name: "Guardar requisitos" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar requisitos" }));
        expect(await screen.findByRole("checkbox", { name: "DNI obligatorio" })).toBeTruthy();
    });
});
