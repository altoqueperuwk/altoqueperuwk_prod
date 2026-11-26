import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { BonoAutomaticoPage } from "./bono-automatico-page";
import type { EvidenciaTipo } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ summary: vi.fn(), list: vi.fn() }));
vi.mock("./bono-automatico.service", () => ({ getBonoSeguimiento: mocks.summary }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { getList: mocks.list } }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));

vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});
const type = { id: 1, codigo: "META_SEDE_SAFETYPAY", nombre: "Meta SafetyPay" } as EvidenciaTipo;
it("presenta avance real y el registro operativo de SafetyPay", async () => {
    mocks.summary.mockResolvedValue({
        estado: "SIN_PERIODO",
        meta: { objetivo: 1000, acumulado: 820, operaciones: 4, porcentaje: 82, heredada: false },
        importe_provisional: null,
    });
    mocks.list.mockResolvedValue({ items: [] });
    render(<BonoAutomaticoPage type={type} />);
    expect(await screen.findByText("82.00%")).toBeVisible();
    expect(screen.getByText("Período pendiente")).toBeVisible();
    expect(screen.getByText(/El avance no acredita un pago/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Nuevo|Guardar|Aprobar/ })).toBeNull();
});
it("no inventa ganador de atenciones cuando falta Pancake", async () => {
    mocks.summary.mockResolvedValue({ estado: "FUENTE_PENDIENTE", mensaje: "Falta integrar Pancake mensual" });
    mocks.list.mockResolvedValue({ items: [] });
    render(<BonoAutomaticoPage type={{ ...type, codigo: "COLABORADOR_MES_ATENCIONES" }} />);
    expect(await screen.findByText("Fuente mensual pendiente")).toBeVisible();
    expect(screen.queryByText(/100\.00/)).toBeNull();
});
it("un fallo de permisos no se presenta como cero ganado", async () => {
    mocks.summary.mockRejectedValue(new Error("Sin acceso a Sistema"));
    mocks.list.mockResolvedValue({ items: [] });
    render(<BonoAutomaticoPage type={type} />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Sin acceso a Sistema");
    expect(screen.queryByText(/Sin resultados/)).toBeNull();
});
it("pagina los resultados con el servidor sin limitar el historial a 200 registros", async () => {
    mocks.summary.mockResolvedValue({ estado: "PROVISIONAL" });
    mocks.list.mockResolvedValue({ items: [], totalPages: 15 });
    render(<BonoAutomaticoPage type={type} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Página siguiente" })).not.toBeDisabled());
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
    expect(screen.getByText("Página 1 de 15")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20 })));
});
