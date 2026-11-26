import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { IncidenciasPage } from "../incidencias/incidencias-page";
import { EvidenciasPage } from "./evidencias-page";

const mocks = vi.hoisted(() => ({ evidenceList: vi.fn(), incidentList: vi.fn() }));
vi.mock("./evidencias.service", () => ({
    evidenciasService: {
        getCollaboratorOptions: async () => [],
        getTypes: async () => [
            { id: 1, nombre: "Llamada", categoria: "LLAMADA", estadoNombre: "ACTIVO" },
            { id: 2, nombre: "Tarjeta", categoria: "TARJETA_TERCERO", estadoNombre: "ACTIVO" },
            { id: 3, nombre: "Calificación", categoria: "CALIFICACION", estadoNombre: "ACTIVO" },
            { id: 4, nombre: "Otro", categoria: "OTRO", estadoNombre: "ACTIVO" },
        ],
        getList: mocks.evidenceList,
        getCallContext: async () => ({ idUsuario: 1, idColaborador: 2, puedeRegistrar: true, puedeAprobar: true }),
        getCardContext: async () => ({ idUsuario: 1, idColaborador: 2, puedeRegistrar: true, puedeAprobar: true }),
        getCallsContext: async () => ({ idUsuario: 1, idColaborador: 2, puedeRegistrar: true, puedeAprobar: true }),
    },
}));
vi.mock("../incidencias/incidencias.service", () => ({
    incidenciasService: {
        getCatalog: async () => ({
            tipos: [
                { id: 1, categoria: "PENALIDAD" },
                { id: 2, categoria: "AUDITORIA_PAGO" },
            ],
            reportantes: [{ id: 1 }],
            responsables: [],
            penalidades: [],
        }),
        getList: mocks.incidentList,
    },
}));
vi.mock("../colaboradores/colaboradores.service", () => ({ colaboradoresService: { getList: async () => ({ items: [] }) } }));

vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/base/buttons/button", () => ({
    Button: ({ children, onClick, isDisabled }: { children: ReactNode; onClick?: () => void; isDisabled?: boolean }) => (
        <button disabled={isDisabled} onClick={onClick}>
            {children}
        </button>
    ),
}));
vi.mock("@/components/base/input/input", () => ({ Input: () => null }));
vi.mock("@/components/base/select/select", () => ({ Select: () => null }));
vi.mock("@/components/shared/data-table", () => ({
    DataTable: ({ data, toolbar }: { data: unknown; toolbar?: ReactNode }) => (
        <>
            {toolbar}
            <pre>{JSON.stringify(data)}</pre>
        </>
    ),
}));
vi.mock("./evidencia-popup", () => ({
    EvidenciaPopup: ({ isOpen, inline, heading, types }: { isOpen: boolean; inline: boolean; heading: string; types: Array<{ categoria: string }> }) =>
        isOpen ? (
            <div data-testid="evidence-form">
                {heading} {inline ? "visible" : "modal"} {types.map((item) => item.categoria).join(",")}
            </div>
        ) : null,
}));
vi.mock("./evidencia-detail-modal", () => ({ EvidenciaDetailModal: () => null }));
vi.mock("./llamada-form", () => ({
    LlamadaForm: ({ onSave }: { onSave: () => void }) => (
        <div data-testid="evidence-form">
            Registrar llamada visible LLAMADA<button onClick={onSave}>Guardar llamada</button>
        </div>
    ),
}));
vi.mock("./calificaciones-page", () => ({ CalificacionesPage: () => <h1>Calificaciones</h1> }));
vi.mock("./referidos-page", () => ({ ReferidosPage: () => <h1>Referidos</h1> }));
vi.mock("./tarjeta-tercero-form", () => ({
    TarjetaTerceroForm: () => <div data-testid="evidence-form">Subir tarjeta de terceros visible TARJETA_TERCERO</div>,
}));
vi.mock("../incidencias/incidencia-popup", () => ({
    IncidenciaPopup: ({ isOpen, inline, catalog }: { isOpen: boolean; inline: boolean; catalog: { tipos: Array<{ categoria: string }> } }) =>
        isOpen ? (
            <div data-testid="incident-form">
                {inline ? "visible" : "modal"} {catalog.tipos.map((item) => item.categoria).join(",")}
            </div>
        ) : null,
}));
vi.mock("../incidencias/incidencia-detail-modal", () => ({ IncidenciaDetailModal: () => null }));

const evidenceResult = () => ({
    items: [],
    totalPages: 1,
    resumen: { borradores: 0, pendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 },
});
const incidentResult = () => ({
    items: [],
    totalPages: 1,
    resumen: { recibidosPendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, totalDescuentosAprobados: 0, totalBonosReportantes: 0 },
});
describe("Bandejas operativas legacy", () => {
    it("la pantalla individual mantiene su tipo al consultar y limpiar", async () => {
        const type = {
            id: 4,
            codigo: "BONO_PRUEBA",
            nombre: "Bono prueba",
            categoria: "OTRO" as const,
            estadoNombre: "ACTIVO",
            conceptoNombre: null,
            requiereBeneficiario: true,
            requiereResponsable: false,
            requiereCliente: false,
            requiereOperacion: false,
            configuracion: {},
        };
        render(<EvidenciasPage category="OTRO" fixedType={type} />);
        await screen.findByTestId("evidence-form");
        expect(screen.getByTestId("evidence-form")).toHaveTextContent("Registrar bono prueba");
        await waitFor(() => expect(mocks.evidenceList).toHaveBeenLastCalledWith(expect.objectContaining({ category: "OTRO", typeId: 4 })));
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await waitFor(() => expect(mocks.evidenceList).toHaveBeenLastCalledWith(expect.objectContaining({ category: "OTRO", typeId: 4 })));
    });
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.evidenceList.mockResolvedValue(evidenceResult());
        mocks.incidentList.mockResolvedValue(incidentResult());
    });
    afterEach(cleanup);
    it("Llamadas mantiene el formulario visible al entrar y después de guardar", async () => {
        render(<EvidenciasPage category="LLAMADA" />);
        expect(screen.getByTestId("evidence-form")).toHaveTextContent("Registrar llamada visible LLAMADA");
        expect(screen.queryByRole("button", { name: "Nueva llamada" })).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
        await waitFor(() => expect(mocks.evidenceList.mock.lastCall?.[0]).toMatchObject({ category: "LLAMADA", typeId: 0, page: 1 }));
        const requests = mocks.evidenceList.mock.calls.length;
        fireEvent.click(screen.getByRole("button", { name: "Guardar llamada" }));
        await waitFor(() => expect(mocks.evidenceList.mock.calls.length).toBeGreaterThan(requests));
        expect(screen.getByTestId("evidence-form")).toBeVisible();
        expect(screen.queryByText("Borradores")).toBeNull();
    });
    it("Tarjetas erróneas no mezcla el catálogo de llamadas", async () => {
        render(<EvidenciasPage category="TARJETA_TERCERO" />);
        expect(await screen.findByTestId("evidence-form")).toHaveProperty("textContent", "Subir tarjeta de terceros visible TARJETA_TERCERO");
        expect(screen.queryByRole("button", { name: "Nueva tarjeta" })).toBeNull();
        expect(screen.queryByText("Borradores")).toBeNull();
        expect(screen.queryByRole("button", { name: "Consultar" })).toBeNull();
    });
    it("Llamadas conserva su categoría con filtros homologados y aplica cambios automáticamente", async () => {
        render(<EvidenciasPage category="LLAMADA" />);
        expect(screen.getByRole("heading", { name: "Llamadas", level: 1 })).toBeTruthy();
        await screen.findByTestId("evidence-form");
        expect(screen.getByRole("button", { name: "Limpiar" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
        expect(screen.getByRole("heading", { name: "Filtros de Búsqueda" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Consultar" })).toBeNull();
        await waitFor(() => expect(mocks.evidenceList.mock.lastCall?.[0]).toMatchObject({ category: "LLAMADA", typeId: 0, page: 1 }));
        expect(screen.getByTestId("evidence-form").textContent).toContain("LLAMADA");
    });
    it("Referidos abre su bandeja específica sin el formulario genérico", () => {
        render(<EvidenciasPage category="REFERIDO" />);
        expect(screen.getByRole("heading", { name: "Referidos", level: 1 })).toBeTruthy();
        expect(screen.queryByTestId("evidence-form")).toBeNull();
        expect(mocks.evidenceList).not.toHaveBeenCalled();
    });
    it("Auditoría conserva bandejas y limita el nuevo reporte a su catálogo", async () => {
        render(<IncidenciasPage />);
        fireEvent.click(screen.getByRole("button", { name: "Auditoría de pagos" }));
        await waitFor(() => expect(mocks.incidentList.mock.lastCall?.[0]).toMatchObject({ category: "AUDITORIA_PAGO", tray: "RECIBIDOS" }));
        expect(screen.queryByRole("button", { name: "Nuevo reporte" })).toBeNull();
        expect(screen.queryByTestId("incident-form")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Enviados" }));
        expect(screen.queryByTestId("incident-form")).toBeNull();
    });
    it("no sustituye la bandeja nueva con una respuesta obsoleta", async () => {
        let resolveOld!: (value: ReturnType<typeof evidenceResult>) => void;
        mocks.evidenceList.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveOld = resolve;
                }),
        );
        const { rerender } = render(<EvidenciasPage />);
        await waitFor(() => expect(mocks.evidenceList).toHaveBeenCalledTimes(1));
        rerender(<EvidenciasPage category="LLAMADA" />);
        await waitFor(() => expect(mocks.evidenceList).toHaveBeenCalledTimes(2));
        const old = evidenceResult();
        old.resumen.pendientes = 999;
        await act(async () => {
            resolveOld(old);
        });
        expect(screen.queryByText("999")).toBeNull();
    });
    it("Calificaciones abre su bandeja específica sin formulario genérico", () => {
        render(<EvidenciasPage category="CALIFICACION" />);
        expect(screen.getByRole("heading", { name: "Calificaciones", level: 1 })).toBeTruthy();
        expect(screen.queryByTestId("evidence-form")).toBeNull();
        expect(mocks.evidenceList).not.toHaveBeenCalled();
    });
    it.each([["OTRO", "Otros bonos"]] as const)("abre %s directamente sin selectores de navegación", async (category, title) => {
        render(<EvidenciasPage category={category} />);
        expect(screen.getByRole("heading", { name: title, level: 1 })).toBeTruthy();
        await waitFor(() => expect(mocks.evidenceList.mock.lastCall?.[0]).toMatchObject({ category, page: 1 }));
        expect((await screen.findByTestId("evidence-form")).textContent).toContain(category);
        expect(screen.queryByRole("button", { name: "Llamadas" })).toBeNull();
        expect(screen.queryByLabelText("Opciones de evidencias")).toBeNull();
    });
    it("mantiene Todos los registros sin formulario específico y permite alta general", async () => {
        render(<EvidenciasPage />);
        expect(screen.getByRole("heading", { name: "Todos los registros", level: 1 })).toBeTruthy();
        await waitFor(() => expect(mocks.evidenceList).toHaveBeenCalled());
        expect((await screen.findByTestId("evidence-form")).textContent).toContain("visible");
        expect(screen.queryByRole("button", { name: "Nuevo registro" })).toBeNull();
    });
    it("hace visible un error de acceso en Incidencias", async () => {
        mocks.incidentList.mockRejectedValue(new Error("Sin acceso a incidencias"));
        render(<IncidenciasPage />);
        expect((await screen.findByRole("alert", { hidden: true })).textContent).toContain("Sin acceso a incidencias");
        expect(screen.getAllByText("Resumen no disponible")).toHaveLength(4);
    });
});
