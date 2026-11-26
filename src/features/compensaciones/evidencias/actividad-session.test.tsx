import type { ReactNode } from "react";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciasPage } from "./evidencias-page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), calls: vi.fn(), cards: vi.fn(), profile: { userId: 24, isAdvisor: true, isResolving: false } }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile, advisorCanRegisterBonus: () => false }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { getList: mocks.list, getCallsContext: mocks.calls, getCardContext: mocks.cards } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({ useClienteLookup: () => ({ result: null, isLoading: false }) }));

const context = { idUsuario: 24, idColaborador: 15, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.profile.userId = 24;
    mocks.profile.isResolving = false;
    mocks.list.mockResolvedValue({
        items: [],
        resumen: { borradores: 0, pendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 },
        totalPages: 1,
    });
    mocks.calls.mockResolvedValue(context);
    mocks.cards.mockResolvedValue(context);
});
afterEach(cleanup);
it.each(["LLAMADA", "TARJETA_TERCERO"] as const)("espera identidad antes de cargar %s", (category) => {
    mocks.profile.isResolving = true;
    render(<EvidenciasPage category={category} />);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando acceso");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.calls).not.toHaveBeenCalled();
    expect(mocks.cards).not.toHaveBeenCalled();
});
it.each(["LLAMADA", "TARJETA_TERCERO"] as const)("limpia la captura y descarta permisos tardíos al cambiar de usuario en %s", async (category) => {
    const service = category === "LLAMADA" ? mocks.calls : mocks.cards;
    let finish!: (value: typeof context) => void;
    service.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    service.mockResolvedValueOnce({ ...context, idUsuario: 30, puedeRegistrar: false });
    const view = render(<EvidenciasPage category={category} />);
    await waitFor(() => expect(service).toHaveBeenCalledOnce());
    mocks.profile.userId = 30;
    view.rerender(<EvidenciasPage category={category} />);
    await waitFor(() => expect(service).toHaveBeenCalledTimes(2));
    await act(async () => finish(context));
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Aprobar|Rechazar/ })).toBeNull();
});
it("mantiene el aviso cuando falla la verificación de captura y no muestra Actualizar", async () => {
    mocks.cards.mockRejectedValueOnce(new Error("Permisos no disponibles"));
    render(<EvidenciasPage category="TARJETA_TERCERO" />);
    await screen.findByText("Permisos no disponibles");
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
    expect(mocks.cards).toHaveBeenCalledTimes(1);
});
