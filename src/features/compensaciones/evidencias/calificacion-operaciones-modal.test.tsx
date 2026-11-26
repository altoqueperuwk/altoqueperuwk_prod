import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CalificacionOperacionesModal } from "./calificacion-operaciones-modal";
import type { EvidenciaEvento } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
vi.mock("./calificacion-operaciones.service", () => ({ calificacionOperacionesService: mocks }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
const item = { id: 20, datos: { cliente_documento: "12345678" } } as unknown as EvidenciaEvento;
const result = (count = 2) => ({
    items: Array.from({ length: count }, (_, n) => ({
        id: n + 1,
        codigo: `OP-${n + 1}`,
        dni: "12345678",
        cliente: "Cliente",
        servicio: n % 2 ? "Pago Deuda" : "Efectivización",
        monto: 100,
        fecha: "2026-10-25T14:00:00Z",
        estado: "Pagado",
        paso: n % 2 ? 4 : null,
        vinculada: false,
    })),
    dni: "12345678",
    guardadas: false,
    puede_guardar: true,
    pancake: null,
});
beforeEach(() => {
    vi.resetAllMocks();
    mocks.list.mockResolvedValue(result());
    mocks.save.mockResolvedValue({});
});
afterEach(cleanup);

it("selecciona todas las paginas y guarda una sola solicitud con todos los ids", async () => {
    mocks.list.mockResolvedValue(result(21));
    const saved = vi.fn();
    render(<CalificacionOperacionesModal item={item} onClose={vi.fn()} onSaved={saved} />);
    await screen.findByText("OP-1");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/Efectivización pagada y Pago Deuda con paso 4 completado/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas las operaciones" }));
    expect(screen.getByText(/21 de 21 seleccionadas/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenCalledWith(
        20,
        Array.from({ length: 21 }, (_, n) => n + 1),
        "",
    );
    expect(mocks.list).toHaveBeenCalledWith(20);
});
it("conserva la seleccion y el dialogo si el servidor rechaza una operacion", async () => {
    mocks.save.mockRejectedValue(new Error("Operacion no disponible"));
    const saved = vi.fn();
    render(<CalificacionOperacionesModal item={item} onClose={vi.fn()} onSaved={saved} />);
    await screen.findByText("OP-1");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar operación OP-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Operacion no disponible");
    expect(screen.getByRole("checkbox", { name: "Seleccionar operación OP-1" })).toBeChecked();
    expect(saved).not.toHaveBeenCalled();
});
it("Visualizar muestra solo lo guardado sin permitir cambiar la seleccion", async () => {
    const data = result();
    mocks.list.mockResolvedValue({
        ...data,
        guardadas: true,
        pancake: "https://pancake.example/conversation",
        items: data.items.map((op) => ({ ...op, vinculada: true })),
    });
    render(<CalificacionOperacionesModal item={item} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole("heading", { name: "Operaciones Vinculadas" });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.getByRole("link", { name: "Abrir Conversación de Pancake" })).toHaveAttribute("href", data.pancake ?? "https://pancake.example/conversation");
});
it("descarta resultados tardios de otra calificacion", async () => {
    let finish!: (value: unknown) => void;
    mocks.list.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const view = render(<CalificacionOperacionesModal item={item} onClose={vi.fn()} onSaved={vi.fn()} />);
    view.rerender(<CalificacionOperacionesModal item={{ ...item, id: 21 }} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText("OP-1");
    await act(async () => {
        finish({ ...result(), items: [{ ...result().items[0], codigo: "ANTERIOR" }] });
    });
    expect(screen.queryByText("ANTERIOR")).toBeNull();
});
it("una confirmación tardía no cierra ni informa éxito en otra calificación", async () => {
    let finish!: () => void;
    mocks.save.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    const saved = vi.fn();
    const view = render(<CalificacionOperacionesModal item={item} onClose={vi.fn()} onSaved={saved} />);
    await screen.findByText("OP-1");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar operación OP-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    view.rerender(<CalificacionOperacionesModal item={{ ...item, id: 21 }} onClose={vi.fn()} onSaved={saved} />);
    await screen.findByText("OP-1");
    await act(async () => {
        finish();
    });
    expect(saved).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
});
