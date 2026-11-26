import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CompensacionEstado } from "./compensacion-estado";

afterEach(cleanup);
it("explica Liberada sin presentarla como un rechazo", () => {
    render(<CompensacionEstado dominio="atribucion" valor="LIBERADA" />);
    expect(screen.getByText("Liberada").closest("[title]")).toHaveAttribute("title", expect.stringContaining("puede reutilizarse"));
});
it("conserva motivos largos fuera del texto del badge", () => {
    render(<CompensacionEstado dominio="aprobacion" valor="PENDIENTE" detalle="Falta confirmar la corrección del hallazgo." />);
    expect(screen.getByText("Pendiente").closest("[title]")).toHaveAttribute("title", "Falta confirmar la corrección del hallazgo.");
    expect(screen.queryByText("Falta confirmar la corrección del hallazgo.")).not.toBeInTheDocument();
});
