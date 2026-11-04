// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PosDeleteSummary } from "./pos-delete-summary";
import type { OperacionProceso } from "../../shared/types/operaciones.types";

afterEach(cleanup);
it("muestra los seis datos del POS seleccionado, conservando código y DNI", () => {
    render(<PosDeleteSummary operation={{
        nombre_pos: "NIUBIZ", nombre_empresa_pos: "Empresa de prueba",
        codigo_operacion_deposito_cliente: "001234", nombre_banco_cliente: "CMR",
        dni_cliente: "01234567", monto_deposito_cliente: 110,
    } as OperacionProceso} />);
    for (const label of ["POS", "Empresa", "Cod. Operacion", "Entidad Tarjeta", "DNI", "Monto Deposito"])
        expect(screen.getByText(label)).toBeTruthy();
    for (const value of ["NIUBIZ", "Empresa de prueba", "001234", "CMR", "01234567"])
        expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByText(/110\.00/)).toBeTruthy();
});
it("muestra un reemplazo legible para datos faltantes", () => {
    render(<PosDeleteSummary operation={{ monto_deposito_cliente: 0 } as OperacionProceso} />);
    expect(screen.getAllByText("—")).toHaveLength(5);
});
