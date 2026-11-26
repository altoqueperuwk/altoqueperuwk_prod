import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { tiktokClientesService } from "../evidencias/tiktok-clientes.service";
import { AtencionesPage } from "./atenciones-page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), validate: vi.fn(), register: vi.fn(), update: vi.fn() }));
const profile = vi.hoisted(() => ({ isAdvisor: true, isStoreManager: false, isResolving: false, userId: 24 }));
vi.mock("./clientes-nuevos.service", () => ({ clientesNuevosService: mocks }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => profile }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));

beforeEach(() => {
    vi.resetAllMocks();
    profile.isAdvisor = true;
    profile.isStoreManager = false;
    profile.isResolving = false;
    profile.userId = 24;
    mocks.list.mockResolvedValue({ items: [], total: 0, habilitados: 0, esperando: 0, bloqueados: 0, total_comision: 0 });
    mocks.validate.mockResolvedValue({ existe: false });
    mocks.register.mockResolvedValue({ id: 1, fecha_registro: "2026-10-25T16:00:00Z" });
});
afterEach(cleanup);
it("Jefatura consulta el equipo con autor visible y solo edita registros propios", async () => {
    profile.isAdvisor = false;
    profile.isStoreManager = true;
    profile.userId = 15;
    const row = {
        id: 1,
        nombre: "Cliente Propio",
        documento: "70176064",
        tipo_documento: 1,
        celular: null,
        id_comunidad: null,
        fecha_registro: new Date(Date.now() - 3600000).toISOString(),
        vence: new Date(Date.now() + 86400000).toISOString(),
        estado: "ESPERANDO_OPERACION",
        puede_editar: true,
        propio: true,
        registrado_por: "Jefe Autorizado",
        ganancia: 0,
    };
    mocks.list.mockResolvedValue({
        items: [row, { ...row, id: 2, nombre: "Cliente del Equipo", propio: false, registrado_por: "Asesor del Equipo" }],
        total: 2,
        habilitados: 0,
        esperando: 2,
        bloqueados: 0,
        total_comision: 0,
    });
    render(<AtencionesPage />);
    await screen.findByText("Cliente del Equipo");
    expect(mocks.list).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/), 1, 20, expect.any(Object));
    expect(screen.getByRole("columnheader", { name: "Registrado por" })).toBeTruthy();
    const team = screen.getByText("Cliente del Equipo").closest("tr")!;
    expect(within(team).getByText("Asesor del Equipo")).toBeTruthy();
    expect(within(team).queryByRole("button", { name: "Editar cliente" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Editar cliente" })).toHaveLength(1);
});
it("permite editar solo un cliente sin operaciones y conserva el diálogo si el servidor detecta un vínculo nuevo", async () => {
    // Mantener el cliente dentro de sus 168 horas sin alterar los timers reales de React Aria.
    const registeredAt = Date.now() - 60 * 60 * 1000;
    const row = {
        id: 1,
        nombre: "Cliente Corregible",
        documento: "70176064",
        tipo_documento: 1,
        celular: null,
        id_comunidad: null,
        fecha_registro: new Date(registeredAt).toISOString(),
        vence: new Date(registeredAt + 168 * 60 * 60 * 1000).toISOString(),
        estado: "ESPERANDO_OPERACION",
        puede_editar: true,
        ganancia: 0,
    };
    mocks.list.mockResolvedValue({
        items: [
            row,
            { ...row, id: 2, nombre: "Con operación", estado: "OPERACION_PENDIENTE", puede_editar: false },
            { ...row, id: 3, nombre: "Pagado", estado: "BONO_HABILITADO", puede_editar: true },
        ],
        total: 3,
        habilitados: 1,
        esperando: 2,
        bloqueados: 0,
    });
    mocks.update.mockRejectedValue(new Error("El cliente ya tiene una operacion vinculada"));
    const registerLive = vi.spyOn(tiktokClientesService, "register").mockRejectedValue(new Error("La edición no debe crear un alta LIVE"));
    try {
        render(<AtencionesPage />);
        const edit = await screen.findAllByRole("button", { name: "Editar cliente" });
        expect(edit).toHaveLength(1);
        fireEvent.click(edit[0]);
        const dialog = await screen.findByRole("dialog", { name: "Editar Cliente" });
        // Consultar el editor evita recorrer repetidamente tabla, filtros y formulario de alta.
        const editor = within(dialog);
        const name = editor.getByRole("textbox", { name: /Nombre/ });
        expect(name).toHaveValue("Cliente Corregible");
        fireEvent.change(name, { target: { value: "Nombre corregido" } });
        fireEvent.click(editor.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(1, "70176064", "Nombre corregido", 1, "", null));
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("operacion vinculada");
        expect(dialog).toBeInTheDocument();
        fireEvent.click(editor.getByRole("button", { name: "Cancelar" }));
        await waitFor(() => expect(dialog).not.toBeInTheDocument());
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.validate).not.toHaveBeenCalled();
        expect(mocks.register).not.toHaveBeenCalled();
        expect(registerLive).not.toHaveBeenCalled();
    } finally {
        registerLive.mockRestore();
    }
    // Integración real de tabla + dos formularios + portal/foco/cierre React Aria en jsdom.
    // Bajo carga concurrente superó 5 s en main; margen local, sin ampliar timeouts globales.
}, 10000);

it("filtra por documento y limpiar lo restablece", async () => {
    render(<AtencionesPage />);
    fireEvent.change(await screen.findByPlaceholderText("DNI"), { target: { value: "70176064" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.any(String), 1, 20, expect.objectContaining({ documento: "70176064" })));
    fireEvent.change(screen.getByPlaceholderText("Nombre Cliente"), { target: { value: "Ivonne Ruiz" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.any(String), 1, 20, expect.objectContaining({ nombre: "Ivonne Ruiz" })));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.any(String), 1, 20, expect.objectContaining({ documento: "" })));
    expect(screen.getByRole("button", { name: /^Periodo:/ })).toBeTruthy();
});
it("muestra la comisión por cliente y su suma, separadas del monto operado", async () => {
    mocks.list.mockResolvedValue({
        items: [
            {
                id: 1,
                nombre: "Cliente QA",
                documento: "70176064",
                fecha_registro: "2026-10-25T16:00:00Z",
                vence: "2026-11-01T16:00:00Z",
                estado: "BONO_HABILITADO",
                operacion: "OP-QA",
                servicio: "EFECTIVIZACION",
                monto: 1000,
                ganancia: 0.7,
                estado_operacion: "Pagado",
            },
        ],
        total: 1,
        habilitados: 1,
        esperando: 0,
        bloqueados: 0,
        total_comision: 0.7,
    });
    render(<AtencionesPage />);
    const customer = await screen.findByText("Cliente QA");
    expect(screen.getByRole("heading", { name: "En espera" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elegible" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No cumple" })).toBeInTheDocument();
    expect(within(customer.closest("tr")!).getByText(/S\/\s*0\.70/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Monto" })).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: "Comisión" }).closest("article")!).getByText(/S\/\s*0\.70/)).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Estado de operación" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Estado bono" })).toBeNull();
    expect(screen.getByText("Pagado")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "DNI" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Cliente" })).toBeTruthy();
    expect(screen.getByText("70176064").closest("td")).not.toBe(screen.getByText("Cliente QA").closest("td"));
    expect(screen.getByText(/S\/\s*1,000\.00/)).toBeTruthy();
});
const enterDocument = () => fireEvent.change(screen.getByPlaceholderText("8 dígitos"), { target: { value: "70176064" } });
it("ATC valida y registra al cliente antes de tener una operación", async () => {
    render(<AtencionesPage />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Buscar operación pagada" })).toBeNull();
    enterDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Revisa los datos/)).toBeInTheDocument();
    await screen.findByText(/El cliente es apto/);
    expect(mocks.validate).toHaveBeenCalledWith("70176064", 1, undefined);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Cerrar aviso" })).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre/ }), { target: { value: "Cliente Nuevo QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith("70176064", "Cliente Nuevo QA", 1, "", null));
    await waitFor(() => expect(screen.getByText("Cliente registrado. Se evaluará su primera operación pagada dentro de siete días.")).toBeInTheDocument());
    expect(mocks.list).toHaveBeenLastCalledWith("2026-10", 1, 20, expect.any(Object));
});
it("un cliente existente no permite ingresar otro registro", async () => {
    mocks.validate.mockResolvedValue({ existe: true });
    render(<AtencionesPage />);
    enterDocument();
    await screen.findByText(/El cliente ya existe/);
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("El cliente ya existe");
    expect(screen.getByText(/El cliente ya existe/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Revisa los datos/)).toBeInTheDocument();
    expect(mocks.register).not.toHaveBeenCalled();
});
it("cancelar limpia el registro inline sin ocultar los campos ni guardar", async () => {
    render(<AtencionesPage />);
    enterDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre/ }), { target: { value: "Cliente sin guardar" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByPlaceholderText("8 dígitos")).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /Nombre/ })).toHaveValue("");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.register).not.toHaveBeenCalled();
});
it("ignora una validación tardía si cambió el documento", async () => {
    let resolve!: (value: { existe: boolean }) => void;
    mocks.validate
        .mockReturnValueOnce(
            new Promise((done) => {
                resolve = done;
            }),
        )
        .mockResolvedValueOnce({ existe: true });
    render(<AtencionesPage />);
    enterDocument();
    await waitFor(() => expect(mocks.validate).toHaveBeenCalledWith("70176064", 1, undefined));
    fireEvent.change(screen.getByPlaceholderText("8 dígitos"), { target: { value: "70176065" } });
    resolve({ existe: false });
    await screen.findByText(/El cliente ya existe/);
    expect(screen.queryByText(/El cliente es apto/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Revisa los datos/)).toBeInTheDocument();
});
it("valida CE automáticamente solo al completar nueve dígitos", async () => {
    render(<AtencionesPage />);
    const select = screen.getAllByRole("button", { name: /Tipo Doc\./ }).find((button) => button.textContent?.includes("DNI"))!;
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole("option", { name: "CE" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "12345678" } });
    expect(mocks.validate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: /Nro\. Documento/ }), { target: { value: "123456789" } });
    await screen.findByText(/El cliente es apto/);
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(mocks.validate).toHaveBeenCalledWith("123456789", 2, undefined);
});
it("muestra los estados del servidor y un error de acceso no se presenta como cero", async () => {
    mocks.list.mockResolvedValueOnce({
        items: [
            {
                id: 1,
                nombre: "Cliente QA",
                documento: "70176064",
                fecha_registro: "2026-10-25T16:00:00Z",
                vence: "2026-11-01T16:00:00Z",
                estado: "OPERACION_PENDIENTE",
                operacion: "OP-QA",
                servicio: "POS",
                monto: 100,
                estado_operacion: "Procesado",
                ganancia: 0,
            },
        ],
        total: 1,
        habilitados: 0,
        esperando: 1,
        bloqueados: 0,
    });
    render(<AtencionesPage />);
    await screen.findByText("OP-QA");
    expect(screen.queryByText("Procesado")).toBeNull();
    const pendingRow = screen.getByText("OP-QA").closest("tr")!;
    expect(within(pendingRow).getAllByText("Pendiente").length).toBeGreaterThan(0);
    expect(within(pendingRow).queryByText(/S\/\s*0\.00/)).toBeNull();
    expect(within(screen.getByRole("heading", { name: "Comisión" }).closest("article")!).getByText(/S\/\s*0\.00/)).toBeTruthy();
    mocks.list.mockRejectedValue(new Error("Sin acceso"));
    fireEvent.focus(window);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Sin acceso");
    expect(screen.queryByText(/^0$/)).toBeNull();
});
it("Administración ve la Validación Pagos y su revisión, sin formulario de captación", async () => {
    profile.isAdvisor = false;
    Object.assign(profile, { isAdministrator: true });
    const row = { id: 13053, id_colaborador: 7, nombre: "Cliente Validado", documento: "70176064", estado: "BONO_HABILITADO", ganancia: 0 };
    mocks.list.mockResolvedValue({ items: [row], total: 1, habilitados: 1, esperando: 0, bloqueados: 0, total_comision: 0 });
    const validaciones = vi.fn().mockResolvedValue({ items: [{ id_cliente: 13053, id_evento: 531, estado: "PENDIENTE", importe: null }] });
    Object.assign(mocks, { validacionesPagos: validaciones });
    render(<AtencionesPage />);
    await screen.findByText("Por aprobar");
    expect(screen.getByRole("columnheader", { name: "Validación Pagos" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revisar Validación Pagos" })).toBeTruthy();
    expect(screen.queryByText("Registrar Cliente Nuevo")).toBeNull();
    expect(validaciones).toHaveBeenCalledWith([13053]);
    Object.assign(profile, { isAdministrator: false });
});
