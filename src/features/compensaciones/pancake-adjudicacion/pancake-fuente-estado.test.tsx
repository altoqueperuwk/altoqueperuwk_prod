import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { PancakeFuenteEstado } from "./pancake-fuente-estado";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});
it("fuente ausente comunica pendiente y no una pérdida ni un importe cero", async () => {
    rpc.mockResolvedValue({ data: { estado: "SIN_FUENTE" }, error: null });
    render(<PancakeFuenteEstado mes="2026-11" />);
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Aviso");
    expect(notice).toHaveTextContent(/no se cuenta como cero/);
});
it("una respuesta antigua no reemplaza el resultado del nuevo periodo", async () => {
    let finish!: (value: unknown) => void;
    rpc.mockReturnValueOnce(
        new Promise((resolve) => {
            finish = resolve;
        }),
    );
    rpc.mockResolvedValueOnce({ data: { estado: "CERTIFICADA" }, error: null });
    const view = render(<PancakeFuenteEstado mes="2026-10" />);
    view.rerender(<PancakeFuenteEstado mes="2026-11" />);
    finish({ data: { estado: "SIN_FUENTE" }, error: null });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Sin Fuente Pancake")).not.toBeInTheDocument();
});
it("un error de conexión no se presenta como fuente ausente", async () => {
    rpc.mockRejectedValue(new Error("sin conexión"));
    render(<PancakeFuenteEstado mes="2026-11" />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo consultar el estado de Pancake");
    expect(screen.queryByText("Sin Fuente Pancake")).not.toBeInTheDocument();
});
