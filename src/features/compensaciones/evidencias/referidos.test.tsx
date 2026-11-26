import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ReferidoForm } from "./referido-form";
import { ReferidoEfectivizacionActions } from "./referido-historial";
import { ReferidoReview } from "./referido-review";
import { ReferidoRowActions } from "./referido-row-actions";
import { ReferidosPage } from "./referidos-page";
import type { Referido, ReferidosResult } from "./referidos.service";

vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({
    useClienteLookup: () => mocks.lookup(),
}));
vi.mock("@/providers/session-cache-provider", () => ({
    useSessionCache: () => ({
        bancos: [
            { id: 1, nombre: "BBVA", id_estado: 1 },
            { id: 2, nombre: "BCP", id_estado: 1 },
        ],
    }),
}));

const mocks = vi.hoisted(() => ({
    lookup: vi.fn(),
    context: vi.fn(),
    list: vi.fn(),
    register: vi.fn(),
    operation: vi.fn(),
    operations: vi.fn(),
    resolve: vi.fn(),
    revert: vi.fn(),
    history: vi.fn(),
    addOperation: vi.fn(),
    resolveOperation: vi.fn(),
}));
vi.mock("./referidos.service", () => ({ referidosService: mocks, referidoError: (error: Error) => error.message }));
vi.mock("./evidencias.service", () => ({
    evidenciasService: { getCallContext: async () => ({ idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: true, puedeRevisar: true }) },
}));

vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        items,
        selectedKey,
        onSelectionChange,
    }: {
        label: string;
        items: { id: string; label: string }[];
        selectedKey: string;
        onSelectionChange: (key: string) => void;
    }) => (
        <label>
            {label}
            <select aria-label={label} value={selectedKey ?? ""} onChange={(e) => onSelectionChange(e.target.value)}>
                {!items.some((item) => item.id === "") && <option value="">Seleccionar</option>}
                {items.map((i) => (
                    <option key={i.id} value={i.id}>
                        {i.label}
                    </option>
                ))}
            </select>
        </label>
    );
    Select.Item = () => null;
    return { Select };
});
vi.mock("@/components/shared/data-table", () => ({
    DataTable: ({
        data,
        toolbar,
        renderActions,
    }: {
        data: Record<string, unknown>[];
        toolbar?: ReactNode;
        renderActions?: (row: Record<string, unknown>) => ReactNode;
    }) => (
        <>
            {toolbar}
            <pre data-testid="rows">{JSON.stringify(data)}</pre>
            {data.map((row) => (
                <div key={Number(row.id)}>{renderActions?.(row)}</div>
            ))}
        </>
    ),
}));
const context = {
    idUsuario: 7,
    idColaborador: 12,
    puedeRegistrar: true,
    puedeAprobar: true,
    puedeRevisar: true,
    puedeAgregarEfectivizacion: true,
    puedeRevertir: true,
};
const item: Referido = {
    id_colaborador_referente: 18,
    id: 1,
    id_evento: 2,
    nombre_referido_snapshot: "Referido ficticio",
    documento_referido_snapshot: "99990001",
    referente_nombre: "Asesor",
    sucursal_nombre: "Lince",
    fecha_referencia: "2026-10-07T15:00:00Z",
    observacion: "",
    estado_referido: "PENDIENTE",
    estado_evento: "PENDIENTE",
    id_usuario_registra: 8,
    importe_aprobado: null,
    operaciones: [],
};
const result = (): ReferidosResult => ({
    items: [item],
    total: 205,
    total_paginas: 11,
    resumen: { pendientes: 200, validados: 5, rechazados: 0, anulados: 0, importe_validado: 40 },
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.lookup.mockReturnValue({ result: null, isLoading: false, error: "" });
    mocks.context.mockResolvedValue(context);
    mocks.operations.mockResolvedValue({ items: [], limite: 100 });
    mocks.list.mockResolvedValue(result());
    mocks.register.mockResolvedValue({});
    mocks.resolve.mockResolvedValue({});
    mocks.revert.mockResolvedValue({});
    mocks.operation.mockResolvedValue({
        id: 42,
        banco: "BCP",
        monto: 1000,
        fecha: "2026-10-07T15:01:00Z",
        codigo: "FICTICIO",
        conversacion: "https://example.test/pancake",
    });
    mocks.history.mockResolvedValue({ items: [], total: 0, total_paginas: 0 });
    mocks.addOperation.mockResolvedValue({});
    mocks.resolveOperation.mockResolvedValue({});
});
afterEach(cleanup);

it("un referido completado después de salir no actualiza la sesión siguiente", async () => {
    let finish!: (value: unknown) => void;
    mocks.register.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const saved = vi.fn();
    const view = render(<ReferidoForm context={context} error="" onSave={saved} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente de prueba" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Monto/ }), { target: { value: "1000" } });
    fireEvent.change(screen.getByRole("combobox", { name: /Banco/ }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.register).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => finish({ id: 10, id_evento: 11 }));
    expect(saved).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
});
describe("Referidos simples", () => {
    it("ordena indicadores, formulario y tabla, y conserva la consulta mensual", async () => {
        render(<ReferidosPage />);
        await screen.findByRole("button", { name: "Historial" });
        const initialMonth = mocks.list.mock.calls[0][0].month;
        const kpi = screen.getByRole("heading", { name: "Pendientes" });
        const form = screen.getByRole("region", { name: "Registrar referido" });
        const table = screen.getByRole("region", { name: "Listado de referidos" });
        expect(kpi.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole("button", { name: /^Periodo:/ })).toBeVisible();
        fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por DNI" }), { target: { value: "99990001" } });
        await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ documento: "99990001", page: 1 })));
        expect(screen.queryByRole("button", { name: "Todo el tiempo" })).toBeNull();
        expect(mocks.list.mock.calls.every(([query]) => /^\d{4}-\d{2}$/.test(query.month))).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await waitFor(() =>
            expect(mocks.list).toHaveBeenLastCalledWith(
                expect.objectContaining({ documento: "", nombre: "", colaborador: "", status: "", month: initialMonth, page: 1 }),
            ),
        );
    });
    it("ATC accede al historial desde el icono sin recibir acciones administrativas", async () => {
        mocks.context.mockResolvedValue({ ...context, puedeAprobar: false, puedeRevisar: false });
        render(<ReferidosPage />);
        const history = await screen.findByRole("button", { name: "Historial" });
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Agregar efectivización" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Revertir validación" })).toBeNull();
        fireEvent.click(history);
        await waitFor(() => expect(mocks.history).toHaveBeenCalledWith(1, 1, 20));
        expect(mocks.operations).not.toHaveBeenCalled();
    });
    it("conserva la nota ampliada al volver al formulario y enviarla al servidor", async () => {
        render(<ReferidoForm context={context} error="" onSave={vi.fn()} />);
        fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
        fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente de prueba" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Monto/ }), { target: { value: "5500" } });
        fireEvent.change(screen.getByRole("combobox", { name: /Banco/ }), { target: { value: "1" } });
        fireEvent.click(screen.getByRole("button", { name: "Ampliar nota" }));
        const editors = screen.getAllByRole("textbox", { name: /Notas/ });
        fireEvent.change(editors[editors.length - 1], { target: { value: "Primera línea\nSeguimiento del referido" } });
        fireEvent.click(screen.getByRole("button", { name: "Volver al formulario" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() =>
            expect(mocks.register).toHaveBeenCalledWith("99990001", "Primera línea\nSeguimiento del referido", expect.any(String), {
                nombre: "Cliente de prueba",
                monto: 5500,
                idBanco: 1,
            }),
        );
    });
    it("mantiene el formulario y sus condiciones visibles sin abrir un modal", async () => {
        render(<ReferidosPage />);
        await screen.findByRole("button", { name: "Historial" });
        expect(screen.queryByRole("button", { name: "Nuevo referido" })).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("button", { name: "Guardar" })).toBeVisible();
        expect(screen.queryByText(/No aplica a pago de tarjeta/)).toBeNull();
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("muestra reversión solo al administrador para un referido aprobado no liquidado", () => {
        const open = vi.fn();
        const approved = { ...item, estado_referido: "VALIDADO", estado_evento: "APROBADO" };
        const view = render(<ReferidoRowActions item={approved} context={context} onOpen={open} />);
        fireEvent.click(screen.getByRole("button", { name: "Revertir validación" }));
        expect(open).toHaveBeenCalledWith("REVERTIR");
        view.rerender(<ReferidoRowActions item={approved} context={{ ...context, puedeRevisar: false }} onOpen={open} />);
        expect(screen.queryByRole("button", { name: "Revertir validación" })).toBeNull();
        view.rerender(<ReferidoRowActions item={{ ...approved, estado_evento: "LIQUIDADO" }} context={context} onOpen={open} />);
        expect(screen.queryByRole("button", { name: "Revertir validación" })).toBeNull();
    });
    it("Jefatura revisa el caso del equipo sin acciones administrativas ni decisión sobre su propio ingreso", () => {
        const chief = { ...context, puedeAgregarEfectivizacion: false, puedeRevertir: false };
        const view = render(<ReferidoRowActions item={item} context={chief} onOpen={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Validar" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Agregar efectivización" })).toBeNull();
        view.rerender(<ReferidoRowActions item={{ ...item, estado_referido: "VALIDADO", estado_evento: "APROBADO" }} context={chief} onOpen={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Revertir validación" })).toBeNull();
        view.rerender(<ReferidoRowActions item={{ ...item, id_colaborador_referente: 12 }} context={chief} onOpen={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
        view.rerender(<ReferidoRowActions item={{ ...item, id_colaborador_referente: undefined }} context={chief} onOpen={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
    });
    it("revierte desde un modal con motivo obligatorio y sin consultar operaciones", async () => {
        const approved = { ...item, estado_referido: "VALIDADO", estado_evento: "APROBADO", version_evento: "2026-10-10T18:00:00Z" };
        const changed = vi.fn();
        render(<ReferidoReview item={approved} context={context} mode="REVERTIR" onClose={vi.fn()} onChanged={changed} />);
        fireEvent.click(screen.getByRole("button", { name: "Confirmar reversión" }));
        expect(mocks.revert).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo de la reversión/ }), { target: { value: "Validación equivocada" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirmar reversión" }));
        await waitFor(() => expect(changed).toHaveBeenCalled());
        expect(mocks.revert).toHaveBeenCalledWith(approved, "Validación equivocada");
        expect(mocks.operations).not.toHaveBeenCalled();
    });
    it("conserva el motivo si el servidor bloquea la reversión", async () => {
        mocks.revert.mockRejectedValueOnce(new Error("Periodo cerrado"));
        const changed = vi.fn();
        render(
            <ReferidoReview
                item={{ ...item, estado_referido: "VALIDADO", estado_evento: "APROBADO" }}
                context={context}
                mode="REVERTIR"
                onClose={vi.fn()}
                onChanged={changed}
            />,
        );
        const reason = screen.getByRole("textbox", { name: /Motivo de la reversión/ });
        fireEvent.change(reason, { target: { value: "Revisar" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirmar reversión" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Periodo cerrado"));
        expect(reason).toHaveValue("Revisar");
        expect(changed).not.toHaveBeenCalled();
    });
    it("valida directamente con la operación elegible sin formulario ni nota", async () => {
        render(<ReferidosPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Validar" }));
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(1, "APROBADO", 42, ""));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(mocks.operations).not.toHaveBeenCalled();
        expect(mocks.addOperation).not.toHaveBeenCalled();
    });
    it("historial no consulta las operaciones ni muestra un formulario de validacion", async () => {
        render(<ReferidoReview item={item} context={context} mode="HISTORIAL" onClose={vi.fn()} onChanged={vi.fn()} />);
        await waitFor(() => expect(mocks.history).toHaveBeenCalledWith(1, 1, 20));
        expect(mocks.operations).not.toHaveBeenCalled();
        expect(mocks.operation).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Validar referido" })).toBeNull();
    });
    it("rechazar desde la fila abre directamente el motivo sin consultas operativas", async () => {
        render(<ReferidoReview item={item} context={context} mode="RECHAZAR" onClose={vi.fn()} onChanged={vi.fn()} />);
        expect(await screen.findByRole("textbox", { name: /Motivo del rechazo/ })).toBeVisible();
        expect(mocks.operations).not.toHaveBeenCalled();
        expect(mocks.operation).not.toHaveBeenCalled();
    });
    it("conserva las acciones autorizadas y sus callbacks", () => {
        const open = vi.fn();
        render(<ReferidoRowActions item={item} context={context} onOpen={open} />);
        for (const name of ["Validar", "Rechazar", "Historial"]) {
            fireEvent.click(screen.getByRole("button", { name }));
        }
        expect(open.mock.calls).toEqual([["VALIDAR"], ["RECHAZAR"], ["HISTORIAL"]]);
        expect(screen.queryByRole("button", { name: "Agregar efectivización" })).toBeNull();
    });
    it.each(["atencion", "jefatura"])("%s solo tiene historial en las acciones de fila", () => {
        render(<ReferidoRowActions item={item} context={{ ...context, puedeAprobar: false, puedeRevisar: false }} onOpen={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Historial" })).toBeVisible();
        expect(screen.queryByRole("button", { name: "Agregar efectivización" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    });
    it("sin capacidades de revisión conserva consulta sin ofrecer decisiones", async () => {
        render(<ReferidoReview item={item} context={{ ...context, puedeAprobar: false, puedeRevisar: false }} onClose={vi.fn()} onChanged={vi.fn()} />);
        await screen.findByText("La validación corresponde al revisor autorizado del equipo o a Administración.");
        expect(screen.queryByRole("button", { name: "Validar referido" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    });
    it("limpia la operación anterior al cambiar de referido mientras carga el nuevo", async () => {
        const changed = vi.fn();
        const view = render(<ReferidoReview item={item} context={context} onClose={vi.fn()} onChanged={changed} />);
        await screen.findByText("BCP");
        let finish!: (value: null) => void;
        mocks.operation.mockImplementationOnce(
            () =>
                new Promise<null>((resolve) => {
                    finish = resolve;
                }),
        );
        view.rerender(<ReferidoReview item={{ ...item, id: 3, id_evento: 4 }} context={context} onClose={vi.fn()} onChanged={changed} />);
        expect(screen.queryByText("BCP")).toBeNull();
        expect((screen.getByRole("button", { name: "Validar referido" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Validar referido" }));
        expect(mocks.resolve).not.toHaveBeenCalled();
        await act(async () => {
            finish(null);
        });
        await screen.findByText(/Sin nuevas operaciones elegibles/);
    });
    it("presenta los campos del legacy y deja la comisión pendiente de configuración", () => {
        render(<ReferidoForm context={context} error="" onSave={vi.fn()} />);
        expect(screen.getByRole("textbox", { name: /Nro\. Documento/ })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: /^Nombre/ })).not.toHaveAttribute("readonly");
        expect(screen.getByRole("spinbutton", { name: /^Monto/ })).toBeVisible();
        expect(screen.getByRole("combobox", { name: /Banco/ })).toBeVisible();
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Monto/ }), { target: { value: "5500" } });
        expect(screen.queryByText(/Monto declarado:|Comisión pendiente de validación/)).toBeNull();
    });
    it("no guarda una declaración mientras se resuelve el cliente", () => {
        mocks.lookup.mockReturnValue({ result: null, isLoading: true, error: "" });
        render(<ReferidoForm context={context} error="" onSave={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
        fireEvent.submit(screen.getByRole("button", { name: "Guardar" }).closest("form")!);
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("Cancelar limpia todos los campos y devuelve el foco al documento sin registrar", () => {
        mocks.lookup.mockReturnValue({ result: { nombre: "Cliente encontrado" }, isLoading: false, error: "" });
        render(<ReferidoForm context={context} error="" onSave={vi.fn()} />);
        const dni = screen.getByRole("textbox", { name: /Nro\. Documento/ });
        fireEvent.change(dni, { target: { value: "99990001" } });
        fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Nombre manual" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Monto/ }), { target: { value: "1500" } });
        fireEvent.change(screen.getByRole("combobox", { name: /Banco/ }), { target: { value: "1" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Notas/ }), { target: { value: "Nota de prueba" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(dni).toHaveValue("");
        expect(dni).toHaveFocus();
        expect(screen.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
        expect(screen.getByRole("spinbutton", { name: /^Monto/ })).toHaveValue(null);
        expect(screen.getByRole("combobox", { name: /Banco/ })).toHaveValue("");
        expect(screen.getByRole("textbox", { name: /Notas/ })).toHaveValue("");
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("bloquea registro sin colaborador vinculado", () => {
        render(<ReferidoForm context={{ ...context, idColaborador: null }} error="" onSave={vi.fn()} />);
        expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("exige nombre, monto positivo y banco antes de guardar", () => {
        render(<ReferidoForm context={context} error="" onSave={vi.fn()} />);
        fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenLastCalledWith(
            "validation",
            "Ingresa el nombre del referido, ingresa un monto mayor a cero, con hasta dos decimales y selecciona un banco.",
        );
        fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente QA" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Monto/ }), { target: { value: "0" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenLastCalledWith("validation", expect.stringContaining("monto mayor a cero"));
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Monto/ }), { target: { value: "5500.25" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenLastCalledWith("validation", "Selecciona un banco.");
        expect(mocks.register).not.toHaveBeenCalled();
    });
    it("valida DNI antes de llamar al backend", () => {
        render(<ReferidoForm context={context} error="" onSave={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(mocks.register).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringContaining("8 dígitos"));
    });
    it("conserva clave en reintento y limpia tras éxito", async () => {
        const saved = vi.fn();
        mocks.register.mockRejectedValueOnce(new Error("Fallo temporal"));
        render(<ReferidoForm context={context} error="" onSave={saved} />);
        fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "99990001" } });
        fireEvent.change(screen.getByRole("textbox", { name: /^Nombre/ }), { target: { value: "Cliente de prueba" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Monto/ }), { target: { value: "5500" } });
        fireEvent.change(screen.getByRole("combobox", { name: /Banco/ }), { target: { value: "1" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Fallo temporal"));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
        expect(mocks.register.mock.calls[1]).toEqual(mocks.register.mock.calls[0]);
        expect(mocks.register.mock.calls[0][3]).toEqual({ nombre: "Cliente de prueba", monto: 5500, idBanco: 1 });
        expect((screen.getByRole("textbox", { name: /Nro\. Documento/ }) as HTMLInputElement).value).toBe("");
    });
    it("valida con operación real sin enviar monto ni tasa", async () => {
        const changed = vi.fn();
        render(<ReferidoReview item={item} context={context} onClose={vi.fn()} onChanged={changed} />);
        await screen.findByText("BCP");
        fireEvent.click(screen.getByRole("button", { name: "Validar referido" }));
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        expect(mocks.resolve).toHaveBeenCalledWith(1, "APROBADO", 42, "", "https://example.test/pancake");
    });
    it("la coincidencia admite aprobación sin conversación de Pancake", async () => {
        mocks.operation.mockResolvedValue({ id: 42, banco: "BCP", monto: 1000, fecha: "2026-10-07T15:01:00Z", codigo: "FICTICIO", conversacion: null });
        const chief = { ...context, puedeAgregarEfectivizacion: false, puedeRevertir: false };
        render(<ReferidoReview item={item} context={chief} onClose={vi.fn()} onChanged={vi.fn()} />);
        await screen.findByText("BCP");
        fireEvent.click(screen.getByRole("button", { name: "Validar referido" }));
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(1, "APROBADO", 42, "", ""));
    });
    it("si se adjunta una conversación, exige un enlace HTTPS", async () => {
        mocks.operation.mockResolvedValue({ id: 42, banco: "BCP", monto: 1000, fecha: "2026-10-07T15:01:00Z", codigo: "FICTICIO", conversacion: null });
        render(<ReferidoReview item={item} context={context} onClose={vi.fn()} onChanged={vi.fn()} />);
        await screen.findByText("BCP");
        fireEvent.change(screen.getByRole("textbox", { name: /^Conversación/ }), { target: { value: "http://example.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Validar referido" }));
        expect(mocks.resolve).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith("validation", "El enlace debe ser HTTPS.");
    });
    it("no permite autoaprobación", async () => {
        render(<ReferidoReview item={{ ...item, id_usuario_registra: 7 }} context={context} onClose={vi.fn()} onChanged={vi.fn()} />);
        await screen.findByText("BCP");
        expect(screen.queryByRole("button", { name: "Validar referido" })).toBeNull();
    });
    it("sin candidato no ofrece validación habilitada", async () => {
        mocks.operation.mockResolvedValue(null);
        render(<ReferidoReview item={item} context={context} onClose={vi.fn()} onChanged={vi.fn()} />);
        await screen.findByText(/Sin nuevas operaciones elegibles/);
        expect((screen.getByRole("button", { name: "Validar referido" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("el rechazo exige motivo y no envía operación", async () => {
        render(<ReferidoReview item={item} context={context} onClose={vi.fn()} onChanged={vi.fn()} />);
        await screen.findByText("BCP");
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
        expect(mocks.resolve).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo del rechazo/ }), { target: { value: "No corresponde" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(1, "RECHAZADO", null, "No corresponde"));
    });
    it("muestra totales del servidor, no de la página visible", async () => {
        render(<ReferidosPage />);
        await screen.findByText(/Referidos visibles:.*205/);
        expect(screen.getByText("200")).toBeTruthy();
        expect(screen.queryByText(/Borradores/)).toBeNull();
    });
    it("descarta respuestas obsoletas al filtrar", async () => {
        let finish!: (value: ReferidosResult) => void;
        mocks.list.mockImplementationOnce(
            () =>
                new Promise<ReferidosResult>((resolve) => {
                    finish = resolve;
                }),
        );
        render(<ReferidosPage />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
        fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por cliente" }), { target: { value: "ficticio" } });
        await screen.findByText(/Referidos visibles:.*205/);
        await act(async () => {
            finish({ ...result(), total: 999 });
        });
        expect(screen.queryByText("999")).toBeNull();
    });
    it("agrega una operación al referido validado y la envía a revisión", async () => {
        const changed = vi.fn();
        render(
            <ReferidoReview
                item={{ ...item, estado_referido: "VALIDADO", estado_evento: "APROBADO" }}
                context={context}
                onClose={vi.fn()}
                onChanged={changed}
            />,
        );
        expect(screen.getByRole("dialog", { name: "Validar efectivización del referido" })).toBeVisible();
        await screen.findByText("BCP");
        fireEvent.click(screen.getByRole("button", { name: "Enviar efectivización a revisión" }));
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        expect(mocks.addOperation).toHaveBeenCalledWith(1, 42);
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
    it("el referido inicial no ofrece agregar efectivización antes de validarse", async () => {
        render(<ReferidoReview item={item} context={context} onClose={vi.fn()} onChanged={vi.fn()} />);
        await screen.findByText("BCP");
        expect(screen.queryByRole("button", { name: "Enviar efectivización a revisión" })).toBeNull();
    });
    it("la aprobación adicional no envía base manual", async () => {
        const changed = vi.fn();
        render(
            <ReferidoEfectivizacionActions
                item={{
                    id: 99,
                    estado_evento: "PENDIENTE",
                    id_usuario_registra: 8,
                    periodo_imputacion: "2026-10-01",
                    fecha_evento: "2026-10-07",
                    banco: "BCP",
                    monto: 1000,
                    importe_aprobado: null,
                }}
                context={context}
                onChanged={changed}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await waitFor(() => expect(changed).toHaveBeenCalled());
        expect(mocks.resolveOperation).toHaveBeenCalledWith(99, "APROBADO", "");
    });
    it("no permite autoaprobar una efectivización adicional", () => {
        render(
            <ReferidoEfectivizacionActions
                item={{
                    id: 99,
                    estado_evento: "PENDIENTE",
                    id_usuario_registra: 7,
                    periodo_imputacion: "2026-10-01",
                    fecha_evento: "2026-10-07",
                    banco: "BCP",
                    monto: 1000,
                    importe_aprobado: null,
                }}
                context={context}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button", { name: "Validar" })).toBeNull();
        expect(screen.getByText("Esperando revisión")).toBeTruthy();
    });
});
