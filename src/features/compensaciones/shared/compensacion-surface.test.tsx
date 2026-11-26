import { useState } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionSurface } from "./compensacion-surface";

afterEach(cleanup);
describe("Superficie accesible de compensaciones", () => {
    it("el formulario inline no abre un diálogo ni bloquea la página", () => {
        render(
            <CompensacionSurface inline title="Llamada" onClose={() => {}}>
                <input aria-label="Cliente" />
            </CompensacionSurface>,
        );
        expect(screen.getByLabelText("Cliente")).toBeTruthy();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("expone el nombre del diálogo y lleva el foco al diálogo", async () => {
        render(
            <CompensacionSurface title="Nueva cuenta" onClose={() => {}}>
                <div>
                    <input aria-label="Cuenta" />
                </div>
            </CompensacionSurface>,
        );
        expect(screen.getByRole("dialog", { name: "Nueva cuenta" })).toBeTruthy();
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Nueva cuenta" })));
    });
    it("Escape cierra y restaura el foco al control de apertura", async () => {
        const Example = () => {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>Abrir</button>
                    {open && (
                        <CompensacionSurface title="Ficha" onClose={() => setOpen(false)}>
                            <div>
                                <input aria-label="Nombre" />
                            </div>
                        </CompensacionSurface>
                    )}
                </>
            );
        };
        render(<Example />);
        const trigger = screen.getByRole("button", { name: "Abrir" });
        trigger.focus();
        fireEvent.click(trigger);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Ficha" })));
        fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
    it("Escape no descarta una operación en curso", async () => {
        const close = vi.fn();
        render(
            <CompensacionSurface title="Importar" busy onClose={close}>
                <div>
                    <input aria-label="Archivo" />
                </div>
            </CompensacionSurface>,
        );
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Importar" })));
        fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape" });
        expect(close).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog", { name: "Importar" })).toBeTruthy();
    });
});
