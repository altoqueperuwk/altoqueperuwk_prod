import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ValidationAlert } from "./validation-alert";

it("une el encabezado con el mensaje, abajo al centro y sin título aparte", () => {
    render(<ValidationAlert tone="success" items={["Tarjeta guardada."]} onClose={() => {}} />);
    const alert = screen.getByRole("status");
    expect(alert).toHaveTextContent("Listo, Tarjeta guardada.");
    expect(alert.parentElement?.className).toContain("bottom-4");
    expect(screen.getByText("Tarjeta guardada.").className).toContain("first-letter:lowercase");
});

it("no baja la inicial de siglas y respeta el encabezado de validación", () => {
    render(<ValidationAlert items={["DNI de 8 dígitos"]} onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Revisa los datos, DNI de 8 dígitos");
    expect(screen.getByText("DNI de 8 dígitos").className).not.toContain("first-letter:lowercase");
});
