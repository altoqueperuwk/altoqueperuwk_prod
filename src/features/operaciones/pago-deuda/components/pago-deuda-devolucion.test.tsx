import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PagoDeudaDevolucion } from "./pago-deuda-devolucion";

describe("devolución conciliada", () => {
    it("muestra el importe atribuido y el pill solo en un match múltiple", () => {
        render(<PagoDeudaDevolucion row={{ monto_devuelto: 3000, pd_retorno_monto_devolucion: 1000, pd_match_multiple: true }} />);
        expect(screen.getByText("Conciliado")).toBeInTheDocument();
        expect(screen.getByText(/1,000/)).toBeInTheDocument();
        expect(screen.queryByText(/3,000/)).not.toBeInTheDocument();
    });
    it("no etiqueta un retorno tradicional", () => {
        render(<PagoDeudaDevolucion row={{ monto_devuelto: 1000 }} />);
        expect(screen.queryByText("Conciliado")).not.toBeInTheDocument();
    });
});
