import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ReferidosPage } from "./referidos-page";

const mocks = vi.hoisted(() => ({
    context: vi.fn(),
    list: vi.fn(),
    operation: vi.fn(),
    resolve: vi.fn(),
    profile: { userId: 24, isAdvisor: true, isFacturacion: false, isStoreManager: false, isAdministrator: false, isResolving: false },
}));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));
vi.mock("./referidos.service", () => ({ referidosService: mocks, referidoError: (cause: Error) => cause.message }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./referido-form", () => ({ ReferidoForm: () => <div>Captura</div> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));

const item = {
    id: 1,
    id_evento: 2,
    nombre_referido_snapshot: "Cliente de auditoría",
    documento_referido_snapshot: "00123456",
    referente_nombre: "Asesora",
    sucursal_nombre: "Lince",
    fecha_referencia: "2026-10-01T15:30:00Z",
    estado_referido: "PENDIENTE",
    estado_evento: "PENDIENTE",
    id_usuario_registra: 7,
    importe_aprobado: 0,
    operaciones: [],
    monto_declarado: 5000,
    banco_declarado: "BCP",
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.profile.userId = 24;
    mocks.profile.isAdvisor = true;
    mocks.profile.isFacturacion = false;
    mocks.profile.isResolving = false;
    mocks.context.mockResolvedValue({ idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false });
    mocks.list.mockResolvedValue({
        items: [item],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 1, validados: 0, rechazados: 0, anulados: 0, importe_validado: 0 },
    });
});

it("no consulta datos mientras se resuelve la identidad", () => {
    mocks.profile.isResolving = true;
    render(<ReferidosPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando acceso");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
});
it("muestra la coincidencia automática sin convertir el monto vinculado en comisión aprobada", async () => {
    mocks.list.mockResolvedValue({
        items: [{ ...item, coincidencia: { estado: "ENCONTRADO", cantidad: 1, operacion: { id: 42, banco: "BBVA", monto: 5000 } } }],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 1, validados: 0, rechazados: 0, anulados: 0, importe_validado: 0 },
    });
    render(<ReferidosPage />);
    const row = (await screen.findByText("Cliente de auditoría")).closest("tr")!;
    await waitFor(() => expect(within(row).getAllByText("Pendiente")[0]).toBeVisible());
    expect(within(row).getByText("BBVA")).toBeVisible();
    expect(within(row).getByText(/5,000\.00/)).toBeVisible();
    expect(within(row).getAllByText("Pendiente").length).toBeGreaterThan(1);
});

it("aplica filtros independientes automáticamente y Limpiar los restablece", async () => {
    render(<ReferidosPage />);
    await screen.findByText("Cliente de auditoría");
    fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por DNI" }), { target: { value: "12a34567890" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por cliente" }), { target: { value: "Cliente" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por colaborador" }), { target: { value: "Equipo" } });
    await waitFor(() =>
        expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ documento: "123456789", nombre: "Cliente", colaborador: "Equipo", page: 1 })),
    );
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() =>
        expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ documento: "", nombre: "", colaborador: "", status: "", page: 1 })),
    );
});

it("explica las condiciones trazables de la comisión sin consultar ni modificar registros", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    render(<ReferidosPage />);
    await screen.findByText("Cliente de auditoría");
    fireEvent.click(screen.getByRole("button", { name: "Ver información de Referidos" }));
    const dialog = await screen.findByRole("dialog", { name: "Información de Referidos" });
    expect(within(dialog).getByText("Referido", { exact: true })).toBeVisible();
    expect(within(dialog).getByText("0.40% del monto elegible")).toBeVisible();
    expect(within(dialog).getByText(/168 horas/)).toBeVisible();
    expect(within(dialog).getByText(/Pago Deuda, POS ni Link/)).toBeVisible();
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Información de Referidos" })).toBeNull());
    request.mockRestore();
});

it("Limpiar permite recuperar un fallo de permisos del formulario sin recargar la sesión", async () => {
    mocks.context.mockRejectedValueOnce(new Error("Consulta de permisos no disponible"));
    render(<ReferidosPage />);
    await screen.findByText("Cliente de auditoría");
    await act(async () => {
        await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(mocks.context).toHaveBeenCalledTimes(2));
});

it("descarta filas y permisos del usuario anterior incluso si su consulta termina tarde", async () => {
    let finishOld!: (value: unknown) => void;
    mocks.list.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finishOld = resolve;
            }),
    );
    const { rerender } = render(<ReferidosPage />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.profile.userId = 30;
    mocks.list.mockResolvedValue({ items: [], total: 0, total_paginas: 1, resumen: { pendientes: 0, validados: 0, rechazados: 0, importe_validado: 0 } });
    rerender(<ReferidosPage />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await act(async () => {
        finishOld({ items: [item], total: 1, total_paginas: 1, resumen: { pendientes: 1, importe_validado: 0 } });
    });
    expect(screen.queryByText("Cliente de auditoría")).toBeNull();
    expect(mocks.context).toHaveBeenCalledTimes(2);
});
afterEach(cleanup);

it("muestra nombres normalizados conservando el original y la nota completa", async () => {
    mocks.list.mockResolvedValue({
        items: [
            { ...item, nombre_referido_snapshot: "CLIENTE DEMOSTRACIÓN", referente_nombre: "EQUIPO DE PRUEBA", observacion: "Primera línea\nSegunda línea" },
        ],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 1, validados: 0, rechazados: 0, anulados: 0, importe_validado: 0 },
    });
    render(<ReferidosPage />);
    const name = await screen.findByText("Cliente Demostración");
    expect(name).toHaveAttribute("title", "CLIENTE DEMOSTRACIÓN");
    expect(screen.getByText("Equipo De Prueba")).toHaveAttribute("title", "EQUIPO DE PRUEBA");
    expect(screen.getByText("Primera línea Segunda línea")).toHaveAttribute("title", "Primera línea\nSegunda línea");
});

it("activa la identidad aprobada y la retira al salir de Referidos", () => {
    const { unmount } = render(<ReferidosPage />);
    expect(document.documentElement).toHaveClass("atk-brand");
    unmount();
    expect(document.documentElement).not.toHaveClass("atk-brand");
});
it("separa declaración de monto vinculado y no representa la comisión pendiente como cero", async () => {
    render(<ReferidosPage />);
    const row = (await screen.findByText("Cliente de auditoría")).closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("00123456");
    expect(cells[1]).toHaveTextContent("Cliente de auditoría");
    expect(cells[5]).toHaveTextContent("Pendiente");
    expect(cells[6]).toHaveTextContent("Pendiente");
    expect(within(row).queryByText(/5,000.00|0.00/)).toBeNull();
    expect(within(row).queryByRole("button", { name: "Validar" })).toBeNull();
});
it("muestra únicamente el monto de las operaciones vinculadas y la comisión confirmada en PEN", async () => {
    mocks.list.mockResolvedValueOnce({
        items: [
            {
                ...item,
                estado_referido: "VALIDADO",
                estado_evento: "APROBADO",
                importe_aprobado: 4,
                operaciones: [{ banco_snapshot: "BCP", monto_operacion_snapshot: 1000, importe_comision: 4 }],
            },
        ],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 0, validados: 1, rechazados: 0, anulados: 0, importe_validado: 4 },
    });
    render(<ReferidosPage />);
    const row = (await screen.findByText("Cliente de auditoría")).closest("tr")!;
    expect(within(row).getByText(/1,000.00/)).toHaveTextContent(/S/);
    expect(within(row).getByText(/4.00/)).toHaveTextContent(/S/);
    expect(within(row).queryByText(/5,000.00/)).toBeNull();
});
it("expone el fallo de consulta sin anunciar resultados de cero", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Sin permiso para consultar referidos"));
    render(<ReferidosPage />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Sin permiso para consultar referidos");
    expect(screen.queryByText("Cliente de auditoría")).toBeNull();
    expect(screen.getByRole("button", { name: "Limpiar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
});

it("oculta la captura cuando el contexto del servidor no autoriza registrar", async () => {
    mocks.context.mockResolvedValue({ idUsuario: 99, idColaborador: null, puedeRegistrar: false, puedeAprobar: true, puedeRevisar: true });
    render(<ReferidosPage />);
    await screen.findByText("Cliente de auditoría");
    expect(screen.queryByRole("region", { name: "Registrar referido" })).toBeNull();
    expect(screen.queryByText("Captura")).toBeNull();
});

it("muestra No aplica para una comisión rechazada sin importe", async () => {
    mocks.list.mockResolvedValue({
        items: [{ ...item, estado_referido: "RECHAZADO", importe_aprobado: 0 }],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 0, validados: 0, rechazados: 1, importe_validado: 0 },
    });
    render(<ReferidosPage />);
    const row = (await screen.findByText("Cliente de auditoría")).closest("tr")!;
    await waitFor(() => expect(within(row).getByText("No aplica")).toBeVisible());
});

const reviewer = () => {
    mocks.context.mockResolvedValue({ idUsuario: 99, idColaborador: null, puedeRegistrar: false, puedeAprobar: true, puedeRevisar: true });
    mocks.operation.mockResolvedValue({ id: 42, monto: 5000 });
    mocks.resolve.mockResolvedValue({ id: 2, id_referido: 1, estado_evento: "APROBADO" });
};
it("rechaza desde la fila sin formulario, consulta operativa ni motivo obligatorio", async () => {
    reviewer();
    render(<ReferidosPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(1, "RECHAZADO", null, ""));
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alertSpy).toHaveBeenCalledWith("success", "Referido rechazado");
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
});
it("bloquea doble clic y acciones incompatibles mientras resuelve", async () => {
    reviewer();
    let finish!: () => void;
    mocks.resolve.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            }),
    );
    render(<ReferidosPage />);
    const approve = await screen.findByRole("button", { name: "Validar" });
    fireEvent.click(approve);
    fireEvent.click(approve);
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Historial" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => finish());
    expect(mocks.operation).toHaveBeenCalledOnce();
});
it("una aprobación sin operación elegible informa error y refresca sin éxito falso", async () => {
    reviewer();
    mocks.operation.mockResolvedValueOnce(null);
    render(<ReferidosPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Validar" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", expect.stringContaining("elegible")));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalledWith("success", expect.anything());
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
});
it("un conflicto del servidor se muestra y actualiza fila y KPI", async () => {
    reviewer();
    mocks.resolve.mockRejectedValueOnce(new Error("El registro ya fue resuelto"));
    render(<ReferidosPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "El registro ya fue resuelto"));
    expect(alertSpy).not.toHaveBeenCalledWith("success", expect.anything());
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
});
it("no muta tras cambio de usuario mientras consulta la operación elegible", async () => {
    reviewer();
    let finish!: (value: unknown) => void;
    mocks.operation.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const view = render(<ReferidosPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Validar" }));
    await waitFor(() => expect(mocks.operation).toHaveBeenCalledOnce());
    mocks.profile.userId = 40;
    view.rerender(<ReferidosPage />);
    await act(async () => finish({ id: 42, monto: 5000 }));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
});
it("deshabilita aprobar una coincidencia ambigua sin ampliar facultad de revisión", async () => {
    reviewer();
    mocks.list.mockResolvedValue({
        items: [{ ...item, coincidencia: { estado: "AMBIGUO", cantidad: 2, operacion: null } }],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 1, validados: 0, rechazados: 0, anulados: 0, importe_validado: 0 },
    });
    render(<ReferidosPage />);
    expect(await screen.findByRole("button", { name: "Validar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeEnabled();
    expect(mocks.resolve).not.toHaveBeenCalled();
});

it("Facturación edita y elimina sus referidos como ATC", async () => {
    mocks.profile.isAdvisor = false;
    mocks.profile.isFacturacion = true;
    mocks.list.mockResolvedValue({
        items: [{ ...item, id_usuario_registra: 7 }],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 1, validados: 0, rechazados: 0, anulados: 0, importe_validado: 0 },
    });
    render(<ReferidosPage />);
    const row = (await screen.findByText("Cliente de auditoría")).closest("tr")!;
    expect(within(row).getByRole("button", { name: "Editar referido" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Eliminar referido" })).toBeInTheDocument();
});

it("Marketing registra, edita y elimina sus referidos", async () => {
    mocks.profile.isAdvisor = false;
    mocks.profile.isFacturacion = false;
    Object.assign(mocks.profile, { isMarketing: true });
    mocks.list.mockResolvedValue({
        items: [{ ...item, id_usuario_registra: 7 }],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 1, validados: 0, rechazados: 0, anulados: 0, importe_validado: 0 },
    });
    render(<ReferidosPage />);
    const row = (await screen.findByText("Cliente de auditoría")).closest("tr")!;
    expect(within(row).getByRole("button", { name: "Editar referido" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Eliminar referido" })).toBeInTheDocument();
    Object.assign(mocks.profile, { isMarketing: false });
});
