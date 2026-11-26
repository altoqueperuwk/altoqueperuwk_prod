import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciasPage } from "./evidencias-page";
import type { EvidenciaEvento, EvidenciaTipo } from "./evidencias.types";

const mocks = vi.hoisted(() => ({
    getTypes: vi.fn(),
    getCollaboratorOptions: vi.fn(),
    getList: vi.fn(),
    create: vi.fn(),
    send: vi.fn(),
    registerInnovation: vi.fn(),
    profile: { isAdvisor: true, isResolving: false, userId: 24 },
}));
vi.mock("./evidencias.service", () => ({ evidenciasService: mocks }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => mocks.profile,
    advisorCanRegisterBonus: (code: string) => code === "PROPUESTA_INNOVACION",
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({ useClienteLookup: () => ({ result: null, isLoading: false }) }));
vi.mock("./evidencia-detail-modal", () => ({ EvidenciaDetailModal: () => null }));

const type: EvidenciaTipo = {
    id: 5,
    codigo: "PROPUESTA_INNOVACION",
    nombre: "Propuesta de innovacion aprobada",
    categoria: "OTRO",
    conceptoNombre: "Bono innovación",
    requiereBeneficiario: true,
    requiereResponsable: false,
    requiereCliente: false,
    requiereOperacion: false,
    configuracion: {},
    estadoNombre: "ACTIVO",
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.profile.userId = 24;
    mocks.profile.isResolving = false;
    mocks.getTypes.mockResolvedValue([type]);
    mocks.getCollaboratorOptions.mockResolvedValue([{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }]);
    mocks.getList.mockResolvedValue({
        items: [],
        resumen: { borradores: 0, pendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 },
        totalPages: 1,
    });
    mocks.registerInnovation.mockResolvedValue(8);
});
afterEach(cleanup);
const open = () => render(<EvidenciasPage category="OTRO" fixedType={type} />);

it.each([
    ["BORRADOR", 24, true, true],
    ["PENDIENTE", 24, false, true],
    ["BORRADOR", 30, false, false],
    ["PENDIENTE", 30, false, false],
] as const)("acciones del estado %s y autor %s respetan lo propio (enviar: %s, editar y eliminar: %s)", async (estado, author, editable, manageable) => {
    const row: EvidenciaEvento = {
        id: 8,
        idTipoEvento: 5,
        tipoCodigo: "PROPUESTA_INNOVACION",
        tipoNombre: "Innovación",
        categoria: "OTRO",
        estado,
        titulo: "Idea de prueba",
        descripcion: "Detalle de prueba",
        usuarioRegistraId: author,
        usuarioRegistraNombre: "Autor",
        fechaEvento: "2026-11-06T17:00:00Z",
        datos: {},
        evidencia: [],
        referencias: [],
        revisiones: [],
        importeAprobado: 0,
        conceptoNombre: "Innovación",
        beneficiarioNombre: "Autor",
        beneficiarioDocumento: "99990001",
        responsableNombre: null,
        sucursalOrigenNombre: "Lince",
        periodoImputacion: "2026-11-01",
        fechaRegistro: "2026-11-06T17:00:00Z",
        baseCalculo: null,
        cantidad: null,
        tarifaAplicada: null,
    };
    mocks.getList.mockResolvedValue({
        items: [row],
        resumen: { borradores: 1, pendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 },
        totalPages: 1,
    });
    open();
    await screen.findByText("Idea de prueba");
    expect(Boolean(screen.queryByRole("button", { name: "Enviar propuesta" }))).toBe(editable);
    expect(Boolean(screen.queryByRole("button", { name: "Editar propuesta" }))).toBe(manageable);
    expect(Boolean(screen.queryByRole("button", { name: "Eliminar propuesta" }))).toBe(manageable);
    if (editable) {
        fireEvent.click(screen.getByRole("button", { name: "Enviar propuesta" }));
        expect(screen.getByRole("dialog", { name: "Enviar propuesta" })).toBeInTheDocument();
        expect(mocks.send).not.toHaveBeenCalled();
    }
});

it("reintenta el mismo contenido con su clave sin crear otra propuesta", async () => {
    mocks.registerInnovation.mockRejectedValueOnce(new Error("Respuesta no confirmada")).mockResolvedValueOnce(8);
    open();
    await screen.findByRole("textbox", { name: /^Título/ });
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Propuesta" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Detalle" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Respuesta no confirmada"));
    const key = mocks.registerInnovation.mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.registerInnovation).toHaveBeenCalledTimes(2));
    expect(mocks.registerInnovation.mock.calls[1][1]).toBe(key);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
});

it("ignora la confirmación de una propuesta de la sesión anterior", async () => {
    let finish!: (id: number) => void;
    mocks.registerInnovation.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const view = open();
    await screen.findByRole("textbox", { name: /^Título/ });
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Propuesta" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Detalle" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.registerInnovation).toHaveBeenCalledOnce());
    mocks.profile.userId = 30;
    view.rerender(<EvidenciasPage category="OTRO" fixedType={type} />);
    await act(async () => finish(8));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /^Título/ })).toHaveValue("");
});

it("ATC presenta KPI, formulario ancho y tabla en ese orden, sin recuadro de notas", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Información de Propuesta de Innovación" }));
    expect(await screen.findByRole("dialog", { name: "Información de Propuesta de Innovación" })).toBeInTheDocument();
    expect(screen.getByText(/Administración define el monto para Jefatura/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    const heading = await screen.findByRole("heading", { name: "Registrar Propuesta de Innovación" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Propuesta de Innovación");
    const summary = screen.getByLabelText("Resumen de propuestas");
    const table = screen.getByRole("region", { name: "Propuestas registradas" });
    expect(summary.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.queryByText("Notas y sustento adicional")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: /^Título/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Descripción/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /^Enlace de evidencia/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Usuario/ })).toBeNull();
    const title = screen.getByRole("textbox", { name: /^Título/ });
    const description = screen.getByRole("textbox", { name: /^Descripción/ });
    const date = screen.getByRole("group", { name: /^Fecha/ });
    expect(title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(description.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.queryByText("ATC propio")).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    // React Aria incluye controles nativos ocultos para formularios/autocompletado.
    for (const input of document.querySelectorAll('input[type="date"]')) expect(input).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("group", { name: "Desde" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Hasta" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Propuesta" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Colaborador" })).toBeNull();
});

it("conserva atribución propia, borrador/envío y actualización del listado", async () => {
    open();
    await screen.findByRole("heading", { name: "Registrar Propuesta de Innovación" });
    await screen.findByRole("textbox", { name: /^Título/ });
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Mejorar la atención" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Una propuesta para simplificar el proceso." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.registerInnovation).toHaveBeenCalledOnce());
    expect(mocks.registerInnovation).toHaveBeenCalledWith(
        expect.objectContaining({
            idBeneficiario: 15,
            idTipoEvento: 5,
            titulo: "Mejorar la atención",
            descripcion: "Una propuesta para simplificar el proceso.",
        }),
        expect.any(String),
        true,
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.registerInnovation.mock.calls[0][0].fechaEvento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(2));
});

it("aplica los filtros automáticamente y restaura el rango mensual al limpiar", async () => {
    open();
    await screen.findByRole("heading", { name: "Registrar Propuesta de Innovación" });
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText("Título o descripción"), { target: { value: "Proceso nuevo" } });
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Proceso nuevo", typeId: 5, page: 1 })));
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() =>
        expect(mocks.getList).toHaveBeenLastCalledWith(
            expect.objectContaining({ search: "", typeId: 5, from: expect.stringMatching(/^\d{4}-\d{2}-01$/), to: expect.any(String), page: 1 }),
        ),
    );
    expect(screen.getByPlaceholderText("Título o descripción")).toHaveValue("");
});

it("Cancelar limpia el registro inline sin guardar ni ocultarlo", async () => {
    open();
    await screen.findByRole("textbox", { name: /^Título/ });
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Propuesta sin guardar" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Texto pendiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /^Título/ })).toHaveValue(""));
    expect(screen.getByRole("textbox", { name: /^Descripción/ })).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Registrar Propuesta de Innovación" })).toBeInTheDocument();
    expect(mocks.registerInnovation).not.toHaveBeenCalled();
});
