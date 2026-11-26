import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ReferidoEfectivizacionActions, ReferidoHistorialTable, referidoHistorialColumns } from "./referido-historial";

const mocks = vi.hoisted(() => ({ history: vi.fn(), resolveOperation: vi.fn() }));
vi.mock("./referidos.service", () => ({ referidosService: mocks, referidoError: (error: Error) => error.message }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));

const context = {
    idUsuario: 7,
    idColaborador: 12,
    puedeRegistrar: true,
    puedeRevisar: true,
    puedeAprobar: true,
    puedeAgregarEfectivizacion: true,
    puedeRevertir: true,
};
const record = {
    id: 2,
    estado_evento: "PENDIENTE",
    id_usuario_registra: 8,
    periodo_imputacion: "2027-02-01",
    fecha_evento: "2027-02-10T15:00:00Z",
    banco: "Banco ficticio",
    monto: 1000,
    importe_aprobado: null,
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.history.mockReset();
    mocks.resolveOperation.mockReset();
    mocks.history.mockResolvedValue({ items: [record], total: 21, total_paginas: 2 });
    mocks.resolveOperation.mockResolvedValue({});
});
afterEach(cleanup);
describe("Historial con tabla real", () => {
    it("muestra el error de carga sin mantener filas revisables", async () => {
        mocks.history.mockRejectedValueOnce(new Error("No autorizado"));
        render(<ReferidoHistorialTable id={1} originalEvent={1} context={context} onChanged={vi.fn()} />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No autorizado");
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
    });
    it("muestra la operación poblada y valida sin pedir base manual", async () => {
        const changed = vi.fn();
        render(<ReferidoHistorialTable id={1} originalEvent={1} context={context} onChanged={changed} />);
        expect(await screen.findByText("Banco ficticio")).toBeTruthy();
        expect(screen.getByText("2027-02")).toBeTruthy();
        expect(screen.getByText(/Efectivizaciones \(21\)/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        expect(mocks.resolveOperation).toHaveBeenCalledWith(2, "APROBADO", "");
    });
    it("pagina el historial en servidor y no conserva filas anteriores", async () => {
        render(<ReferidoHistorialTable id={1} originalEvent={1} context={context} onChanged={vi.fn()} />);
        await screen.findByText("Banco ficticio");
        mocks.history.mockResolvedValueOnce({
            items: [{ ...record, id: 3, banco: "Otra operación", estado_evento: "APROBADO", importe_aprobado: 4 }],
            total: 21,
            total_paginas: 2,
        });
        fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
        await screen.findByText("Otra operación", {}, { timeout: 3000 });
        expect(mocks.history).toHaveBeenLastCalledWith(1, 2, 20);
        // La tabla conserva brevemente la fila anterior mientras termina su animación de salida.
        await waitFor(() => expect(screen.queryByText("Banco ficticio")).toBeNull());
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
    });
});

describe("Revisión de efectivizaciones", () => {
    it("jefatura no decide operaciones adicionales aunque pueda revisar el primer referido", () => {
        render(
            <ReferidoEfectivizacionActions
                item={record}
                context={{ ...context, puedeAgregarEfectivizacion: false, puedeRevertir: false }}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button", { name: /Aprobar|Rechazar/ })).toBeNull();
    });
    it("no muestra una comisión pendiente en una solicitud rechazada", () => {
        const column = referidoHistorialColumns.find((column) => column.key === "importe_aprobado")!;
        expect(column.render!(null, { ...record, estado_evento: "RECHAZADO" })).toBe("—");
        expect(column.render!(null, { ...record })).toBe("Pendiente");
        expect(column.render!(0, { ...record })).toBe("Pendiente");
        expect(column.render!(4, { ...record, estado_evento: "APROBADO" })).toMatch(/4.00/);
    });
    it.each([
        ["propia", { ...context, idUsuario: 8 }],
        ["solo consulta", { ...context, puedeAprobar: false, puedeRevisar: false }],
        ["sin contexto", null],
    ])("no ofrece acciones para %s", (_, permissions) => {
        render(<ReferidoEfectivizacionActions item={record} context={permissions} onChanged={vi.fn()} />);
        expect(screen.getByText("Esperando revisión")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });
    it("requiere motivo y solo envía un rechazo mientras la solicitud está pendiente", async () => {
        let finish!: (value: unknown) => void;
        mocks.resolveOperation.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const changed = vi.fn();
        render(<ReferidoEfectivizacionActions item={record} context={context} onChanged={changed} />);
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
        expect(mocks.resolveOperation).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith("validation", "Ingresa el motivo del rechazo.");
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo del rechazo/ }), { target: { value: "No corresponde" } });
        const confirm = screen.getByRole("button", { name: "Confirmar rechazo" });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        expect(mocks.resolveOperation).toHaveBeenCalledTimes(1);
        expect(mocks.resolveOperation).toHaveBeenCalledWith(2, "RECHAZADO", "No corresponde");
        finish({});
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    });
    it("permite reintentar después de un error, sin anunciar éxito", async () => {
        const changed = vi.fn();
        mocks.resolveOperation.mockRejectedValueOnce(new Error("El período está cerrado"));
        render(<ReferidoEfectivizacionActions item={record} context={context} onChanged={changed} />);
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "El período está cerrado"));
        expect(changed).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    });
    it("no ofrece aprobar cuando solo puede revisar", () => {
        render(<ReferidoEfectivizacionActions item={record} context={{ ...context, puedeAprobar: false }} onChanged={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
        expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
    });
});
