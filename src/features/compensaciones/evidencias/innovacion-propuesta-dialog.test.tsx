import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { EvidenciaEvento } from "./evidencias.types";
import { InnovacionPropuestaDialog, InnovacionRevisionActions } from "./innovacion-propuesta-dialog";

const mocks = vi.hoisted(() => ({
    send: vi.fn(),
    annul: vi.fn(),
    updateInnovationDraft: vi.fn(),
    updateInnovationPending: vi.fn(),
    getInnovationImplementation: vi.fn(),
    adminGet: vi.fn(),
    adminResolve: vi.fn(),
}));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: { get: mocks.adminGet, resolve: mocks.adminResolve } }));
vi.mock("./evidencias.service", () => ({ evidenciasService: mocks }));

const item = {
    id: 8,
    estado: "BORRADOR",
    titulo: "Mejora de atención",
    descripcion: "Descripción completa de la idea",
    fechaEvento: "2026-11-06T17:00:00Z",
    importeAprobado: 0,
    beneficiarioNombre: "Usuario redundante",
    sucursalOrigenNombre: "Sede redundante",
    revisiones: [{ decision: "ENVIADO" }],
} as EvidenciaEvento;
beforeEach(() => {
    vi.resetAllMocks();
    mocks.send.mockResolvedValue({ id: 8, estado_evento: "PENDIENTE" });
    mocks.annul.mockResolvedValue({ id: 8, estado_evento: "ANULADO" });
    mocks.updateInnovationDraft.mockResolvedValue({ id: 8, estado_evento: "BORRADOR" });
});
afterEach(cleanup);
it("el visor muestra solo los datos de la propuesta y no información de revisión o del propio usuario", () => {
    render(<InnovacionPropuestaDialog item={item} action="DETALLE" onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText(item.descripcion!)).toBeVisible();
    expect(screen.getByText(item.titulo!)).toBeVisible();
    expect(screen.queryByText(/Usuario redundante|Sede redundante|Historial|Implementación|Tarifa/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
});
it.each(["ENVIAR", "ELIMINAR"] as const)("%s exige confirmar y envía una sola solicitud", async (action) => {
    let finish!: (value: unknown) => void;
    const rpc = action === "ENVIAR" ? mocks.send : mocks.annul;
    rpc.mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const changed = vi.fn();
    render(<InnovacionPropuestaDialog item={item} action={action} onClose={vi.fn()} onChanged={changed} />);
    expect(rpc).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: action === "ENVIAR" ? "Enviar" : "Eliminar" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => finish({ id: 8, estado_evento: action === "ENVIAR" ? "PENDIENTE" : "ANULADO" }));
    expect(changed).toHaveBeenCalledOnce();
});
it("edita el mismo borrador y conserva el texto si falla el servidor", async () => {
    mocks.updateInnovationDraft.mockRejectedValueOnce(new Error("La propuesta ya fue enviada"));
    const changed = vi.fn();
    render(<InnovacionPropuestaDialog item={item} action="EDITAR" onClose={vi.fn()} onChanged={changed} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Título corregido" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByRole("alert", { hidden: true });
    expect(mocks.updateInnovationDraft).toHaveBeenCalledWith(8, "Título corregido", item.descripcion);
    expect(screen.getByRole("textbox", { name: /^Título/ })).toHaveValue("Título corregido");
    expect(changed).not.toHaveBeenCalled();
});
it("no confirma un envío con una respuesta incompleta", async () => {
    mocks.send.mockResolvedValue({ id: 8 });
    const changed = vi.fn();
    render(<InnovacionPropuestaDialog item={item} action="ENVIAR" onClose={vi.fn()} onChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("alert", { hidden: true });
    expect(changed).not.toHaveBeenCalled();
});
it.each(["EDITAR", "ENVIAR", "ELIMINAR"] as const)("Cancelar %s cierra sin mutación", (action) => {
    const close = vi.fn();
    render(<InnovacionPropuestaDialog item={item} action={action} onClose={close} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.annul).not.toHaveBeenCalled();
    expect(mocks.updateInnovationDraft).not.toHaveBeenCalled();
});
it("solo el borrador se puede enviar: una propuesta pendiente bloquea ENVIAR", () => {
    render(<InnovacionPropuestaDialog item={{ ...item, estado: "PENDIENTE" }} action="ENVIAR" onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
});
it.each(["EDITAR", "ELIMINAR"] as const)("una propuesta pendiente propia admite %s", (action) => {
    render(<InnovacionPropuestaDialog item={{ ...item, estado: "PENDIENTE" }} action={action} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: action === "EDITAR" ? "Guardar" : "Eliminar" })).toBeEnabled();
});
it("editar una propuesta pendiente usa la edición de pendientes", async () => {
    mocks.updateInnovationPending.mockResolvedValue({ id: 8, estado_evento: "PENDIENTE" });
    const changed = vi.fn();
    render(<InnovacionPropuestaDialog item={{ ...item, estado: "PENDIENTE" }} action="EDITAR" onClose={vi.fn()} onChanged={changed} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Título nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.updateInnovationPending).toHaveBeenCalledWith(8, "Título nuevo", item.descripcion));
    expect(mocks.updateInnovationDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
});

const pending = { ...item, estado: "PENDIENTE", usuarioRegistraId: 8 } as EvidenciaEvento;
const revision = { id: 8, estado: "PENDIENTE", version: "revision-1", puede_aprobar: true, puede_revisar: true, bloqueado: false };
const implementation = { version: "implementation-1", puedeRevisar: true, bloqueado: false, comprobada: false, constancia: null };
const showReview = (record = pending) => {
    mocks.adminGet.mockResolvedValue(revision);
    mocks.getInnovationImplementation.mockResolvedValue(implementation);
    mocks.adminResolve.mockResolvedValue({ id: 8 });
    const changed = vi.fn();
    const view = render(<InnovacionRevisionActions item={record} userId={1} onChanged={changed} />);
    return { changed, ...view };
};
it.each(["APROBADO", "RECHAZADO"] as const)("resuelve %s directamente con permisos y versión vigentes, sin tocar implementación", async (decision) => {
    const { changed } = showReview();
    const button = await screen.findByRole("button", { name: decision === "APROBADO" ? "Aprobar propuesta" : "Rechazar propuesta" });
    mocks.adminGet.mockResolvedValueOnce({ ...revision, version: "revision-2" });
    let finish!: () => void;
    mocks.adminResolve.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(mocks.adminResolve).toHaveBeenCalledExactlyOnceWith({ id: 8, version: "revision-2", action: decision, reason: "" }));
    expect(screen.getByRole("button", { name: "Rechazar propuesta" })).toBeDisabled();
    await act(async () => finish());
    expect(changed).toHaveBeenCalledOnce();
    expect(alertSpy).toHaveBeenCalledWith("success", decision === "APROBADO" ? expect.stringMatching(/implementación pendiente/) : "Propuesta rechazada.");
});
it.each(["BORRADOR", "APROBADO", "LIQUIDADO", "ANULADO"] as const)("no ofrece resolución para %s", (state) => {
    showReview({ ...pending, estado: state });
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.adminGet).not.toHaveBeenCalled();
});
it("no consulta ni ofrece acciones para el propio autor", () => {
    showReview({ ...pending, usuarioRegistraId: 1 });
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.adminGet).not.toHaveBeenCalled();
});
it.each([
    { ...implementation, puedeRevisar: false },
    { ...implementation, bloqueado: true },
])("respeta las restricciones de implementación antes de ofrecer revisión", async (context) => {
    mocks.getInnovationImplementation.mockResolvedValue(context);
    mocks.adminGet.mockResolvedValue(revision);
    render(<InnovacionRevisionActions item={pending} userId={1} onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
});
it("no resuelve si el servidor revoca el permiso después de cargar y refresca sin éxito falso", async () => {
    const { changed } = showReview();
    const button = await screen.findByRole("button", { name: "Aprobar propuesta" });
    mocks.adminGet.mockResolvedValueOnce({ ...revision, puede_aprobar: false });
    fireEvent.click(button);
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(mocks.adminResolve).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith("error", expect.stringMatching(/ya no admite/));
});
it("conserva el conflicto de versión del servidor y refresca sin éxito falso", async () => {
    const { changed } = showReview();
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar propuesta" }));
    mocks.adminResolve.mockRejectedValueOnce(new Error("La versión cambió"));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(alertSpy).toHaveBeenCalledWith("error", "La versión cambió");
    expect(alertSpy).not.toHaveBeenCalledWith("success", expect.any(String));
});
it("ignora una consulta de permisos que llega después del desmontaje", async () => {
    let finish!: (value: unknown) => void;
    mocks.adminGet.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    mocks.getInnovationImplementation.mockResolvedValue(implementation);
    const view = render(<InnovacionRevisionActions item={pending} userId={1} onChanged={vi.fn()} />);
    view.unmount();
    await act(async () => finish(revision));
    expect(mocks.adminResolve).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
});
