import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ColaboradoresPage } from "./colaboradores-page";
import type { Colaborador, ColaboradoresResult } from "./colaboradores.types";

const { getList, getCatalogs, getAdminCatalogs, profile } = vi.hoisted(() => ({
    getList: vi.fn(),
    getCatalogs: vi.fn(),
    getAdminCatalogs: vi.fn(),
    profile: { isAdvisor: false, isResolving: false, isStoreManager: false, isAdministrator: false },
}));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => profile }));
vi.mock("./colaboradores.service", () => ({ colaboradoresService: { getList, getCatalogs, getAdminCatalogs } }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ bancos: [], estados: [] }) }));
vi.mock("@/services/sucursal.service", () => ({ sucursalService: { getList: async () => [] } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/base/buttons/button", () => ({
    Button: ({ children, onClick, "aria-label": label }: { children: ReactNode; onClick?: () => void; "aria-label"?: string }) => (
        <button onClick={onClick} aria-label={label}>
            {children}
        </button>
    ),
}));
vi.mock("@/components/shared/filter-bar", () => ({
    FilterBar: ({ hideNew, onNew }: { hideNew: boolean; onNew: () => void }) => <div>{!hideNew && <button onClick={onNew}>Nuevo</button>}</div>,
}));
vi.mock("@/components/base/select/select", () => ({ Select: () => null }));
vi.mock("@/components/shared/data-table", () => ({
    DataTable: ({
        data,
        renderActions,
        toolbar,
    }: {
        data: Record<string, unknown>[];
        renderActions: (row: Record<string, unknown>) => ReactNode;
        toolbar: ReactNode;
    }) => (
        <div data-testid="table">
            {toolbar}
            {data.map((row) => (
                <div key={Number(row.id)}>
                    {String(row.nombreCompleto)}
                    {renderActions(row)}
                </div>
            ))}
        </div>
    ),
}));
vi.mock("./colaborador-popup", () => ({
    ColaboradorPopup: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
        isOpen ? (
            <div>
                Formulario abierto<button onClick={onClose}>Cancelar</button>
            </div>
        ) : null,
}));
vi.mock("./colaborador-ficha-popup", () => ({
    ColaboradorFichaPopup: ({ isOpen, colaborador }: { isOpen: boolean; colaborador: Colaborador }) =>
        isOpen ? <pre data-testid="ficha">{JSON.stringify(colaborador.ficha)}</pre> : null,
}));
vi.mock("./equipos-panel", () => ({ EquiposPanel: () => <div>Gestión de Equipos</div> }));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));

const result = (canEdit = true): ColaboradoresResult => ({
    resumen: { colaboradores: 31, activos: 29, inactivos: 2, sedes: 4 },
    versionContrato: "B2_01",
    fechaReferencia: "2026-10-03",
    puedeCrear: canEdit,
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    items: [
        {
            id: 7,
            idUsuario: 9,
            usuarioNombre: "Asesor",
            usuarioUsername: "asesor",
            tipoDocumento: "DNI",
            numeroDocumento: "12345678",
            nombres: "Asesor",
            apellidoPaterno: "",
            apellidoMaterno: "",
            nombreCompleto: "Asesor de prueba",
            email: "",
            celular: "",
            codigoHuellero: "",
            fechaIngreso: "2026-09-01",
            fechaCese: null,
            motivoCese: "",
            idEstado: 1,
            estadoNombre: "Activo",
            asignacion: null,
            ficha: {
                permisos: { puedeVerFicha: true, puedeEditarFicha: canEdit },
            },
        },
    ],
});

describe("Colaboradores: conexión de pantalla", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        profile.isAdministrator = false;
        profile.isAdvisor = false;
        profile.isStoreManager = false;
        getAdminCatalogs.mockResolvedValue({ cargos: [], jornadas: [], planes: [], sedes: [] });
        getList.mockResolvedValue(result());
        getCatalogs.mockResolvedValue({ cargos: [], jornadas: [], planes: [] });
    });
    afterEach(cleanup);

    it("Admin muestra captura persistente y KPI del servidor sin Equipos", async () => {
        profile.isAdministrator = true;
        render(<ColaboradoresPage />);
        await screen.findByText("Formulario abierto");
        expect(getAdminCatalogs).toHaveBeenCalledOnce();
        expect(getCatalogs).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Equipos" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Nuevo Colaborador" })).toBeNull();
        expect(screen.getByText("31")).toBeTruthy();
        expect(screen.getByText("29")).toBeTruthy();
        expect(screen.getByText("2")).toBeTruthy();
        expect(screen.getByText("4")).toBeTruthy();
        expect(screen.getByTestId("table")).toBeTruthy();
    });
    it("Admin aplica la fecha histórica en servidor y muestra fallo sin contador cero", async () => {
        profile.isAdministrator = true;
        render(<ColaboradoresPage />);
        await screen.findByText("Formulario abierto");
        getList.mockRejectedValueOnce(new Error("Consulta fallida"));
        fireEvent.change(screen.getByLabelText("Vigente al"), { target: { value: "2025-01-31" } });
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Consulta fallida");
        expect(getList).toHaveBeenLastCalledWith(expect.objectContaining({ fechaReferencia: "2025-01-31", page: 1 }));
        expect(screen.queryByText(/0 colaboradores/)).toBeNull();
    });
    it("catálogos SQL95 fallidos bloquean alta y permiten reintento", async () => {
        profile.isAdministrator = true;
        getAdminCatalogs.mockRejectedValueOnce(new Error("Catálogos no disponibles"));
        render(<ColaboradoresPage />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Catálogos no disponibles");
        expect(screen.queryByRole("button", { name: "Nuevo Colaborador" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar Catálogos" }));
        expect(await screen.findByText("Formulario abierto")).toBeTruthy();
    });
    it("jefatura consulta con fecha y no obtiene creación o edición por capacidades antiguas", async () => {
        profile.isStoreManager = true;
        render(<ColaboradoresPage />);
        await waitFor(() => expect(getList).toHaveBeenCalled());
        // Paquete K: el Jefe consulta KPIs y tabla de su equipo; no abre la ficha del colaborador.
        expect(screen.queryByRole("button", { name: "Ver ficha" })).toBeNull();
        expect(getList).toHaveBeenCalledWith(expect.objectContaining({ fechaReferencia: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
        expect(getCatalogs).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Nuevo Colaborador" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Editar colaborador" })).toBeNull();
    });

    it("mantiene la captura al cancelar y permite editar con capacidades", async () => {
        render(<ColaboradoresPage />);
        await screen.findByText("Formulario abierto");
        expect(screen.getByRole("button", { name: "Editar colaborador" })).toBeTruthy();
        expect(screen.getByTestId("table")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(screen.getByText("Formulario abierto")).toBeTruthy();
    });

    it("en consulta de solo lectura oculta creación/edición y conserva la ficha", async () => {
        getList.mockResolvedValue(result(false));
        render(<ColaboradoresPage />);
        await screen.findByRole("button", { name: "Ver ficha" });
        expect(screen.queryByRole("button", { name: "Nuevo" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Editar colaborador" })).toBeNull();
        expect(screen.queryByText("Compensación")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Ver ficha" }));
        expect(screen.getByTestId("ficha").textContent).toContain('"puedeVerFicha":true');
    });

    it("no expone acciones de una fila sin capacidades", async () => {
        const value = result(false);
        value.items[0].ficha = undefined;
        getList.mockResolvedValue(value);
        render(<ColaboradoresPage />);
        await waitFor(() => expect(getList).toHaveBeenCalled());
        expect(screen.queryByRole("button", { name: "Editar colaborador" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Ver ficha" })).toBeNull();
    });

    it("ATC consulta Mi ficha sin catálogos administrativos ni edición aunque un contrato antiguo la habilite", async () => {
        profile.isAdvisor = true;
        render(<ColaboradoresPage />);
        await screen.findByRole("button", { name: "Ver ficha" });
        expect(screen.getByRole("heading", { name: "Mi ficha" })).toBeTruthy();
        expect(getCatalogs).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Nuevo" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Editar colaborador" })).toBeNull();
        expect(screen.queryByText(/Página 1 de/)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Ver ficha" }));
        expect(screen.getByTestId("ficha")).toBeTruthy();
    });
});
