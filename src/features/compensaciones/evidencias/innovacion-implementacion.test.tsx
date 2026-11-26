import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento, InnovacionImplementacion } from "./evidencias.types";

const mocks = vi.hoisted(() => ({
    getInnovationImplementation: vi.fn(),
    implementInnovation: vi.fn(),
    resolve: vi.fn(),
    adminGet: vi.fn(),
    adminResolve: vi.fn(),
    profile: { isAdvisor: false, isAdministrator: true, userId: 1 },
}));
vi.mock("./evidencias.service", () => ({ evidenciasService: mocks }));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: { get: mocks.adminGet, resolve: mocks.adminResolve } }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));

const item = (id = 7, estado: EvidenciaEvento["estado"] = "APROBADO"): EvidenciaEvento => ({
    id,
    tipoCodigo: "PROPUESTA_INNOVACION",
    tipoNombre: "Propuesta de Innovación",
    categoria: "OTRO",
    estado,
    usuarioRegistraId: 2,
    idColaboradorBeneficiario: 2,
    fechaEvento: "2026-10-31T12:00:00-05:00",
    datos: {},
    evidencia: [],
    referencias: [],
    revisiones: [],
    importeAprobado: 0,
    tarifaRegistro: null,
    idTipoEvento: 1,
    conceptoNombre: "Innovación",
    beneficiarioNombre: "Asesora",
    beneficiarioDocumento: "12345678",
    responsableNombre: null,
    sucursalOrigenNombre: "Sede",
    periodoImputacion: "2026-10-01",
    titulo: "Propuesta",
    descripcion: "Mejora del proceso",
    baseCalculo: null,
    cantidad: null,
    tarifaAplicada: null,
    usuarioRegistraNombre: "Asesora",
    fechaRegistro: "2026-10-31T12:00:00-05:00",
});
const context: InnovacionImplementacion = { version: "2026-11-01T12:00:00Z", comprobada: false, puedeRevisar: true, bloqueado: false, constancia: null };
beforeEach(() => {
    mocks.profile.isAdvisor = false;
    mocks.profile.isAdministrator = true;
    mocks.getInnovationImplementation.mockResolvedValue(context);
    mocks.implementInnovation.mockResolvedValue({ importe_aprobado: 50 });
    mocks.adminGet.mockImplementation(async (id: number) => ({
        id,
        version: "revision-1",
        estado: "PENDIENTE",
        puede_aprobar: true,
        puede_revisar: true,
        puede_observar: true,
        puede_anular: false,
        bloqueado: false,
        motivo: "",
        fuentes: [],
        automatico: false,
        requiere_implementacion: true,
    }));
    mocks.adminResolve.mockResolvedValue({ id: 7 });
});
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

it("aprobar exige motivo y explica que todavia no habilita comision", async () => {
    render(<EvidenciaDetailModal item={item(7, "PENDIENTE")} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("validation", "Explica el motivo de la decisión (mínimo diez caracteres).");
    expect(screen.getByText("Pendiente de implementación comprobada")).toBeTruthy();
    fireEvent.change(await screen.findByRole("textbox", { name: /Comentario de revisión/ }), { target: { value: "Idea distinta y útil" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await waitFor(() =>
        expect(mocks.adminResolve).toHaveBeenCalledWith(
            expect.objectContaining({ id: 7, version: "revision-1", action: "APROBADO", reason: "Idea distinta y útil" }),
        ),
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
});

it("implementacion pide fecha y motivo; envia version y evita doble clic", async () => {
    let finish!: () => void;
    mocks.implementInnovation.mockImplementation(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    const changed = vi.fn();
    render(<EvidenciaDetailModal item={item()} onClose={vi.fn()} onChanged={changed} />);
    fireEvent.click(await screen.findByRole("button", { name: "Comprobar Implementación" }));
    expect(mocks.implementInnovation).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText(/Fecha de Implementación/), { target: { value: "2026-11-01" } });
    fireEvent.change(await screen.findByRole("textbox", { name: /Motivo de Confirmación/ }), { target: { value: "Ahorro comprobado" } });
    const button = screen.getByRole("button", { name: "Comprobar Implementación" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.implementInnovation).toHaveBeenCalledTimes(1);
    expect(mocks.implementInnovation).toHaveBeenCalledWith(7, context.version, "2026-11-01", "", "Ahorro comprobado");
    finish();
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Implementación Comprobada")).toBeTruthy();
});

it.each([0, 20])("conserva la constancia al recibir importe limitado a S/%s, sin rechazo del cliente", async (amount) => {
    mocks.implementInnovation.mockResolvedValue({ importe_aprobado: amount, comprobada: true });
    const changed = vi.fn();
    const { rerender } = render(<EvidenciaDetailModal item={item()} onClose={vi.fn()} onChanged={changed} />);
    await screen.findByRole("button", { name: "Comprobar Implementación" });
    fireEvent.change(await screen.findByLabelText(/Fecha de Implementación/), { target: { value: "2026-11-01" } });
    fireEvent.change(await screen.findByRole("textbox", { name: /Motivo de Confirmación/ }), { target: { value: "Implementación real" } });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar Implementación" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Implementación Comprobada")).toBeTruthy();
    expect(alertSpy.mock.calls.some(([kind]) => kind === "error")).toBe(false);
    mocks.getInnovationImplementation.mockResolvedValue({
        ...context,
        comprobada: true,
        constancia: {
            fecha: "2026-11-01",
            evidencia: "",
            motivo: "Implementación real",
        },
    });
    rerender(<EvidenciaDetailModal item={{ ...item(), importeAprobado: amount }} onClose={vi.fn()} onChanged={changed} />);
    await screen.findByText("Implementación Comprobada");
    expect(screen.getByText(new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(amount).replace(/\s/g, " "))).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Comprobar Implementación" })).toBeNull();
});

it("ATC, revisor implicado y periodo bloqueado no ofrecen comprobacion", async () => {
    mocks.profile.isAdvisor = true;
    mocks.profile.isAdministrator = false;
    const { rerender } = render(<EvidenciaDetailModal item={item()} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText("Implementación Pendiente");
    expect(screen.queryByRole("button", { name: "Comprobar Implementación" })).toBeNull();
    mocks.profile.isAdvisor = false;
    mocks.profile.isAdministrator = true;
    mocks.getInnovationImplementation.mockResolvedValue({ ...context, puedeRevisar: false });
    rerender(<EvidenciaDetailModal item={item(8)} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText("Implementación Pendiente");
    expect(screen.queryByRole("button", { name: "Comprobar Implementación" })).toBeNull();
    mocks.getInnovationImplementation.mockResolvedValue({ ...context, bloqueado: true });
    rerender(<EvidenciaDetailModal item={item(9)} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText(/Periodo bloqueado/);
    expect(screen.queryByRole("button", { name: "Comprobar Implementación" })).toBeNull();
});

it("error de consulta ofrece reintento y no permite aprobar con permisos desconocidos", async () => {
    mocks.getInnovationImplementation.mockRejectedValueOnce(new Error("No se pudo verificar el permiso"));
    render(<EvidenciaDetailModal item={item(7, "PENDIENTE")} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo verificar el permiso");
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Aprobar" })).toBeTruthy();
});

it("descarta respuesta tardia de otra propuesta", async () => {
    let oldResponse!: (value: InnovacionImplementacion) => void;
    mocks.getInnovationImplementation.mockImplementationOnce(
        () =>
            new Promise<InnovacionImplementacion>((resolve) => {
                oldResponse = resolve;
            }),
    );
    const { rerender } = render(<EvidenciaDetailModal item={item(7)} onClose={vi.fn()} onChanged={vi.fn()} />);
    mocks.getInnovationImplementation.mockResolvedValue({ ...context, puedeRevisar: false });
    rerender(<EvidenciaDetailModal item={item(8)} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByText("Implementación Pendiente");
    oldResponse(context);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Comprobar Implementación" })).toBeNull());
});

it("la innovación de Jefatura permite fijar el importe y lo envía con la sobrecarga de seis argumentos", async () => {
    mocks.getInnovationImplementation.mockResolvedValue({ ...context, importeVariable: true, importeFijado: null });
    render(<EvidenciaDetailModal item={item()} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByRole("button", { name: "Comprobar Implementación" });
    fireEvent.change(await screen.findByLabelText(/Fecha de Implementación/), { target: { value: "2026-11-01" } });
    fireEvent.change(await screen.findByRole("textbox", { name: /Motivo de Confirmación/ }), { target: { value: "Ahorro comprobado" } });
    fireEvent.change(await screen.findByLabelText(/Importe de la innovación/), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar Implementación" }));
    await waitFor(() => expect(mocks.implementInnovation).toHaveBeenCalledWith(7, context.version, "2026-11-01", "", "Ahorro comprobado", 120));
});

it("el importe de Jefatura es opcional y no admite valores inválidos", async () => {
    mocks.getInnovationImplementation.mockResolvedValue({ ...context, importeVariable: true, importeFijado: null });
    render(<EvidenciaDetailModal item={item()} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByRole("button", { name: "Comprobar Implementación" });
    fireEvent.change(await screen.findByLabelText(/Fecha de Implementación/), { target: { value: "2026-11-01" } });
    fireEvent.change(await screen.findByRole("textbox", { name: /Motivo de Confirmación/ }), { target: { value: "Ahorro comprobado" } });
    for (const bad of ["0", "-5", "12.345"]) {
        fireEvent.change(await screen.findByLabelText(/Importe de la innovación/), { target: { value: bad } });
        fireEvent.click(screen.getByRole("button", { name: "Comprobar Implementación" }));
        expect(mocks.implementInnovation).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenLastCalledWith("validation", "El importe debe ser mayor que cero y tener como máximo dos decimales.");
    }
    fireEvent.change(await screen.findByLabelText(/Importe de la innovación/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Comprobar Implementación" }));
    await waitFor(() => expect(mocks.implementInnovation).toHaveBeenCalledWith(7, context.version, "2026-11-01", "", "Ahorro comprobado"));
});

it("otros cargos no ven el campo de importe", async () => {
    render(<EvidenciaDetailModal item={item()} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByRole("button", { name: "Comprobar Implementación" });
    expect(screen.queryByLabelText(/Importe de la innovación/)).toBeNull();
});
