import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ClientesNuevosPage } from "./clientes-nuevos-page";

const mocks = vi.hoisted(() => ({
    general: vi.fn(),
    live: vi.fn(),
    register: vi.fn(),
    liveRegister: vi.fn(),
    validate: vi.fn(),
    update: vi.fn(),
    userId: 1,
    isAdministrator: false,
    revision: vi.fn(),
    resolve: vi.fn(),
    note: vi.fn(),
    validaciones: vi.fn(),
}));
vi.mock("./clientes-nuevos.service", () => ({
    clientesNuevosService: {
        list: mocks.general,
        register: mocks.register,
        validate: mocks.validate,
        update: mocks.update,
        revision: mocks.revision,
        resolve: mocks.resolve,
        note: mocks.note,
        validacionesPagos: mocks.validaciones,
    },
}));
vi.mock("../evidencias/tiktok-clientes.service", () => ({
    tiktokClientesService: { list: mocks.live, register: mocks.liveRegister, validate: mocks.validate },
}));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ userId: mocks.userId, isAdministrator: mocks.isAdministrator }) }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ comunidades: [{ id: 1, nombre: "ATK1" }] }) }));

vi.mock("@/components/base/select/select", () => ({
    Select: Object.assign(
        ({
            label,
            items,
            selectedKey,
            onSelectionChange,
            isDisabled,
        }: {
            label: string;
            items: Array<{ id: string; label: string }>;
            selectedKey: string;
            onSelectionChange: (value: string) => void;
            isDisabled?: boolean;
        }) => (
            <label>
                {label}
                <select aria-label={label} value={selectedKey ?? ""} disabled={isDisabled} onChange={(e) => onSelectionChange(e.target.value)}>
                    {items.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.label}
                        </option>
                    ))}
                </select>
            </label>
        ),
        { Item: () => null },
    ),
}));
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <input aria-label="Periodo" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock("@/components/application/file-upload/file-upload-base", () => ({
    FileUpload: {
        DropZone: ({ onDropFiles, isDisabled }: { onDropFiles: (files: File[]) => void; isDisabled: boolean }) => (
            <input type="file" aria-label="Captura" disabled={isDisabled} onChange={(e) => onDropFiles(Array.from(e.target.files ?? []))} />
        ),
    },
}));
const empty = { items: [], total: 0, habilitados: 0, esperando: 0, bloqueados: 0, total_comision: 0 };
const result = (name: string) => ({
    ...empty,
    total: 1,
    items: [
        { id: 1, nombre: name, documento: "12345678", estado: "ESPERANDO_OPERACION", fecha_registro: "2026-10-31T16:00:00Z", vence: "2026-11-07T16:00:00Z" },
    ],
});
beforeEach(() => {
    vi.resetAllMocks();
    mocks.validaciones.mockResolvedValue({ items: [] });
    mocks.userId = 1;
    mocks.isAdministrator = false;
    mocks.general.mockResolvedValue(empty);
    mocks.live.mockResolvedValue(empty);
    mocks.validate.mockResolvedValue({ existe: false });
    mocks.liveRegister.mockResolvedValue({ id: 1, fecha_registro: "2026-10-31T16:00:00Z" });
});
afterEach(cleanup);

const reviewable = () => ({
    ...result("Captación por Revisar").items[0],
    id_colaborador: 15,
    estado: "BONO_HABILITADO",
    estado_aprobacion: "PENDIENTE_APROBACION",
    ganancia: 0,
    comision_propuesta: 0.7,
    puede_resolver: true,
    revision_version: "version-actual",
    registrado_por: "Asesor de Prueba",
    estado_operacion: "Pagado",
    operacion: "OP-123",
    historial: [],
});

it.each([false, true])("administración decide una captación sin registrar clientes (TikTok=%s)", async (tiktok) => {
    mocks.isAdministrator = true;
    const concept = tiktok ? "COMISION_TIKTOK_LIVE" : "COMISION_REGISTRO_EFECTIVIZACION";
    const row = { ...reviewable(), concepto_codigo: concept, canal: "TIKTOK_LIVE" };
    const response = { ...empty, total: 1, items: [row] };
    mocks.general.mockResolvedValue(response);
    mocks.live.mockResolvedValue(response);
    mocks.revision.mockResolvedValue(row);
    mocks.resolve.mockResolvedValue({});
    render(<ClientesNuevosPage tiktok={tiktok} />);
    await screen.findByText("Captación por Revisar");
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: tiktok ? "Rechazar Comisión" : "Aprobar Comisión" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(1, 15, "version-actual", tiktok ? "RECHAZADO" : "APROBADO", concept));
    expect(mocks.revision).toHaveBeenCalledWith(1, 15, concept);
    expect(await screen.findByText(tiktok ? "Comisión rechazada." : "Comisión aprobada.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(tiktok ? mocks.live : mocks.general).toHaveBeenCalledTimes(2));
});

it("ATC consulta la aprobación sin recibir controles de decisión", async () => {
    mocks.general.mockResolvedValue({ ...empty, total: 1, items: [reviewable()] });
    render(<ClientesNuevosPage readOnly />);
    await screen.findByText("Captación por Revisar");
    expect(within(screen.getByText("Captación por Revisar").closest("tr")!).getAllByText("Pendiente").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Aprobar Comisión" })).toBeNull();
});

it("guarda una nota independiente sin aprobar ni rechazar la captación", async () => {
    mocks.isAdministrator = true;
    const row = { ...reviewable(), puede_resolver: false, estado_aprobacion: "APROBADO", notas: [] };
    mocks.general.mockResolvedValue({ ...empty, total: 1, items: [row] });
    mocks.revision.mockResolvedValue(row);
    mocks.note.mockResolvedValue(row);
    render(<ClientesNuevosPage readOnly />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar Nota" }));
    const dialog = await screen.findByRole("dialog", { name: "Agregar Nota" });
    fireEvent.change(await within(dialog).findByRole("textbox", { name: /Nota/ }), { target: { value: "Sustento revisado con el asesor" } });
    expect(within(dialog).queryByRole("button", { name: "Aprobar" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Rechazar" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.note).toHaveBeenCalledWith(1, 15, "Sustento revisado con el asesor", "COMISION_REGISTRO_EFECTIVIZACION"));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.revision).not.toHaveBeenCalled();
});

it("una decisión con fuente desactualizada exige actualizar antes de reintentar", async () => {
    mocks.isAdministrator = true;
    const row = reviewable();
    mocks.general.mockResolvedValue({ ...empty, total: 1, items: [row] });
    mocks.revision.mockResolvedValue(row);
    mocks.resolve.mockRejectedValue({ message: "La operación cambió; actualiza antes de decidir" });
    render(<ClientesNuevosPage readOnly />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar Comisión" }));
    expect(await screen.findByText("La operación cambió; actualiza antes de decidir")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/Comisión (aprobada|rechazada)/)).toBeNull();
    await waitFor(() => expect(mocks.general).toHaveBeenCalledTimes(2));
    mocks.revision.mockResolvedValue({ ...row, revision_version: "version-nueva" });
    mocks.resolve.mockResolvedValue({});
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar Comisión" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenLastCalledWith(1, 15, "version-nueva", "APROBADO", "COMISION_REGISTRO_EFECTIVIZACION"));
    expect(mocks.revision).toHaveBeenCalledTimes(2);
});

it("Registro Nuevo no permite capturar LIVE mediante un selector", async () => {
    render(<ClientesNuevosPage />);
    await waitFor(() => expect(mocks.general).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Registro Nuevo" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Canal de Alta")).toBeNull();
    expect(screen.queryByLabelText("Captura")).toBeNull();
    expect(mocks.live).not.toHaveBeenCalled();
});
it("al cambiar de opción descarta respuestas y datos de la tarea anterior", async () => {
    let resolve!: (value: typeof empty) => void;
    mocks.general.mockReturnValueOnce(
        new Promise((done) => {
            resolve = done;
        }),
    );
    mocks.live.mockResolvedValue(result("Cliente LIVE"));
    const view = render(<ClientesNuevosPage />);
    view.rerender(<ClientesNuevosPage tiktok />);
    await screen.findByText("Cliente LIVE");
    await act(async () => resolve(empty));
    expect(screen.getByText("Cliente LIVE")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "TikTok Live" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Captura")).toBeNull();
    expect(screen.getByRole("button", { name: "Adjuntar" })).toBeInTheDocument();
});

it("conserva filas al actualizar, pero distingue error de consulta vacía y permite reintentar", async () => {
    mocks.general.mockResolvedValueOnce(result("Cliente previo"));
    render(<ClientesNuevosPage />);
    await screen.findByText("Cliente previo");
    let reject!: (cause: Error) => void;
    mocks.general.mockReturnValueOnce(
        new Promise((_, fail) => {
            reject = fail;
        }),
    );
    fireEvent.focus(window);
    expect(screen.getByText("Cliente previo")).toBeInTheDocument();
    expect(screen.getByText("Actualizando registros…")).toBeInTheDocument();
    await act(async () => {
        reject(new Error("Consulta rechazada"));
    });
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Consulta rechazada");
    await waitFor(() => expect(screen.queryByText("Cliente previo")).toBeNull());
    mocks.general.mockResolvedValue(result("Recuperado"));
    fireEvent.focus(window);
    await screen.findByText("Recuperado");
});

it("sincroniza periodo bisiesto y fechas en servidor sin filtrar una página local", async () => {
    render(<ClientesNuevosPage />);
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2028-02" } });
    expect(screen.getByLabelText("Desde")).toHaveValue("2028-02-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2028-02-29");
    await waitFor(() =>
        expect(mocks.general).toHaveBeenLastCalledWith("2028-02", 1, 20, expect.objectContaining({ desde: "2028-02-01", hasta: "2028-02-29" })),
    );
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2028-03-01" } });
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Desde no puede ser posterior");
});

it("no acepta una respuesta de validación incompleta", async () => {
    mocks.validate.mockResolvedValue({});
    render(<ClientesNuevosPage />);
    fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "12345678" } });
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se confirmó la disponibilidad");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Revisa los datos/)).toBeInTheDocument();
    expect(screen.queryByText(/El cliente es apto/)).toBeNull();
});

it("descarta formulario y resultados al cambiar la identidad de sesión", async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    mocks.general
        .mockReturnValueOnce(
            new Promise((done) => {
                resolve = done;
            }),
        )
        .mockResolvedValue(result("Segunda sesión"));
    const view = render(<ClientesNuevosPage />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Primera sesión" } });
    mocks.userId = 2;
    view.rerender(<ClientesNuevosPage />);
    await screen.findByText("Segunda sesión");
    await act(async () => {
        resolve(result("Sesión anterior"));
    });
    expect(screen.queryByText("Sesión anterior")).toBeNull();
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
});

it("pagina en servidor y reinicia la página al cambiar el estado", async () => {
    mocks.general.mockResolvedValue({ ...empty, total: 45 });
    render(<ClientesNuevosPage readOnly />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Página siguiente" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(mocks.general).toHaveBeenLastCalledWith(expect.any(String), 2, 20, expect.anything()));
    fireEvent.change([...document.querySelectorAll("select")].find((item) => item.querySelector(`option[value="BLOQUEADO"]`)) as HTMLSelectElement, {
        target: { value: "BLOQUEADO" },
    });
    await waitFor(() => expect(mocks.general).toHaveBeenLastCalledWith(expect.any(String), 1, 20, expect.objectContaining({ estado: "BLOQUEADO" })));
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
});

it("inicia con el mes de Lima aunque UTC ya esté en el mes siguiente", () => {
    vi.useFakeTimers();
    try {
        vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
        render(<ClientesNuevosPage />);
        expect(screen.getByLabelText("Periodo")).toHaveValue("2026-10");
        expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-01");
        expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-31");
    } finally {
        cleanup();
        vi.useRealTimers();
    }
});

it("ignora la confirmación de un alta de la sesión anterior", async () => {
    let resolve!: (value: { id: number; fecha_registro: string }) => void;
    mocks.register.mockReturnValue(
        new Promise((done) => {
            resolve = done;
        }),
    );
    const view = render(<ClientesNuevosPage />);
    fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "12345678" } });
    await screen.findByText(/El cliente es apto/);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Alta anterior" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    mocks.userId = 2;
    view.rerender(<ClientesNuevosPage />);
    await act(async () => {
        resolve({ id: 1, fecha_registro: "2026-10-31T16:00:00Z" });
    });
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
});

it("un query antiguo no cambia el permiso ni la tarea dentro del formulario", async () => {
    render(
        <MemoryRouter initialEntries={["/compensaciones/atenciones?canal=LIVE"]}>
            <ClientesNuevosPage />
        </MemoryRouter>,
    );
    await waitFor(() => expect(mocks.general).toHaveBeenCalled());
    expect(mocks.live).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Registro Nuevo" })).toBeInTheDocument();
});

it("muestra canal y revisión del listado común, corte y alcance parcial sin reclamar comisión habilitada", async () => {
    mocks.general.mockResolvedValue({
        ...result("LIVE en revisión"),
        dataState: "partial",
        en_revision: 1,
        asOf: "2026-11-01T16:00:00Z",
        items: [{ ...result("LIVE en revisión").items[0], canal: "TIKTOK_LIVE", estado: "EN_REVISION", ganancia: null, id_operacion: 12, puede_editar: true }],
    });
    render(<ClientesNuevosPage />);
    const row = (await screen.findByText("LIVE en revisión")).closest("tr")!;
    expect(within(row).getByText("TikTok LIVE")).toBeInTheDocument();
    expect(within(row).getAllByText("Pendiente").length).toBeGreaterThan(0);
    expect(within(row).queryByRole("button", { name: "Editar cliente" })).toBeNull();
    expect(screen.queryByText("Datos parciales · En Revisión")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Información de Registro Nuevo" }));
    const info = screen.getByRole("dialog", { name: "Información de Registro Nuevo" });
    expect(within(info).queryByText("Estado de la Consulta")).toBeNull();
    expect(within(info).queryByText("Datos parciales · En Revisión")).toBeNull();
    expect(mocks.live).not.toHaveBeenCalled();
    fireEvent.click(within(info).getByRole("button", { name: "Cerrar" }));
    fireEvent.change([...document.querySelectorAll("select")].find((item) => item.querySelector(`option[value="EN_REVISION"]`)) as HTMLSelectElement, {
        target: { value: "EN_REVISION" },
    });
    await waitFor(() => expect(mocks.general).toHaveBeenLastCalledWith(expect.any(String), 1, 20, expect.objectContaining({ estado: "EN_REVISION" })));
});

it("concentra las reglas en la ayuda sin añadir solicitudes al abrirla", async () => {
    render(<ClientesNuevosPage readOnly />);
    await waitFor(() => expect(mocks.general).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Observación")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Información de Registro Nuevo" }));
    const info = screen.getByRole("dialog", { name: "Información de Registro Nuevo" });
    expect(within(info).getByText("Registro Nuevo y Efectivización")).toBeInTheDocument();
    expect(within(info).getByText("Concepto")).toBeInTheDocument();
    expect(within(info).getByText("Tipo")).toBeInTheDocument();
    expect(within(info).getByText("Monto")).toBeInTheDocument();
    expect(within(info).getByText("El cliente es nuevo y opera dentro de los primeros 7 días.")).toBeInTheDocument();
    expect(mocks.general).toHaveBeenCalledTimes(1);
    fireEvent.click(within(info).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
});

it("bloquea doble clic y decisiones incompatibles mientras obtiene una versión vigente", async () => {
    mocks.isAdministrator = true;
    const row = { ...reviewable(), revision_version: "version-vieja" };
    mocks.general.mockResolvedValue({ ...empty, total: 1, items: [row] });
    let finish!: (value: typeof row) => void;
    mocks.revision.mockReturnValue(
        new Promise((done) => {
            finish = done;
        }),
    );
    mocks.resolve.mockResolvedValue({});
    render(<ClientesNuevosPage readOnly />);
    const approve = await screen.findByRole("button", { name: "Aprobar Comisión" });
    fireEvent.click(approve);
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole("button", { name: "Rechazar Comisión" }));
    expect(mocks.revision).toHaveBeenCalledTimes(1);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(approve).toBeDisabled();
    expect(screen.getByText("Verificando y guardando decisión…")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Agregar Nota" })).toBeDisabled();
    await act(async () => finish({ ...row, revision_version: "version-vigente" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1));
    expect(mocks.resolve).toHaveBeenCalledWith(1, 15, "version-vigente", "APROBADO", "COMISION_REGISTRO_EFECTIVIZACION");
});

it.each([
    { puede_resolver: false, revision_version: "version", bloqueo_revision: "No se permite autoaprobar" },
    { puede_resolver: true, revision_version: "", bloqueo_revision: "" },
])("no resuelve si la revisión del servidor no autoriza o no confirma versión: %j", async (revision) => {
    mocks.isAdministrator = true;
    const row = reviewable();
    mocks.general.mockResolvedValue({ ...empty, total: 1, items: [row] });
    mocks.revision.mockResolvedValue({ ...row, ...revision });
    render(<ClientesNuevosPage readOnly />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar Comisión" }));
    expect(await screen.findByRole("alert", { hidden: true })).toBeInTheDocument();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(mocks.general).toHaveBeenCalledTimes(2));
});

it("una revisión tardía de otra sesión no ejecuta la decisión", async () => {
    mocks.isAdministrator = true;
    const row = reviewable();
    mocks.general.mockResolvedValue({ ...empty, total: 1, items: [row] });
    let finish!: (value: typeof row) => void;
    mocks.revision.mockReturnValue(
        new Promise((done) => {
            finish = done;
        }),
    );
    const view = render(<ClientesNuevosPage readOnly />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar Comisión" }));
    mocks.userId = 2;
    view.rerender(<ClientesNuevosPage readOnly />);
    await act(async () => finish(row));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
});

it("conserva la nota tras error sin ejecutar una decisión", async () => {
    mocks.isAdministrator = true;
    mocks.general.mockResolvedValue({ ...empty, total: 1, items: [reviewable()] });
    mocks.note.mockRejectedValue(new Error("No se pudo guardar"));
    render(<ClientesNuevosPage readOnly />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar Nota" }));
    const editor = within(screen.getByRole("dialog", { name: "Agregar Nota" }));
    fireEvent.change(editor.getByRole("textbox", { name: /Nota/ }), { target: { value: "Nota pendiente" } });
    fireEvent.click(editor.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo guardar");
    expect(editor.getByRole("textbox", { name: /Nota/ })).toHaveValue("Nota pendiente");
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.revision).not.toHaveBeenCalled();
});

it("TikTok conserva campos y captura aplicada, descarta cambios del popup y limpia al cancelar el alta", async () => {
    const capture = new File(["image"], "captura.png", { type: "image/png" });
    const replacement = new File(["other"], "otra.webp", { type: "image/webp" });
    render(<ClientesNuevosPage tiktok />);
    await waitFor(() => expect(mocks.live).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "12345678" } });
    await screen.findByText(/El cliente es apto/);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente Live" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Revisa los datos/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Captura")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Adjuntar" }));
    let popup = within(screen.getByRole("dialog", { name: "Adjuntar Captura TikTok Live" }));
    fireEvent.change(popup.getByLabelText("Captura"), { target: { files: [capture] } });
    expect(mocks.liveRegister).not.toHaveBeenCalled();
    fireEvent.click(popup.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("button", { name: "Adjuntar (1)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Cliente Live");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Adjuntar (1)" }));
    popup = within(screen.getByRole("dialog"));
    expect(popup.getByText("captura.png")).toBeInTheDocument();
    fireEvent.change(popup.getByLabelText("Captura"), { target: { files: [replacement] } });
    fireEvent.click(popup.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.liveRegister).toHaveBeenCalledWith("12345678", "Cliente Live", 1, "", 1, capture));
    await waitFor(() => expect(screen.getByRole("button", { name: "Adjuntar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Adjuntar" }));
    popup = within(screen.getByRole("dialog"));
    fireEvent.change(popup.getByLabelText("Captura"), { target: { files: [replacement] } });
    fireEvent.click(popup.getByRole("button", { name: "Guardar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Adjuntar" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Adjuntar" }));
    expect(screen.queryByText("otra.webp")).toBeNull();
    // Integración de tabla, validación y varios portales React Aria bajo carga concurrente.
}, 15000);
