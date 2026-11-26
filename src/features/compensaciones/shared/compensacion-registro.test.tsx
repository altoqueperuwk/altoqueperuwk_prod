import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionRegistro } from "./compensacion-registro";

afterEach(cleanup);
const example = (saved = vi.fn(), disabled = false) =>
    render(
        <CompensacionRegistro title="Registrar prueba" label="Nuevo" isDisabled={disabled} onSaved={saved}>
            {({ onSave }) => (
                <>
                    <input aria-label="Nombre" />
                    <button onClick={onSave}>Guardar</button>
                </>
            )}
        </CompensacionRegistro>,
    );
describe("Registro permanente en página", () => {
    it("muestra los campos desde el inicio sin diálogo ni botón de apertura", () => {
        example();
        expect(screen.getByLabelText("Nombre")).toBeVisible();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByRole("button", { name: "Nuevo" })).toBeNull();
    });
    it("bloquea todos los campos cuando no hay permiso", () => {
        const saved = vi.fn();
        example(saved, true);
        expect(screen.getByLabelText("Nombre")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(saved).not.toHaveBeenCalled();
    });
    it("reinicia los campos y conserva el formulario al guardar", () => {
        const saved = vi.fn();
        example(saved);
        fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Prueba" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(saved).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText("Nombre")).toBeVisible();
        expect(screen.getByLabelText("Nombre")).toHaveValue("");
    });
    it("Escape no oculta el formulario ni borra el contenido", () => {
        example();
        fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Pendiente" } });
        fireEvent.keyDown(screen.getByLabelText("Nombre"), { key: "Escape" });
        expect(screen.getByLabelText("Nombre")).toHaveValue("Pendiente");
    });
});
