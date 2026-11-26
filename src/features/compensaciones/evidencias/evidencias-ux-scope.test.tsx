import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import { EvidenciaPopup } from "./evidencia-popup";
import { EvidenciasPage } from "./evidencias-page";
import type { EvidenciaEvento, EvidenciaTipo } from "./evidencias.types";

const profile = vi.hoisted(() => ({ isAdvisor: true, isAdministrator: false, isResolving: false, userId: 24 }));
const service = vi.hoisted(() => ({
    getTypes: vi.fn(),
    getCollaboratorOptions: vi.fn(),
    getList: vi.fn(),
    getInnovationImplementation: vi.fn(),
    create: vi.fn(),
    send: vi.fn(),
    resolve: vi.fn(),
    searchTiktokOperations: vi.fn(),
}));
const adminService = vi.hoisted(() => ({ get: vi.fn(), resolve: vi.fn() }));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: adminService }));
vi.mock("./evidencias.service", () => ({ evidenciasService: service }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => profile,
    advisorCanRegisterBonus: (code: string) => ["PROPUESTA_INNOVACION", "TIKTOK_LIVE"].includes(code),
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({ useClienteLookup: () => ({ result: null, isLoading: false }) }));

const innovation: EvidenciaTipo = {
    id: 5,
    codigo: "PROPUESTA_INNOVACION",
    nombre: "Innovación",
    categoria: "OTRO",
    conceptoNombre: "Bono",
    requiereBeneficiario: true,
    requiereResponsable: false,
    requiereCliente: false,
    requiereOperacion: false,
    configuracion: {},
    estadoNombre: "ACTIVO",
};
const collaborators = [{ id: 15, nombreCompleto: "ATC propio", numeroDocumento: "99990001" }];
const event = {
    id: 7,
    tipoCodigo: "PROPUESTA_INNOVACION",
    tipoNombre: "Innovación",
    categoria: "OTRO",
    estado: "PENDIENTE",
    fechaEvento: "2026-10-18T20:32:00Z",
    usuarioRegistraId: 24,
    usuarioRegistraNombre: "ATC propio",
    beneficiarioNombre: "ATC propio",
    beneficiarioDocumento: "99990001",
    importeAprobado: null,
    tarifaRegistro: null,
    titulo: "Mejor atención",
    descripcion: "Proceso simplificado",
    datos: {},
    evidencia: [],
    revisiones: [],
    referencias: [],
} as unknown as EvidenciaEvento;

beforeEach(() => {
    vi.resetAllMocks();
    profile.isAdvisor = true;
    profile.isAdministrator = false;
    profile.userId = 24;
    service.getTypes.mockResolvedValue([innovation]);
    service.getCollaboratorOptions.mockResolvedValue(collaborators);
    service.getList.mockResolvedValue({
        items: [event],
        resumen: { borradores: 0, pendientes: 1, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 },
        totalPages: 1,
    });
    service.resolve.mockResolvedValue({});
    adminService.get.mockResolvedValue({
        id: 7,
        version: "revision-1",
        puede_aprobar: true,
        puede_revisar: true,
        puede_observar: true,
        fuentes: [],
        motivo: "",
        requiere_implementacion: false,
    });
    adminService.resolve.mockResolvedValue({ id: 7 });
    service.getInnovationImplementation.mockResolvedValue({ comprobada: false, puedeRevisar: false, bloqueado: false, constancia: null, version: "test" });
});
afterEach(cleanup);

it("mantiene descripción obligatoria compacta y sincroniza el editor ampliado", async () => {
    render(<EvidenciaPopup inline isOpen types={[innovation]} collaborators={collaborators} onClose={vi.fn()} onSave={vi.fn()} />);
    const description = screen.getByRole("textbox", { name: /^Descripción/ });
    expect(description).toBeRequired();
    fireEvent.change(description, { target: { value: "Primera línea" } });
    fireEvent.click(screen.getByRole("button", { name: "Ampliar nota" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar nota" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Descripción/ }), { target: { value: "Primera línea\nSegunda línea" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver al formulario" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("textbox", { name: /^Descripción/ })).toHaveValue("Primera línea Segunda línea");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(service.create).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenLastCalledWith("validation", "El título de la propuesta es obligatorio.");
});

it.each([false])("bandeja genérica conserva los filtros en tabla compacta (TikTok=%s)", async (tiktok) => {
    profile.isAdvisor = tiktok;
    const type = { ...innovation, codigo: "TIKTOK_LIVE", nombre: "TikTok Live", requiereOperacion: true };
    service.getTypes.mockResolvedValue([tiktok ? type : innovation]);
    render(<EvidenciasPage category={tiktok ? "OTRO" : ""} fixedType={tiktok ? type : undefined} />);
    const heading = await screen.findByRole("heading", { name: tiktok ? "Registrar TikTok Live" : "Registrar evidencia" });
    expect(screen.getByText("Borradores").compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const table = screen.getByRole("table");
    expect(table.closest(".min-w-0")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Desde" }).closest(".border-b")).toHaveClass("px-3", "py-2.5");
    expect(screen.getByRole("group", { name: "Hasta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
    await waitFor(() => expect(service.getList).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: tiktok ? "Ver detalle de evidencia" : "Revisar evidencia" })).toBeInTheDocument();
});

it("TikTok separa cliente/DNI y bloquea el registro sin imagen", async () => {
    service.searchTiktokOperations.mockResolvedValue({
        items: [
            {
                id: 81,
                codigo: "OP-81",
                cliente: "Cliente TikTok",
                dni: "88880002",
                id_cliente: 62,
                servicio: "EFECTIVIZACION",
                monto: 2500,
                fecha_deposito: "2026-10-18T20:32:00Z",
                elegible: true,
            },
        ],
    });
    render(
        <EvidenciaPopup
            inline
            isOpen
            types={[{ ...innovation, codigo: "TIKTOK_LIVE", requiereOperacion: true }]}
            collaborators={collaborators}
            onClose={vi.fn()}
            onSave={vi.fn()}
        />,
    );
    fireEvent.change(await screen.findByRole("textbox", { name: /Operación/ }), { target: { value: "OP-81" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    const name = await screen.findByText("Cliente TikTok");
    expect(name.tagName).toBe("P");
    expect(name.nextElementSibling).toHaveTextContent("DNI 88880002");
    expect(screen.getByText("18/10/2026").nextElementSibling).toHaveTextContent("3:32");
    fireEvent.click(screen.getByRole("button", { name: "Usar esta operación" }));
    expect(screen.getByRole("textbox", { name: /Nro\. Documento/ })).toHaveValue("88880002");
    expect(screen.getByRole("button", { name: "Registrar esta operación" })).toBeDisabled();
});

it("ATC conserva detalle sin acciones administrativas", async () => {
    await act(async () => {
        render(<EvidenciaDetailModal item={event} onClose={vi.fn()} onChanged={vi.fn()} />);
    });
    for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.getByText("18/10/2026").nextElementSibling).toHaveTextContent("3:32");
});

it("admin revisa con versión sin omitir el expediente administrativo", async () => {
    profile.isAdvisor = false;
    profile.isAdministrator = true;
    profile.userId = 1;
    service.getInnovationImplementation.mockResolvedValue({
        comprobada: true,
        puedeRevisar: true,
        bloqueado: false,
        version: "test",
        constancia: { fecha: "2026-10-18", evidencia: "Implementación verificada", motivo: "Prueba" },
    });
    const onChanged = vi.fn();
    render(<EvidenciaDetailModal item={event} onClose={vi.fn()} onChanged={onChanged} />);
    fireEvent.change(await screen.findByRole("textbox", { name: /Comentario de revisión/ }), { target: { value: "Idea revisada" } });
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await waitFor(() =>
        expect(adminService.resolve).toHaveBeenCalledWith(
            expect.objectContaining({ id: 7, version: "revision-1", action: "APROBADO", reason: "Idea revisada" }),
        ),
    );
    expect(service.resolve).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledOnce();
});

it("Administración consulta las propuestas sin formulario de registro: no gana ni registra bonos", async () => {
    profile.isAdvisor = false;
    profile.isAdministrator = true;
    profile.userId = 1;
    render(<EvidenciasPage category="OTRO" fixedType={innovation} />);
    await screen.findByText("Mejor atención");
    expect(screen.queryByRole("heading", { name: "Registrar Propuesta de Innovación" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /^Descripción/ })).toBeNull();
});
