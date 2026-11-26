import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CalificacionesPage } from "./calificaciones-page";
import { EvidenciaPopup } from "./evidencia-popup";
import type { EvidenciaTipo } from "./evidencias.types";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    context: vi.fn(),
    create: vi.fn(),
    send: vi.fn(),
    registerInnovation: vi.fn(),
    qr: vi.fn(),
    profile: { isAdvisor: true, isStoreManager: false, isResolving: false, userId: 24 },
}));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => mocks.profile,
    advisorCanRegisterBonus: (code: string) => code === "PROPUESTA_INNOVACION",
}));
vi.mock("./evidencias.service", () => ({
    evidenciasService: {
        getCallContext: mocks.context,
        create: mocks.create,
        send: mocks.send,
        registerInnovation: mocks.registerInnovation,
    },
}));
vi.mock("./calificacion-list.service", () => ({ calificacionListService: { getRatings: mocks.list } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("./calificaciones-chart", () => ({ CalificacionesChart: () => null }));
vi.mock("./evidencia-detail-modal", () => ({ EvidenciaDetailModal: () => null }));
vi.mock("@/features/atencion/mi-enlace-qr/mi-enlace-qr-acciones", () => ({
    MiEnlaceQrAcciones: () => {
        mocks.qr();
        return <p>QR propio</p>;
    },
}));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({ useClienteLookup: () => ({ result: null, isLoading: false }) }));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <label>
            {label}
            <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    ),
}));
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <label>
            Periodo
            <input type="month" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    ),
}));
const result = () => ({ items: [], total: 0, totalPages: 1, pendientes: 0, aprobados: 0, importeAprobado: 0, asesores: [], ranking: [], distribucion: [] });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.userId = 24;
    mocks.profile.isResolving = false;
    mocks.list.mockResolvedValue(result());
    mocks.context.mockResolvedValue({ idUsuario: 24, idColaborador: 15 });
    mocks.create.mockResolvedValue(8);
    mocks.send.mockResolvedValue({});
});
afterEach(cleanup);

it("espera el perfil antes de cargar calificaciones, contexto o QR", () => {
    mocks.profile.isResolving = true;
    render(<CalificacionesPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando acceso");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.qr).not.toHaveBeenCalled();
});

it("al cambiar de usuario descarta la consulta anterior y recarga el contexto", async () => {
    let finish!: (value: unknown) => void;
    mocks.list.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const view = render(<CalificacionesPage />);
    mocks.profile.userId = 25;
    view.rerender(<CalificacionesPage />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await act(async () => {
        finish({ ...result(), total: 999 });
    });
    expect(screen.queryByText("999")).toBeNull();
    expect(mocks.context).toHaveBeenCalledTimes(2);
});

it("conserva DNI y Cliente visibles antes de Fecha, Asesor y Sede, con Comisión pendiente", async () => {
    mocks.list.mockResolvedValue({
        ...result(),
        items: [
            {
                id: 1,
                datos: { cliente_documento: "12345678", cliente_nombre: "Cliente visible", estrellas: 5 },
                beneficiarioNombre: "Asesor propio",
                fechaEvento: "2026-10-25T14:00:00Z",
                sucursalOrigenNombre: "Sede",
                referencias: [],
                estado: "PENDIENTE",
                importeAprobado: 0,
            },
        ],
    });
    render(<CalificacionesPage />);
    await screen.findByText("Cliente visible");
    const headers = screen.getAllByRole("columnheader").map((node) => node.textContent);
    expect(headers.slice(0, 5)).toEqual(["DNI", "Cliente", "Fecha", "Asesor", "Sede"]);
    expect(headers).toContain("Comisión");
    expect(headers).not.toContain("Ganancia");
    await waitFor(() => expect(screen.getByText("12345678")).toBeVisible());
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText(/S\/\s*0[.,]00/)).toBeVisible());
});

it("sincroniza febrero bisiesto y consulta el rango acotado en servidor", async () => {
    render(<CalificacionesPage />);
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2028-02" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ desde: "2028-02-01", hasta: "2028-02-29" })));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2028-02-10" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ desde: "2028-02-10", hasta: "2028-02-29" })));
    const count = mocks.list.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2028-02-09" } });
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("anterior");
    expect(mocks.list).toHaveBeenCalledTimes(count);
});

it("un alta atómica no confirmada conserva contenido y clave para reintentar", async () => {
    mocks.registerInnovation.mockRejectedValue(new Error("Sin conexión"));
    const saved = vi.fn();
    const type = { id: 5, codigo: "PROPUESTA_INNOVACION", requiereBeneficiario: true } as EvidenciaTipo;
    render(
        <EvidenciaPopup
            isOpen
            inline
            types={[type]}
            collaborators={[{ id: 15, idUsuario: 24, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]}
            onSave={saved}
            onClose={vi.fn()}
        />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Idea válida" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Mejora del proceso" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Sin conexión"));
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /^Título/ })).toHaveValue("Idea válida");
    const key = mocks.registerInnovation.mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.registerInnovation).toHaveBeenCalledTimes(2));
    expect(mocks.registerInnovation.mock.calls[1][1]).toBe(key);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
});

it("Innovación rechaza una única ficha si su identidad explícita pertenece a otro usuario", () => {
    const type = { id: 5, codigo: "PROPUESTA_INNOVACION", requiereBeneficiario: true } as EvidenciaTipo;
    render(
        <EvidenciaPopup
            isOpen
            inline
            types={[type]}
            collaborators={[{ id: 18, idUsuario: 99, nombreCompleto: "Otra persona", numeroDocumento: "99990001" }]}
            onSave={vi.fn()}
            onClose={vi.fn()}
        />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Idea válida" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Mejora del proceso" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("error", expect.stringContaining("ficha"));
});
