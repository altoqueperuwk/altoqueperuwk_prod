import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { AtencionesPage } from "./atenciones-page";
import { PagosRegistroValidacionPage } from "./pagos-registro-validacion-page";

const mocks = vi.hoisted(() => ({
    esValidador: vi.fn(),
    listar: vi.fn(),
    validar: vi.fn(),
    profile: { isAdvisor: false, isStoreManager: false, isPagos: true, isAdministrator: false, isResolving: false, userId: 10 },
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ catalogos: { estados: [] } }) }));
vi.mock("@/hooks/use-atk-brand", () => ({ useAtkBrand: () => undefined }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));
vi.mock("./clientes-nuevos-page", () => ({ ClientesNuevosPage: () => <p>Registro habitual</p> }));
vi.mock("./pagos-registro-nuevo.service", () => ({
    pagosRegistroNuevoService: { esValidador: mocks.esValidador, listar: mocks.listar, validar: mocks.validar },
}));

const fila = (id: number, validacion: { id: number; estado: string; importe: number | null } | null) => ({
    id,
    documento: `7000000${id}`,
    nombre: `Cliente ${id}`,
    fechaRegistro: "2026-11-16T10:00:00Z",
    registradoPor: "Asesora ATC",
    sede: "Sede Lince",
    operacion: `OP-${id}`,
    monto: 1000,
    fechaPago: "2026-11-17T10:00:00Z",
    areaPagos: "Operador Pagos",
    validacion,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.listar.mockResolvedValue([fila(1, null), fila(2, { id: 9, estado: "APROBADO", importe: 0.3 })]);
});
afterEach(cleanup);

describe("Registro Nuevo de Pagos", () => {
    it("el Jefe Superior ve la validación y los demás cargos su Registro Nuevo habitual", async () => {
        mocks.esValidador.mockResolvedValue(true);
        const { unmount } = render(<AtencionesPage />);
        await screen.findByText("Bono Validación");
        expect(screen.queryByText("Registro habitual")).toBeNull();
        unmount();
        mocks.esValidador.mockResolvedValue(false);
        render(<AtencionesPage />);
        await screen.findByText("Registro habitual");
    });
    it("lista Área de Pagos y valida solo los registros sin validar", async () => {
        mocks.validar.mockResolvedValue({ id: 77, estado_evento: "PENDIENTE" });
        render(<PagosRegistroValidacionPage />);
        await screen.findByText("Área de Pagos");
        expect(screen.getAllByRole("button", { name: "Validar" })).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await waitFor(() => expect(mocks.validar).toHaveBeenCalledWith(1));
        await waitFor(() => expect(mocks.listar).toHaveBeenCalledTimes(2));
    });
    it("muestra el error del servidor al validar", async () => {
        mocks.validar.mockRejectedValue({ message: "Este registro ya fue validado" });
        render(<PagosRegistroValidacionPage />);
        await screen.findByText("Área de Pagos");
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await screen.findByText("Este registro ya fue validado");
    });
});
