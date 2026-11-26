import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ConfiguracionComunidadesCalificacion } from "./configuracion-comunidades-calificacion";

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("./configuracion.service", () => ({ configuracionService: { getRatingCommunities: mocks.get, saveRatingCommunities: mocks.save } }));

const data = (configurado: boolean, elegibles: number[]) => ({
    configurado,
    comunidades: [
        { id: 10, nombre: "ATK1", elegible: elegibles.includes(10) },
        { id: 11, nombre: "ATK50", elegible: elegibles.includes(11) },
    ],
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(data(true, [10]));
    mocks.save.mockResolvedValue(data(true, [10, 11]));
});
afterEach(cleanup);

describe("Comunidades con comisión general", () => {
    it("carga la lista y guarda solo tras un cambio explícito", async () => {
        render(<ConfiguracionComunidadesCalificacion />);
        const other = await screen.findByRole("checkbox", { name: "ATK50" });
        expect(screen.getByRole("checkbox", { name: "ATK1" })).toBeChecked();
        expect(screen.getByRole("button", { name: "Guardar comunidades" })).toBeDisabled();
        fireEvent.click(other);
        fireEvent.click(screen.getByRole("button", { name: "Guardar comunidades" }));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledExactlyOnceWith([10, 11]));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("success", expect.stringContaining("guardadas")));
    });
    it("avisa que sin lista configurada no se restringe y permite activarla", async () => {
        mocks.get.mockResolvedValue(data(false, [10, 11]));
        render(<ConfiguracionComunidadesCalificacion />);
        expect(await screen.findByText(/no se restringe por comunidad/)).toBeTruthy();
        const save = screen.getByRole("button", { name: "Guardar comunidades" });
        expect(save).toBeEnabled();
        fireEvent.click(save);
        await waitFor(() => expect(mocks.save).toHaveBeenCalledExactlyOnceWith([10, 11]));
    });
    it("advierte cuando no queda ninguna comunidad marcada", async () => {
        render(<ConfiguracionComunidadesCalificacion />);
        fireEvent.click(await screen.findByRole("checkbox", { name: "ATK1" }));
        expect((await screen.findByRole("alert", { hidden: true })).textContent).toContain("ninguna efectivizacion");
    });
    it("un error de consulta no muestra una lista ficticia y permite reintentar", async () => {
        mocks.get.mockRejectedValueOnce(new Error("Sin permiso"));
        render(<ConfiguracionComunidadesCalificacion />);
        expect(await screen.findByText("Sin permiso")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Guardar comunidades" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar comunidades" }));
        expect(await screen.findByRole("checkbox", { name: "ATK1" })).toBeTruthy();
    });
    it("un error al guardar conserva la selección y lo informa", async () => {
        mocks.save.mockRejectedValueOnce(new Error("Comunidad inactiva"));
        render(<ConfiguracionComunidadesCalificacion />);
        fireEvent.click(await screen.findByRole("checkbox", { name: "ATK50" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar comunidades" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Comunidad inactiva"));
        expect(screen.getByRole("checkbox", { name: "ATK50" })).toBeChecked();
    });
});
