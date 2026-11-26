import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { LlamadaForm } from "./llamada-form";
import { ReferidoForm } from "./referido-form";
import { TarjetaTerceroForm } from "./tarjeta-tercero-form";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), register: vi.fn() }));
vi.mock("@/services/cliente.service", () => ({ clienteService: { getList: mocks.lookup } }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { registerCall: mocks.register, registerCard: mocks.register } }));

vi.mock("@/providers/session-cache-provider", () => ({
    useSessionCache: () => ({ bancos: [{ id: 2, nombre: "BCP", id_estado: 1 }] }),
}));
const context = { idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false };
const dni = (value: string) => fireEvent.change(screen.getByRole("textbox", { name: /DNI del cliente|Nro\. Documento/ }), { target: { value } });
const name = () => screen.getByRole("textbox", { name: /^Nombre/ }) as HTMLInputElement;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookup.mockResolvedValue([]);
});
afterEach(cleanup);

it("Referidos muestra la identidad consultada sin modificar el DNI", async () => {
    mocks.lookup.mockResolvedValue([{ id: 2, numero_documento: "47356534", nombre: "Cliente registrado" }]);
    render(<ReferidoForm context={context} error="" onSave={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "47356534" } });
    const previousDocument = (screen.getByRole("textbox", { name: /Nro\. Documento/ }) as HTMLInputElement).value;
    await waitFor(() => expect(name()).toHaveValue("Cliente registrado"));
    expect(screen.getByRole("textbox", { name: /Nro\. Documento/ })).toHaveValue(previousDocument);
});

describe.each([
    ["Llamadas", LlamadaForm],
    ["Tarjetas", TarjetaTerceroForm],
] as const)("%s: consulta de clientes", (_, Form) => {
    it("consulta DNI completo y autocompleta solo la coincidencia exacta", async () => {
        mocks.lookup.mockResolvedValue([
            { id: 1, numero_documento: "147356534", nombre: "No corresponde" },
            { id: 2, numero_documento: "47356534", nombre: "Cliente registrado" },
        ]);
        render(<Form contexto={context} error="" onSave={vi.fn()} />);
        dni("473");
        expect(mocks.lookup).not.toHaveBeenCalled();
        dni("47356534");
        await waitFor(() => expect(name().value).toBe("Cliente registrado"));
        expect(mocks.lookup).toHaveBeenCalledWith({ p_tipo_documento: 1, p_numero_documento: "47356534", p_id_estado: 1 });
        dni("123");
        expect(name().value).toBe("");
    });
    it("permite ingreso manual cuando no se encuentra el cliente", async () => {
        render(<Form contexto={context} error="" onSave={vi.fn()} />);
        dni("01234567");
        // Tarjetas ya no muestra mensajes bajo el documento (solo el indicador de carga).
        if (Form === LlamadaForm) await screen.findByText(/Cliente no encontrado\. Ingresa su nombre\.|Cliente nuevo: completa su nombre/);
        fireEvent.change(name(), { target: { value: "Cliente nuevo" } });
        expect(name().value).toBe("Cliente nuevo");
    });
    it("muestra el fallo de consulta sin confundirlo con cliente inexistente", async () => {
        mocks.lookup.mockRejectedValue(new Error("Sin conexión"));
        render(<Form contexto={context} error="" onSave={vi.fn()} />);
        dni("01234567");
        if (Form === LlamadaForm) await screen.findByText(/No se pudo consultar el cliente/);
        else await waitFor(() => expect(mocks.lookup).toHaveBeenCalled());
        expect(screen.queryByText("Cliente no encontrado. Ingresa su nombre.")).toBeNull();
    });
    it("descarta una respuesta tardía cuando el DNI cambió", async () => {
        let complete!: (rows: unknown[]) => void;
        mocks.lookup.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        );
        render(<Form contexto={context} error="" onSave={vi.fn()} />);
        dni("47356534");
        await waitFor(() => expect(mocks.lookup).toHaveBeenCalledTimes(1));
        dni("123");
        await act(async () => complete([{ id: 2, numero_documento: "47356534", nombre: "Respuesta antigua" }]));
        expect(name().value).toBe("");
    });
});
