import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RegistroFormularioDialog } from "./registro-formulario-dialog";

const mocks = vi.hoisted(() => ({ expediente: vi.fn() }));
vi.mock("../shared/seguimiento-jefatura.service", async (original) => ({
    ...(await original<typeof import("../shared/seguimiento-jefatura.service")>()),
    seguimientoJefaturaService: { expediente: mocks.expediente },
}));

const fila = {
    id: "EVENTO:42",
    id_origen: "EVENTO:42",
    tipo: "PENALIDAD",
    concepto_nombre: "Falta de Uniforme Completo",
    concepto_codigo: "ATC_UNIFORME",
    descripcion: "Falta de Uniforme Completo",
    fecha: "2026-11-19T21:23:00-05:00",
    estado: "APROBADO",
    estado_grupo: "APROBADO",
    importe: -10,
};
const destino = { modulo: "Incidencias", href: "/compensaciones/incidencias" };

beforeEach(() => mocks.expediente.mockReset());

it("penalidad: muestra lo registrado, el resultado y quién la reportó", async () => {
    mocks.expediente.mockResolvedValue({ motivo: "Llegó sin el polo oficial", reportante: "Matias Crisanto" });
    render(<RegistroFormularioDialog row={fila} destino={destino} onClose={() => {}} />);
    expect(screen.getByText("Detalle de la penalidad", { selector: "h2" })).toBeVisible();
    await waitFor(() => expect(screen.getByText("Llegó sin el polo oficial")).toBeVisible());
    expect(screen.getByText("Matias Crisanto")).toBeVisible();
    expect(mocks.expediente).toHaveBeenCalledWith(42);
    expect(screen.getByText(/−\s*S\/\s*10\.00/)).toBeVisible();
    expect(screen.getByText("Este descuento se aplica en tu periodo.")).toBeVisible();
});

it("bono: mismo formulario, con signo positivo y acceso a la opción donde se registró", () => {
    render(
        <RegistroFormularioDialog
            row={{ ...fila, id: "BONO:1", id_origen: "BONO:1", tipo: "BONO", concepto_nombre: "Referido", descripcion: "Referido de prueba", importe: 15 }}
            destino={{ modulo: "Referidos", href: "/compensaciones/referidos" }}
            onClose={() => {}}
        />,
    );
    expect(screen.getByText("Detalle del bono", { selector: "h2" })).toBeVisible();
    expect(screen.getByText(/\+\s*S\/\s*15\.00/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ir a Referidos" })).toHaveAttribute("href", "/compensaciones/referidos");
    expect(mocks.expediente).not.toHaveBeenCalled();
});

it("sin expediente usa la fila y sin destino no ofrece enlace", () => {
    render(
        <RegistroFormularioDialog
            row={{ ...fila, id: "DESCUENTO_MES:7", id_origen: "DESCUENTO_MES:7", descripcion: "Descuento por error de cuadro" }}
            onClose={() => {}}
        />,
    );
    expect(screen.getByText("Descuento por error de cuadro")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(mocks.expediente).not.toHaveBeenCalled();
});

it("la primera falta sin descuento avisa que pierde Puntualidad", () => {
    render(<RegistroFormularioDialog row={{ ...fila, id: "DESCUENTO_MES:8", id_origen: "DESCUENTO_MES:8", importe: 0 }} onClose={() => {}} />);
    expect(screen.getAllByText(/pierde el bono de Puntualidad/).length).toBeGreaterThan(0);
});

it("pendiente: explica que el monto se confirma al aprobarse", () => {
    render(
        <RegistroFormularioDialog
            row={{ ...fila, id: "DESCUENTO_MES:9", id_origen: "DESCUENTO_MES:9", concepto_codigo: "BONO_X", estado_grupo: "PENDIENTE", importe: null }}
            onClose={() => {}}
        />,
    );
    expect(screen.getByText("Por confirmar")).toBeVisible();
    expect(screen.getByText(/pendiente de revisión/)).toBeVisible();
});
