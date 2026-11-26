import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { TarjetaTerceroForm, fechaLima } from "./tarjeta-tercero-form";

const mocks = vi.hoisted(() => ({ register: vi.fn(), lookup: vi.fn(), registerFile: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({
        label,
        value,
        onChange,
        isDisabled,
    }: {
        label: string;
        value: string;
        onChange: (value: string) => void;
        isDisabled?: boolean;
    }) => <input aria-label={label} type="date" value={value} disabled={isDisabled} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({
    useClienteLookup: () => mocks.lookup(),
}));
vi.mock("./evidencias.service", () => ({ evidenciasService: { registerCard: mocks.register, registerCardFile: mocks.registerFile } }));

vi.mock("./tarjetas-evidence.service", () => ({ tarjetasEvidenceService: { uploadCardEvidence: mocks.upload, removeCardEvidence: mocks.remove } }));
const context = { idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false };
const fill = () => {
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente ficticio" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Nro tarjeta/ }), { target: { value: "4321" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Notas/ }), { target: { value: "Intento bloqueado documentado" } });
};
beforeEach(() => {
    vi.stubGlobal(
        "DataTransfer",
        class {
            files: File[] = [];
            items = { add: (file: File) => this.files.push(file) };
        },
    );
    vi.clearAllMocks();
    mocks.lookup.mockReturnValue({ result: null, isLoading: false, error: "" });
    mocks.remove.mockResolvedValue(undefined);
    mocks.registerFile.mockResolvedValue({ id: 31 });
    mocks.upload.mockResolvedValue({
        tipo: "IMAGEN_TARJETA",
        bucket: "compensaciones-tarjetas-erroneas",
        path: "user/image.png",
        nombre: "evidencia.png",
        mime_type: "image/png",
        size: 5,
    });
    mocks.register.mockResolvedValue({ id: 30, estado_evento: "PENDIENTE" });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
describe("Tarjetas de terceros: registro simple", () => {
    it("mantiene la captura compacta y sin campos de evidencia", () => {
        render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} />);
        expect(screen.getAllByRole("button", { name: "Guardar" })).toHaveLength(1);
        expect(screen.queryByRole("textbox", { name: /^Tipo/ })).toBeNull();
        expect(screen.getByRole("textbox", { name: /Nro tarjeta/ })).toBeTruthy();
        expect(screen.getByText("Registrar Auditoria")).toBeTruthy();
        expect(screen.getByLabelText(/^Fecha$/)).toBeTruthy();
        expect(screen.queryByRole("textbox", { name: /Evidencia/ })).toBeNull();
        expect(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
        expect(screen.queryByText(/borrador|beneficiario|fecha y hora/i)).toBeNull();
    });
    it("guarda y envía con una sola RPC sin beneficiario elegido", async () => {
        const saved = vi.fn();
        render(<TarjetaTerceroForm contexto={context} error="" onSave={saved} />);
        fill();
        fireEvent.change(screen.getByRole("textbox", { name: /Notas/ }), { target: { value: " Detección ficticia " } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
        expect(mocks.register).toHaveBeenCalledWith("99990001", "Cliente ficticio", fechaLima(), "Detección ficticia", "4321", expect.any(String), "", null);
    });
    it.each([null, { ...context, idColaborador: null }, { ...context, puedeRegistrar: false }])("bloquea sin contexto, vínculo o permiso", (ctx) => {
        render(<TarjetaTerceroForm contexto={ctx} error="" onSave={vi.fn()} />);
        expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("bloquea si falla el contexto", () => {
        render(<TarjetaTerceroForm contexto={null} error="Error de permisos" onSave={vi.fn()} />);
        expect(screen.getByRole("alert", { hidden: true }).textContent).toContain("Error");
    });
    it("valida DNI y nombre", () => {
        render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringContaining("DNI"));
        fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringContaining("nombre"));
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("reúne los campos pendientes en un aviso y limpia las marcas al cancelar", () => {
        render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} />);
        const document = screen.getByRole("textbox", { name: /Nro\. Documento/ });
        const name = screen.getByRole("textbox", { name: /^Nombre/ });
        expect(document).not.toHaveAttribute("aria-invalid", "true");
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledTimes(1);
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringMatching(/DNI.*nombre.*dígitos/i));
        expect(document).toHaveAttribute("aria-invalid", "true");
        expect(name).toHaveAttribute("aria-invalid", "true");
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(document).not.toHaveAttribute("aria-invalid", "true");
        expect(name).not.toHaveAttribute("aria-invalid", "true");
        expect(mocks.register).not.toHaveBeenCalled();
        expect(mocks.upload).not.toHaveBeenCalled();
    });
    it("rechaza una fecha de detección futura según Lima", () => {
        render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} />);
        fill();
        const tomorrow = new Date(`${fechaLima()}T12:00:00-05:00`);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowLima = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
        fireEvent.change(screen.getByLabelText(/^Fecha$/), { target: { value: tomorrowLima } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringMatching(/no futura/i));
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("conserva la clave para reintentar", async () => {
        mocks.register.mockRejectedValueOnce(new Error("Sin conexión"));
        render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} />);
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Sin conexión"));
        await waitFor(() => expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(2));
        expect(mocks.register.mock.calls[1]).toEqual(mocks.register.mock.calls[0]);
    });
    it("no duplica por doble clic", async () => {
        let finish!: (value: unknown) => void;
        mocks.register.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} />);
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(mocks.register).toHaveBeenCalledTimes(1);
        finish({ id: 30 });
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("success", expect.any(String)));
    });
});

it("conserva la nota expandida al volver al formulario y guardar", async () => {
    render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} compact />);
    fill();
    fireEvent.change(screen.getByRole("textbox", { name: /Notas/ }), { target: { value: "Evidencia inicial" } });
    fireEvent.click(screen.getByRole("button", { name: "Ampliar nota" }));
    const editors = screen.getAllByRole("textbox", { name: /Notas/ });
    fireEvent.change(editors[editors.length - 1], { target: { value: "Evidencia inicial\nIntento bloqueado" } });
    fireEvent.click(screen.getByRole("button", { name: "Volver al formulario" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
        expect(mocks.register).toHaveBeenCalledWith(
            "99990001",
            "Cliente ficticio",
            fechaLima(),
            "Evidencia inicial\nIntento bloqueado",
            "4321",
            expect.any(String),
            "",
            null,
        ),
    );
});
it("no registra mientras busca al cliente aunque se envíe el formulario", () => {
    mocks.lookup.mockReturnValue({ result: null, isLoading: true, error: "" });
    render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form")!);
    expect(mocks.register).not.toHaveBeenCalled();
});

it.each([true, false])("descarta respuesta de captura desmontada (éxito=%s)", async (success) => {
    let finish!: (value: unknown) => void;
    let fail!: (reason: Error) => void;
    mocks.register.mockImplementationOnce(
        () =>
            new Promise((resolve, reject) => {
                finish = resolve;
                fail = reject;
            }),
    );
    const saved = vi.fn();
    const view = render(<TarjetaTerceroForm contexto={context} error="" onSave={saved} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.register).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
        if (success) finish({ id: 99 });
        else fail(new Error("Respuesta anterior"));
    });
    expect(saved).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
});

const selectFile = (file = new File(["image"], "evidencia.png", { type: "image/png" })) => {
    fireEvent.click(screen.getByRole("button", { name: /^Adjuntar/ }));
    const dialog = screen.getByRole("dialog", { name: "Adjuntar Imagen" });
    fireEvent.change(dialog.querySelector('input[type="file"]')!, { target: { files: [file] } });
};
it("aplicar conserva la imagen y cancelar el popup descarta solo cambios locales", () => {
    render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} compact />);
    fill();
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.click(screen.getByRole("button", { name: /^Adjuntar/ }));
    expect(screen.queryByRole("textbox", { name: /Evidencia/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Adjuntar (1)" })).toBeVisible();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
});
it("Cancelar del alta limpia campos y adjuntos aplicados sin registrar", () => {
    render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} compact />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /Nro\. Documento/ })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Adjuntar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
    expect(mocks.register).not.toHaveBeenCalled();
});
it("valida tipo y tamaño en popup y conserva la captura", () => {
    render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} compact />);
    selectFile(new File(["pdf"], "archivo.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("JPG, PNG o WEBP");
    expect(mocks.upload).not.toHaveBeenCalled();
});
it("solo sube al guardar y reutiliza el archivo y clave si el registro falla", async () => {
    mocks.registerFile.mockRejectedValueOnce(new Error("Sin conexión"));
    const saved = vi.fn();
    render(<TarjetaTerceroForm contexto={context} error="" onSave={saved} compact />);
    fill();
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Sin conexión"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.registerFile).toHaveBeenCalledTimes(2);
    expect(mocks.registerFile.mock.calls[1]).toEqual(mocks.registerFile.mock.calls[0]);
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Adjuntar" })).toBeVisible();
});
it("Cancelar tras un fallo quita el archivo temporal y limpia el formulario", async () => {
    mocks.registerFile.mockRejectedValueOnce(new Error("Registro no disponible"));
    render(<TarjetaTerceroForm contexto={context} error="" onSave={vi.fn()} compact />);
    fill();
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Registro no disponible"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("user/image.png"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Adjuntar" })).toBeVisible());
    expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
});
it("una subida tardía al salir no crea la tarjeta y elimina el archivo temporal", async () => {
    let finish!: (value: unknown) => void;
    mocks.upload.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const saved = vi.fn();
    const view = render(<TarjetaTerceroForm contexto={context} error="" onSave={saved} compact />);
    fill();
    selectFile();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => finish({ path: "user/late.png" }));
    expect(mocks.registerFile).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith("user/late.png");
    expect(saved).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
});
