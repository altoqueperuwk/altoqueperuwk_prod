import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { EvidenciaEvento } from "./evidencias.types";
import { LlamadaActions } from "./llamada-actions";
import { LlamadaForm } from "./llamada-form";

const mocks = vi.hoisted(() => ({ register: vi.fn(), resolve: vi.fn(), lookup: vi.fn() }));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({
    useClienteLookup: (dni: string) => mocks.lookup(dni),
}));
vi.mock("./evidencias.service", () => ({ evidenciasService: { registerCall: mocks.register, resolve: mocks.resolve } }));

vi.mock("@/components/base/select/select", () => ({
    Select: Object.assign(
        ({
            label,
            items,
            selectedKey,
            onSelectionChange,
        }: {
            label: string;
            items: Array<{ id: number | string; label: string }>;
            selectedKey: number | string | null;
            onSelectionChange: (key: string) => void;
        }) => (
            <select aria-label={label} value={selectedKey ?? ""} onChange={(e) => onSelectionChange(e.target.value)}>
                <option value="">Seleccionar</option>
                {items.map((i) => (
                    <option key={i.id} value={i.id}>
                        {i.label}
                    </option>
                ))}
            </select>
        ),
        { Item: () => null },
    ),
}));
const context = { idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: true, puedeRevisar: true };
const call = { id: 30, usuarioRegistraId: 8, estado: "PENDIENTE", tarifaRegistro: { tipoCalculo: "POR_UNIDAD", valor: 0.2 } } as EvidenciaEvento;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookup.mockReturnValue({ result: null, isLoading: false, error: "" });
    mocks.register.mockResolvedValue({ id: 30, estado_evento: "PENDIENTE" });
    mocks.resolve.mockResolvedValue({});
});
afterEach(cleanup);
const fill = () => {
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente ficticio" } });
    expect(screen.queryByRole("textbox", { name: /Evidencia/ })).toBeNull();
};

describe("Llamadas: flujo simple del legacy", () => {
    it("autocompleta nombre y celular al resolver la búsqueda por DNI", () => {
        const { rerender } = render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
        mocks.lookup.mockReturnValue({ result: { id: 1, nombre: "Cliente encontrado", celular: ["987654321"] }, isLoading: false, error: "" });
        rerender(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        expect(mocks.lookup).toHaveBeenLastCalledWith("99990001");
        expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Cliente encontrado");
        expect(screen.getByRole("textbox", { name: /Celular/ })).toHaveValue("987654321");
    });
    it("envía celular opcional y Cancelar limpia sin registrar", async () => {
        render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        fill();
        fireEvent.change(screen.getByRole("textbox", { name: /Celular/ }), { target: { value: "987654321" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(screen.getByRole("textbox", { name: /Nro\. Documento/ })).toHaveValue("");
        await waitFor(() => expect(screen.getByRole("textbox", { name: /Celular/ })).toHaveValue(""));
        expect(mocks.register).not.toHaveBeenCalled();
        fill();
        fireEvent.change(screen.getByRole("textbox", { name: /Celular/ }), { target: { value: "987654321" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.register).toHaveBeenCalledWith("99990001", "Cliente ficticio", expect.any(String), undefined, "987654321"));
        await waitFor(() => expect(screen.getByRole("textbox", { name: /Celular/ })).toHaveValue(""));
    });
    it("no reutiliza el contacto anterior al cambiar el DNI", () => {
        render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        fill();
        fireEvent.change(screen.getByRole("textbox", { name: /Celular/ }), { target: { value: "987654321" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990002" } });
        expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
        expect(screen.getByRole("textbox", { name: /Celular/ })).toHaveValue("");
    });
    it("bloquea Guardar mientras busca el cliente", () => {
        mocks.lookup.mockReturnValue({ result: null, isLoading: true, error: "" });
        render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent("Buscando cliente");
    });
    it.each(["jefe de sede", "administrador"])("%s registra para sí sin elegir colaborador", async () => {
        render(<LlamadaForm contexto={{ ...context, puedeElegirColaborador: true }} error="" onSave={vi.fn()} />);
        expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("self");
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.register).toHaveBeenCalledWith("99990001", "Cliente ficticio", expect.any(String), undefined, null));
    });
    it("permite asignar a otro y volver a Para mí sin reutilizar la clave de un beneficiario distinto", async () => {
        mocks.register.mockRejectedValueOnce(new Error("Sin conexión"));
        render(
            <LlamadaForm
                contexto={{ ...context, puedeElegirColaborador: true, colaboradores: [{ id: 18, nombre: "Otro asesor", sede: "Lince" }] }}
                error=""
                onSave={vi.fn()}
            />,
        );
        fill();
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "18" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Sin conexión"));
        await waitFor(() => expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false));
        expect(mocks.register.mock.calls[0][3]).toBe(18);
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "self" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(2));
        expect(mocks.register.mock.calls[1]).toHaveLength(5);
        expect(mocks.register.mock.calls[1][2]).not.toBe(mocks.register.mock.calls[0][2]);
    });
    it("el administrador sin ficha selecciona beneficiario y registra sin inventar una asociación", async () => {
        render(
            <LlamadaForm
                contexto={{ ...context, idColaborador: null, puedeElegirColaborador: true, colaboradores: [{ id: 12, nombre: "Asesor QA", sede: "Lince" }] }}
                error=""
                onSave={vi.fn()}
            />,
        );
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(mocks.register).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith("error", expect.stringContaining("ficha de colaborador activa"));
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "12" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.register).toHaveBeenCalledWith("99990001", "Cliente ficticio", expect.any(String), 12, null));
    });
    it("atención al cliente no elige otro beneficiario ni tiene acciones de revisión", () => {
        const atc = { ...context, puedeElegirColaborador: false, puedeAprobar: false, puedeRevisar: false };
        render(
            <>
                <LlamadaForm contexto={atc} error="" onSave={vi.fn()} />
                <LlamadaActions item={call} contexto={atc} onChanged={vi.fn()} onDetail={vi.fn()} />
            </>,
        );
        expect(screen.queryByRole("combobox")).toBeNull();
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    });
    it("muestra DNI, nombre, celular opcional, Guardar y Cancelar sin el texto anterior", () => {
        render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        expect(screen.getAllByRole("textbox")).toHaveLength(3);
        expect(screen.getAllByRole("button")).toHaveLength(2);
        expect(screen.queryByText(/Fecha y hora|beneficiario|borrador|sustento/i)).toBeNull();
        expect(screen.queryByText(/Al guardar la llamada/)).toBeNull();
    });
    it("guarda con una sola RPC, sin mandar beneficiario ni fecha", async () => {
        const saved = vi.fn();
        render(<LlamadaForm contexto={context} error="" onSave={saved} />);
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
        expect(mocks.register).toHaveBeenCalledWith("99990001", "Cliente ficticio", expect.any(String), undefined, null);
        expect((screen.getByRole("textbox", { name: /Nro\. Documento/ }) as HTMLInputElement).value).toBe("");
    });
    it.each([
        [{ ...context, idColaborador: null }, "colaborador activo"],
        [{ ...context, puedeRegistrar: false }, "permiso"],
    ])("bloquea registro sin asociación o permiso", (ctx, message) => {
        render(<LlamadaForm contexto={ctx} error="" onSave={vi.fn()} />);
        expect(screen.getByRole("status").textContent).toContain(message);
        expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("un fallo del contexto nunca habilita el formulario", () => {
        render(<LlamadaForm contexto={null} error="No se pudieron verificar los permisos" onSave={vi.fn()} />);
        expect(screen.getByRole("alert", { hidden: true }).textContent).toContain("verificar");
        expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("valida DNI y nombre antes de llamar al backend", () => {
        render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringContaining("DNI"));
        fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringContaining("nombre"));
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("conserva datos y clave para reintentar tras un error de red", async () => {
        mocks.register.mockRejectedValueOnce(new Error("Sin conexión"));
        render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Sin conexión"));
        await waitFor(() => expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(2));
        expect(mocks.register.mock.calls[1]).toEqual(mocks.register.mock.calls[0]);
    });
    it("aprueba una llamada por unidad sin pedir importes", async () => {
        render(<LlamadaActions item={call} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(30, "APROBADO", "", null, 1));
    });
    it("rechaza directamente sin formulario de motivo", async () => {
        render(<LlamadaActions item={call} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(30, "RECHAZADO", "", null, null));
    });
    it.each([
        [call, { ...context, puedeAprobar: false }],
        [{ ...call, usuarioRegistraId: 7 }, context],
        [{ ...call, estado: "APROBADO" as const }, context],
    ])("no ofrece aprobación sin permiso, para registros propios o resueltos", (item, ctx) => {
        render(<LlamadaActions item={item} contexto={ctx} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    });
    it("envía la decisión sin inventar base o cantidad para una tarifa porcentual", async () => {
        const detail = vi.fn();
        render(
            <LlamadaActions
                item={{ ...call, tarifaRegistro: { tipoCalculo: "PORCENTAJE", valor: 8 } }}
                contexto={context}
                onChanged={vi.fn()}
                onDetail={detail}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(30, "APROBADO", "", null, null));
        expect(detail).not.toHaveBeenCalled();
    });
    it("distingue los permisos de aprobar y revisar", () => {
        render(<LlamadaActions item={call} contexto={{ ...context, puedeAprobar: false }} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
    });
    it("no duplica el registro mientras la primera solicitud está pendiente", async () => {
        let complete!: (value: unknown) => void;
        mocks.register.mockReturnValueOnce(
            new Promise((resolve) => {
                complete = resolve;
            }),
        );
        render(<LlamadaForm contexto={context} error="" onSave={vi.fn()} />);
        fill();
        const button = screen.getByRole("button", { name: "Guardar" });
        fireEvent.click(button);
        fireEvent.click(button);
        expect(mocks.register).toHaveBeenCalledTimes(1);
        complete({ id: 30 });
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("success", expect.any(String)));
    });
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
    const view = render(<LlamadaForm contexto={context} error="" onSave={saved} />);
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
