import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { AdminRevision } from "../administracion/admin-revision.service";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento } from "./evidencias.types";

const mock = vi.hoisted(() => ({ get: vi.fn(), resolve: vi.fn(), oldResolve: vi.fn() }));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: mock }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isAdministrator: true, userId: 20 }) }));

vi.mock("./evidencias.service", () => ({ evidenciasService: { resolve: mock.oldResolve } }));

const context = (patch: Partial<AdminRevision> = {}): AdminRevision => ({
    id: 8,
    version: "v1",
    estado: "PENDIENTE",
    puede_revisar: true,
    puede_aprobar: true,
    puede_observar: true,
    puede_anular: false,
    bloqueado: false,
    motivo: "",
    automatico: false,
    requiere_implementacion: false,
    destino: "/compensaciones/llamadas",
    fuentes: [],
    ...patch,
});
// These concepts retain the administrative review; compact categories resolve from row actions.
const item = (id = 8) =>
    ({
        id,
        categoria: "OTRO",
        tipoCodigo: "BONO_MES",
        tipoNombre: "Colaborador del Mes",
        estado: "PENDIENTE",
        fechaEvento: "2026-11-04T15:00:00Z",
        datos: {},
        evidencia: [],
        referencias: [],
        revisiones: [],
        usuarioRegistraId: 24,
        importeAprobado: null,
        tarifaRegistro: null,
    }) as unknown as EvidenciaEvento;
const props = () => ({ item: item(), onClose: vi.fn(), onChanged: vi.fn() });
beforeEach(() => {
    vi.resetAllMocks();
    mock.get.mockResolvedValue(context());
    mock.resolve.mockResolvedValue({ id: 8 });
});
afterEach(cleanup);
it("espera al servidor y oculta decisiones en registros propios", async () => {
    let finish!: (value: AdminRevision) => void;
    mock.get.mockImplementationOnce(
        () =>
            new Promise((done) => {
                finish = done;
            }),
    );
    render(<EvidenciaDetailModal {...props()} />);
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    await act(async () => {
        finish(context({ bloqueado: true, puede_aprobar: false, puede_revisar: false, puede_observar: false, motivo: "Requiere otro revisor" }));
    });
    await waitFor(() => expect(screen.getByText("Requiere otro revisor")).toBeVisible());
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
});
it("usa la revisión versionada con motivo y bloquea el doble envío", async () => {
    const value = props();
    let finish!: (value: { id: number }) => void;
    mock.resolve.mockImplementationOnce(
        () =>
            new Promise((done) => {
                finish = done;
            }),
    );
    render(<EvidenciaDetailModal {...value} />);
    const button = await screen.findByRole("button", { name: "Aprobar" });
    fireEvent.click(button);
    expect(mock.resolve).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByRole("textbox", { name: /Comentario de revisión/ }), { target: { value: "Contacto y evidencia comprobados" } });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mock.resolve).toHaveBeenCalledTimes(1);
    expect(mock.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ id: 8, version: "v1", action: "APROBADO", reason: "Contacto y evidencia comprobados" }),
    );
    expect(mock.oldResolve).not.toHaveBeenCalled();
    await act(async () => {
        finish({ id: 8 });
    });
    expect(value.onChanged).toHaveBeenCalledTimes(1);
});
it("un error impide decidir y permite consultar de nuevo", async () => {
    mock.get.mockRejectedValueOnce(new Error("Sin permiso asignado"));
    render(<EvidenciaDetailModal {...props()} />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Sin permiso asignado");
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Aprobar" })).toBeVisible();
});
it("ignora respuestas de otro expediente y conserva el modo de solo consulta", async () => {
    let old!: (value: AdminRevision) => void;
    mock.get.mockImplementationOnce(
        () =>
            new Promise((done) => {
                old = done;
            }),
    );
    mock.get.mockResolvedValueOnce(context({ id: 9, puede_aprobar: false, puede_revisar: false, motivo: "Automatico" }));
    const value = props(),
        view = render(<EvidenciaDetailModal {...value} />);
    view.rerender(<EvidenciaDetailModal {...value} item={item(9)} readOnly />);
    await screen.findByText("Automatico");
    await act(async () => {
        old(context());
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull());
    expect(mock.resolve).not.toHaveBeenCalled();
});
