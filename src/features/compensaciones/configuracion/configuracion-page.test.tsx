import { type ReactNode, StrictMode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ConfiguracionPage, selectBusinessConfiguration } from "./configuracion-page";
import type { PlanVersion } from "./configuracion.types";

const mocks = vi.hoisted(() => ({
    versions: vi.fn(),
    prepare: vi.fn(),
    admin: true,
    authLoading: false,
    userId: "admin-1",
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/providers/auth-provider", () => ({
    useAuth: () => ({ businessUser: { id: mocks.userId }, isLoading: mocks.authLoading, isBusinessUserLoading: false }),
    isAdministrator: () => mocks.admin,
}));

vi.mock("./configuracion-operativa", () => ({
    ConfiguracionOperativa: ({ version, onChanged }: { version: PlanVersion | null; onChanged: () => void }) => (
        <div>
            <p>{version ? "Parámetros cargados" : "Sin parámetros"}</p>
            <p>Versión {version?.id}</p>
            <button onClick={onChanged}>Actualizar parámetros</button>
        </div>
    ),
}));
vi.mock("./configuracion-calificaciones", () => ({ ConfiguracionCalificaciones: () => <p>Requisitos</p> }));
vi.mock("./configuracion-comunidades-calificacion", () => ({ ConfiguracionComunidadesCalificacion: () => <p>Comunidades</p> }));
vi.mock("./configuracion-permisos", () => ({ ConfiguracionPermisos: () => <p>Permisos</p> }));
vi.mock("./configuracion.service", () => ({
    configuracionService: {
        getPlans: async () => [{ id: 1, codigo: "PLAN_COMPENSACIONES_GENERAL" }],
        getVersions: mocks.versions,
        getConcepts: async () => [],
        getCargos: async () => [],
        getJornadas: async () => [],
        getRules: async () => [],
        getPenalties: async () => [],
        prepareConfiguration: mocks.prepare,
    },
}));
const version = (id: number, state = "BORRADOR", plan = 1) => ({ id, idPlan: plan, numeroVersion: id, estado: state, esVigente: true }) as PlanVersion;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin = true;
    mocks.authLoading = false;
    mocks.userId = "admin-1";
    mocks.versions.mockResolvedValue([version(1)]);
    mocks.prepare.mockResolvedValue({ id_configuracion: 2 });
});
afterEach(cleanup);
describe("Configuración sin gestión técnica", () => {
    it("espera el perfil y rechaza no administradores antes de consultar", async () => {
        mocks.authLoading = true;
        const view = render(<ConfiguracionPage />);
        expect(screen.getByRole("status").textContent).toContain("Verificando acceso");
        expect(mocks.versions).not.toHaveBeenCalled();
        mocks.authLoading = false;
        mocks.admin = false;
        view.rerender(<ConfiguracionPage />);
        expect(await screen.findByRole("status")).toHaveTextContent("Solo Administración");
        expect(mocks.versions).not.toHaveBeenCalled();
        expect(screen.queryByText("Requisitos")).toBeNull();
        expect(screen.queryByText("Permisos")).toBeNull();
        mocks.admin = true;
        view.rerender(<ConfiguracionPage />);
        await screen.findByText("Parámetros cargados");
        expect(mocks.versions).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])("ignora éxito/error tardío de una carga reemplazada (%s)", async (fail) => {
        let resolve!: (value: PlanVersion[]) => void;
        let reject!: (cause: Error) => void;
        mocks.versions
            .mockImplementationOnce(
                () =>
                    new Promise<PlanVersion[]>((yes, no) => {
                        resolve = yes;
                        reject = no;
                    }),
            )
            .mockResolvedValue([version(2)]);
        render(
            <StrictMode>
                <ConfiguracionPage />
            </StrictMode>,
        );
        await screen.findByText("Versión 2");
        await act(async () => {
            if (fail) reject(new Error("Error antiguo"));
            else resolve([version(1)]);
        });
        expect(screen.getByText("Versión 2")).toBeTruthy();
        expect(screen.queryByText("Error antiguo")).toBeNull();
    });

    it("oculta datos anteriores al recargar, muestra error y permite recuperar", async () => {
        let reject!: (cause: Error) => void;
        mocks.versions
            .mockResolvedValueOnce([version(1)])
            .mockImplementationOnce(
                () =>
                    new Promise((_, no) => {
                        reject = no;
                    }),
            )
            .mockResolvedValue([version(2)]);
        render(<ConfiguracionPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Actualizar parámetros" }));
        expect(screen.queryByText("Parámetros cargados")).toBeNull();
        await act(async () => reject(new Error("Consulta fallida")));
        expect(screen.getByRole("alert", { hidden: true }).textContent).toContain("Consulta fallida");
        expect(screen.queryByText("Versión 1")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
        await screen.findByText("Versión 2");
    });

    it("no representa datos ausentes como parámetros cargados", async () => {
        mocks.versions.mockResolvedValue([]);
        render(<ConfiguracionPage />);
        await screen.findByText(/No hay parámetros disponibles/);
        expect(screen.queryByText("Parámetros cargados")).toBeNull();
        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Habilitar edición" })).toBeTruthy();
    });

    it("descarta la carga anterior al cambiar de administrador", async () => {
        let resolve!: (value: PlanVersion[]) => void;
        mocks.versions
            .mockImplementationOnce(
                () =>
                    new Promise((yes) => {
                        resolve = yes;
                    }),
            )
            .mockResolvedValue([version(2)]);
        const view = render(<ConfiguracionPage />);
        mocks.userId = "admin-2";
        view.rerender(<ConfiguracionPage />);
        await screen.findByText("Versión 2");
        await act(async () => resolve([version(1)]));
        expect(screen.queryByText("Versión 1")).toBeNull();
        mocks.admin = false;
        view.rerender(<ConfiguracionPage />);
        expect(screen.queryByText("Parámetros cargados")).toBeNull();
    });

    it("elige el catálogo general más reciente y no el ficticio", () => {
        expect(selectBusinessConfiguration([version(9, "BORRADOR", 77), version(2), version(1)], 1)?.id).toBe(2);
        expect(selectBusinessConfiguration([version(1)], undefined)).toBeNull();
    });
    it("cargar no prepara ni publica tarifas y no expone controles técnicos", async () => {
        render(<ConfiguracionPage />);
        await screen.findByText("Parámetros cargados");
        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(screen.queryByText("Configuración avanzada")).toBeNull();
        expect(screen.queryByText("Planes y versiones")).toBeNull();
        expect(screen.getByText("Permisos")).toBeTruthy();
    });
    it("prepara la edición solo tras acción explícita", async () => {
        mocks.versions.mockResolvedValueOnce([version(1, "PUBLICADA")]).mockResolvedValue([version(2)]);
        render(<ConfiguracionPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Habilitar edición" }));
        await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole("button", { name: "Habilitar edición" })).toBeNull());
    });
    it("permiso denegado no comunica éxito", async () => {
        mocks.versions.mockResolvedValue([version(1, "PUBLICADA")]);
        mocks.prepare.mockRejectedValue({ message: "Sin permiso" });
        render(<ConfiguracionPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Habilitar edición" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Sin permiso"));
        expect(alertSpy).not.toHaveBeenCalledWith("success", expect.anything());
    });
});
