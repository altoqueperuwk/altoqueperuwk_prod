import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionFechaCell } from "./compensacion-fecha-cell";

afterEach(cleanup);
describe("Fecha de compensaciones", () => {
    it("preserva el día de una fecha sin zona horaria", () => {
        const { container } = render(<CompensacionFechaCell value="2026-10-24" />);
        expect(screen.getByText("24/10/2026")).toBeTruthy();
        expect(container.querySelectorAll("p")).toHaveLength(1);
    });
    it("separa la fecha y la hora de Lima en dos líneas sin coma", () => {
        const { container } = render(<CompensacionFechaCell value="2026-10-24T02:00:00Z" />);
        expect(screen.getByText("23/10/2026")).toBeTruthy();
        expect(container.querySelectorAll("p")).toHaveLength(2);
        expect(container.textContent).not.toContain(",");
    });
    it("no muestra una fecha inventada para valores vacíos o inválidos", () => {
        const { rerender } = render(<CompensacionFechaCell value={null} />);
        expect(screen.getByText("—")).toBeTruthy();
        rerender(<CompensacionFechaCell value="invalida" />);
        expect(screen.getByText("—")).toBeTruthy();
    });
});
