import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TarjetaOperacionesPopup } from "./tarjeta-operaciones-popup";

const mocks = vi.hoisted(() => ({ deCliente: vi.fn() }));
vi.mock("./tarjeta-operaciones.service", () => ({ tarjetaOperacionesService: { deCliente: mocks.deCliente } }));

const filas = [
    {
        id: 1,
        flujo: "EFECTIVIZACION",
        codigo: "1455413",
        referencia: "1455413",
        monto: 1000,
        comision: 30,
        estado: "Pagado",
        fecha: "2026-11-19T23:23:56+00:00",
    },
    { id: 2, flujo: "PAGO_DEUDA", codigo: null, referencia: "ID:2", monto: 250, comision: null, estado: "Pendiente", fecha: "2026-11-20T15:00:00+00:00" },
];
beforeEach(() => mocks.deCliente.mockReset());

it("lista efectivización y pago de deuda; el pago de deuda no tiene código", async () => {
    mocks.deCliente.mockResolvedValue(filas);
    render(<TarjetaOperacionesPopup documento="74206925" value="" onApply={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText("Pago de deuda")).toBeVisible();
    for (const head of ["Flujo", "Cod. Op.", "Monto", "Comisión", "Estado", "Fecha"]) expect(screen.getByRole("columnheader", { name: head })).toBeVisible();
    expect(screen.getByText("1455413")).toBeVisible();
    expect(mocks.deCliente).toHaveBeenCalledWith("74206925");
});

it("elige una sola operación con checkbox y la entrega al aplicar", async () => {
    mocks.deCliente.mockResolvedValue(filas);
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<TarjetaOperacionesPopup documento="74206925" value="" onApply={onApply} onClose={onClose} />);
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[1]).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onApply).toHaveBeenCalledWith(filas[1]);
    expect(onClose).toHaveBeenCalled();
});

it("sin operaciones lo dice y permite reintentar ante un fallo", async () => {
    mocks.deCliente.mockResolvedValueOnce([]);
    const { unmount } = render(<TarjetaOperacionesPopup documento="74206925" value="" onApply={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/no tiene operaciones/)).toBeVisible();
    unmount();
    mocks.deCliente.mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValueOnce(filas);
    render(<TarjetaOperacionesPopup documento="74206925" value="" onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
});
