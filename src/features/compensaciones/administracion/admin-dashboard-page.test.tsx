import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { AdminDashboardPage } from "./admin-dashboard-page";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    profile: { isAdministrator: true, isResolving: false, userId: 1 },
    session: {
        isLoading: false,
        navigationError: "",
        navegacion: { rutas_permitidas: ["/compensaciones/asistencia/"] } as { rutas_permitidas: string[] } | null,
    },
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => mocks.session }));

vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));
vi.mock("./admin-dashboard.service", async (original) => ({
    ...(await original<typeof import("./admin-dashboard.service")>()),
    adminDashboardService: { listar: mocks.list },
    adminMesLima: () => "2026-11",
}));
// Aislar los overlays; los filtros y las transiciones de consulta se ejercitan desde la página.
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <input aria-label="Periodo" value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));
vi.mock("@/components/shared/data-table", () => ({
    DataTable: (props: {
        toolbar: ReactNode;
        data: Record<string, unknown>[];
        renderActions: (row: Record<string, unknown>) => ReactNode;
        onPageChange: (page: number) => void;
        onPageSizeChange: (size: number) => void;
        page: number;
        totalPages: number;
        isLoading: boolean;
        emptyMessage: string;
    }) => (
        <>
            <div>{props.toolbar}</div>
            <div aria-label="Resultados" aria-busy={props.isLoading}>
                {props.data.map((row) => (
                    <div key={String(row.id)}>
                        {String(row.tipo)}
                        {props.renderActions(row)}
                    </div>
                ))}
                {!props.isLoading && !props.data.length && <p>{props.emptyMessage}</p>}
                <p>
                    Página {props.page} de {props.totalPages}
                </p>
                <button onClick={() => props.onPageChange(2)}>Siguiente</button>
                <select aria-label="Tamaño" onChange={(event) => props.onPageSizeChange(Number(event.target.value))}>
                    {[20, 50, 100].map((value) => (
                        <option key={value}>{value}</option>
                    ))}
                </select>
            </div>
        </>
    ),
}));

const panel = {
    ambito: "GLOBAL",
    periodo: { mes: "2026-11-01", estado: "ABIERTO" },
    catalogos: { sedes: [{ id: 3, nombre: "Lima" }], roles: [{ id: 4, nombre: "Atención" }] },
    kpis: { eventos_pendientes: 17, otro_revisor: 2 },
    items: [
        { id: "a", tipo: "Corrección", rol: "Atención", sede: "Lima", pendientes: 17, otro_revisor: 2, destino: "/compensaciones/asistencia?estado=PENDIENTE" },
        { id: "b", tipo: "Evento", rol: "Atención", sede: "Lima", pendientes: 1, otro_revisor: 0, destino: "/compensaciones/liquidaciones" },
    ],
    total: 32,
    total_paginas: 2,
};
const mount = () =>
    render(
        <MemoryRouter>
            <AdminDashboardPage />
        </MemoryRouter>,
    );
const metric = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.profile, { isAdministrator: true, isResolving: false, userId: 1 });
    Object.assign(mocks.session, { isLoading: false, navigationError: "", navegacion: { rutas_permitidas: ["/compensaciones/asistencia/"] } });
    mocks.list.mockResolvedValue(panel);
});
afterEach(cleanup);
describe("Dashboard de gestión global", () => {
    it("muestra el alcance administrativo, nulos reales y solo enlaces asignados", async () => {
        mount();
        await screen.findByText("Corrección");
        expect(screen.getByRole("heading", { name: "Dashboard" })).toBeVisible();
        expect(screen.getByText("Gestión Global")).toBeVisible();
        expect(within(metric("Eventos Pendientes")).getByText("17")).toBeVisible();
        expect(screen.queryByText(/Correcciones Pendientes|Liquidaciones Pendientes/)).toBeNull();
        expect(screen.getAllByRole("link", { name: "Abrir" })).toHaveLength(1);
        expect(screen.getByRole("link", { name: "Abrir" })).toHaveAttribute("href", "/compensaciones/asistencia?estado=PENDIENTE");
        expect(screen.queryByRole("button", { name: /aprobar|guardar|rechazar/i })).toBeNull();
        expect(screen.queryByText(/S\/|mis bonos/i)).toBeNull();
    });
    it("filtra y pagina en servidor, reinicia página y limpia al mes actual", async () => {
        mount();
        await screen.findByText("Corrección");
        expect(mocks.list).toHaveBeenLastCalledWith({ mes: "2026-11", sede: null, rol: null, pagina: 1, tamano: 20 });
        fireEvent.click(screen.getByText("Siguiente"));
        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 })));
        fireEvent.change(screen.getByLabelText("Sede"), { target: { value: "3" } });
        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ sede: 3, pagina: 1 })));
        fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "4" } });
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-10" } });
        fireEvent.change(screen.getByLabelText("Tamaño"), { target: { value: "50" } });
        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ mes: "2026-10", sede: 3, rol: 4, pagina: 1, tamano: 50 }));
        fireEvent.change(screen.getByLabelText("Tamaño"), { target: { value: "100" } });
        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ tamano: 100 })));
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ mes: "2026-11", sede: null, rol: null, pagina: 1, tamano: 100 }));
        const calls = mocks.list.mock.calls.length;
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(calls + 1));
    });
    it("no consulta durante resolución del perfil o de permisos ni para un perfil no admin", async () => {
        mocks.profile.isResolving = true;
        const view = mount();
        expect(mocks.list).not.toHaveBeenCalled();
        mocks.profile.isResolving = false;
        mocks.profile.isAdministrator = false;
        view.rerender(
            <MemoryRouter>
                <AdminDashboardPage />
            </MemoryRouter>,
        );
        expect(await screen.findByRole("status")).toHaveTextContent("403");
        expect(mocks.list).not.toHaveBeenCalled();
        mocks.profile.isAdministrator = true;
        mocks.session.isLoading = true;
        view.rerender(
            <MemoryRouter>
                <AdminDashboardPage />
            </MemoryRouter>,
        );
        expect(mocks.list).not.toHaveBeenCalled();
        mocks.session.isLoading = false;
        view.rerender(
            <MemoryRouter>
                <AdminDashboardPage />
            </MemoryRouter>,
        );
        expect(mocks.list).toHaveBeenCalledTimes(1);
    });
    it("no consulta si falló la verificación de permisos", async () => {
        mocks.session.navigationError = "Permisos no disponibles";
        mount();
        await waitFor(() => expect(screen.getByText("Permisos no disponibles")).toBeVisible());
        expect(mocks.list).not.toHaveBeenCalled();
    });
    it("carga y falla sin inventar KPI cero; permite reintentar", async () => {
        let reject!: (cause: Error) => void;
        mocks.list.mockImplementationOnce(
            () =>
                new Promise((_, fail) => {
                    reject = fail;
                }),
        );
        mount();
        expect(screen.getByRole("status")).toHaveTextContent("Cargando");
        expect(within(metric("Eventos Pendientes")).getByText("—")).toBeVisible();
        await act(async () => reject(new Error("Servicio no disponible")));
        await waitFor(() => expect(screen.getByText("Servicio no disponible")).toBeVisible());
        expect(within(metric("Eventos Pendientes")).getByText("—")).toBeVisible();
        expect(screen.queryByText("No hay pendientes para estos filtros")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await screen.findByText("Corrección");
    });
    it("descarta éxitos y errores antiguos al cambiar filtros", async () => {
        let resolve!: (data: unknown) => void;
        let reject!: (cause: Error) => void;
        mocks.list
            .mockImplementationOnce(
                () =>
                    new Promise((done) => {
                        resolve = done;
                    }),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((_, fail) => {
                        reject = fail;
                    }),
            );
        mount();
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-10" } });
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-09" } });
        await screen.findByText("Corrección");
        await act(async () => {
            resolve({ ...panel, kpis: { ...panel.kpis, eventos_pendientes: 999 } });
            reject(new Error("Error antiguo"));
        });
        expect(screen.queryByText("999")).toBeNull();
        expect(screen.queryByText("Error antiguo")).toBeNull();
        expect(within(metric("Eventos Pendientes")).getByText("17")).toBeVisible();
    });
    it("descarta datos del usuario anterior al cambiar la sesión", async () => {
        let resolve!: (data: unknown) => void;
        mocks.list.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        const view = mount();
        mocks.profile.userId = 2;
        view.rerender(
            <MemoryRouter>
                <AdminDashboardPage />
            </MemoryRouter>,
        );
        await screen.findByText("Corrección");
        await act(async () => resolve({ ...panel, items: [{ ...panel.items[0], tipo: "Usuario anterior" }] }));
        expect(screen.queryByText("Usuario anterior")).toBeNull();
    });
});
