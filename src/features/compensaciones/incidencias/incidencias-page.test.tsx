import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { IncidenciasPage } from "./incidencias-page";
import type { IncidenciaCatalogo, IncidenciaEvento, IncidenciasResult } from "./incidencias.types";

const mocks = vi.hoisted(() => ({
    getList: vi.fn(),
    getCatalog: vi.fn(),
    isAdvisor: false,
    isFacturacion: false,
    isPagos: false,
    isMarketing: false,
    resolve: vi.fn(),
}));
vi.mock("./incidencias.service", () => ({ incidenciasService: mocks }));

vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({ isAdvisor: mocks.isAdvisor, isFacturacion: mocks.isFacturacion, isPagos: mocks.isPagos, isMarketing: mocks.isMarketing }),
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <input aria-label="Periodo" value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));
vi.mock("./incidencia-popup", () => ({
    IncidenciaPopup: ({ catalog }: { catalog: IncidenciaCatalogo }) => <p>Tipos del registro: {catalog.tipos.map((item) => item.codigo).join(", ")}</p>,
}));
vi.mock("./incidencia-detail-modal", () => ({
    IncidenciaDetailModal: ({ item }: { item: IncidenciaEvento | null }) => (item ? <p>Detalle recibido: {item.id}</p> : null),
}));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <label>
            {label}
            <input aria-label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    ),
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        items,
        selectedKey,
        onSelectionChange,
    }: {
        label?: string;
        items: Array<{ id: number | string; label: string }>;
        selectedKey: number | string;
        onSelectionChange: (key: string) => void;
    }) => (
        <label>
            {label}
            <select aria-label={label ?? "Filas"} value={selectedKey ?? ""} onChange={(event) => onSelectionChange(event.target.value)}>
                {items.map((item) => (
                    <option key={item.id} value={item.id}>
                        {item.label}
                    </option>
                ))}
            </select>
        </label>
    );
    Select.Item = () => null;
    return { Select };
});
const item: IncidenciaEvento = {
    id: 8,
    idTipoEvento: 1,
    idPenalidadTipo: 1,
    tipoEventoNombre: "Penalidad",
    categoria: "PENALIDAD",
    requiereRespuesta: false,
    reportanteDocumento: "87654321",
    sucursalOrigenNombre: "Lince",
    titulo: "Reporte de prueba",
    usuarioRegistraNombre: "Jefe Sede",
    estado: "PENDIENTE",
    fechaEvento: "2026-10-22T14:00:00Z",
    penalidadNombre: "Error de prueba",
    motivo: "Verificar documento",
    responsableNombre: "ATC Sede",
    responsableDocumento: "12345678",
    reportanteNombre: "Jefe Sede",
    sucursalResponsableNombre: "Lince",
    montoReferencia: 2,
    montoBonoReportante: 1,
    importeAprobado: null,
    revisiones: [],
    evidencia: [],
};
const result = (): IncidenciasResult => ({
    items: [item],
    totalPages: 1,
    resumen: { recibidosPendientes: 1, aprobados: 0, rechazados: 0, anulados: 0, totalDescuentosAprobados: 0, totalBonosReportantes: 0 },
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdvisor = false;
    mocks.isFacturacion = false;
    mocks.isPagos = false;
    mocks.isMarketing = false;
    mocks.getCatalog.mockResolvedValue({ tipos: [], reportantes: [], responsables: [], penalidades: [] });
    mocks.getList.mockResolvedValue(result());
});

it("la opción Uniforme consulta su concepto en servidor y no permite cambiar a auditoría", async () => {
    render(<IncidenciasPage concept="UNIFORME" />);
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledWith(expect.objectContaining({ concept: "UNIFORME", tray: "TODOS" })));
    expect(screen.getByRole("heading", { name: "Falta de Uniforme Completo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Auditoría de pagos/ })).toBeNull();
});
afterEach(cleanup);

it("agrupa la escritura y consulta el último filtro sin pulsar Actualizar", async () => {
    render(<IncidenciasPage />);
    await screen.findByText("ATC Sede");
    const calls = mocks.getList.mock.calls.length;
    const search = screen.getByPlaceholderText("Nombre o DNI Colaborador");
    fireEvent.change(search, { target: { value: "A" } });
    fireEvent.change(search, { target: { value: "Asesor" } });
    expect(mocks.getList).toHaveBeenCalledTimes(calls);
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Asesor", page: 1 })));
    expect(mocks.getList).toHaveBeenCalledTimes(calls + 1);
});

it("Limpiar cancela una búsqueda todavía pendiente", async () => {
    render(<IncidenciasPage />);
    await screen.findByText("ATC Sede");
    fireEvent.change(screen.getByPlaceholderText("Nombre o DNI Colaborador"), { target: { value: "Pendiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));
    expect(mocks.getList.mock.calls.some(([query]) => query.search === "Pendiente")).toBe(false);
    expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ search: "", page: 1 }));
});

it("abre el detalle sin atribuir decisiones al perfil no ATC", async () => {
    render(<IncidenciasPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de incidencia" }));
    expect(screen.getByText("Detalle recibido: 8")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Revisar|Aprobar|Rechazar|Observar/ })).toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
    expect(screen.queryByText(/Registrar un reporte no aprueba descuentos ni bonos/)).toBeNull();
});
it("envía búsqueda, rango y estado al servidor y conserva la bandeja al limpiar", async () => {
    render(<IncidenciasPage />);
    await screen.findByText("ATC Sede");
    fireEvent.click(screen.getByRole("button", { name: "Enviados" }));
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "ENVIADOS" })));
    fireEvent.change(screen.getByPlaceholderText("Nombre o DNI Colaborador"), { target: { value: "María" } });
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "PENDIENTE" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-08-31" } });
    await waitFor(() =>
        expect(mocks.getList).toHaveBeenLastCalledWith(
            expect.objectContaining({ tray: "ENVIADOS", search: "María", status: "PENDIENTE", from: "2026-08-01", to: "2026-08-31", page: 1 }),
        ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "ENVIADOS", search: "", status: "", page: 1 })));
    const query = mocks.getList.mock.lastCall![0];
    expect(query.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(query.to.slice(0, 7)).toBe(query.from.slice(0, 7));
});
it("rechaza un rango invertido sin consultar ni resolver", async () => {
    render(<IncidenciasPage />);
    await screen.findByText("ATC Sede");
    const calls = mocks.getList.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-08-01" } });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));
    expect(mocks.getList).toHaveBeenCalledTimes(calls);
    expect(mocks.resolve).not.toHaveBeenCalled();
});
it("conserva el mensaje RPC y permite reintentar una consulta fallida", async () => {
    mocks.getList.mockRejectedValueOnce({ message: "Sede no autorizada" });
    render(<IncidenciasPage />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Sede no autorizada");
    expect(screen.queryByText("ATC Sede")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar consulta" }));
    await waitFor(() => expect(screen.getByText("ATC Sede")).toBeVisible());
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
});
it("distingue un fallo del catálogo de un catálogo vacío", async () => {
    mocks.getCatalog.mockRejectedValueOnce({ message: "Catálogo sin acceso" });
    render(<IncidenciasPage />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Catálogo sin acceso");
    expect(screen.queryByText("No hay reportes disponibles para registrar")).toBeNull();
    await waitFor(() => expect(screen.getByText("ATC Sede")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar catálogo" }));
    await waitFor(() => expect(screen.queryByRole("alert", { hidden: true })).toBeNull());
    expect(mocks.getCatalog).toHaveBeenCalledTimes(2);
});

it("Auditoría Activa inicia en Enviados y usa solo el reporte existente AUDITORIA_ACTIVA", async () => {
    mocks.getCatalog.mockResolvedValue({
        tipos: [
            { id: 1, codigo: "AUDITORIA_ACTIVA", categoria: "AUDITORIA_PAGO" },
            { id: 2, codigo: "REPORTE_PENALIDAD", categoria: "PENALIDAD" },
            { id: 3, codigo: "OTRA_AUDITORIA", categoria: "AUDITORIA_PAGO" },
        ],
        reportantes: [{ id: 7 }],
        responsables: [],
        penalidades: [],
    });
    render(<IncidenciasPage auditoriaOnly />);
    expect(screen.getByRole("heading", { level: 1, name: "Auditoría de Pagos" })).toBeVisible();
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "ENVIADOS", category: "AUDITORIA_PAGO" })));
    expect(await screen.findByText("Tipos del registro: AUDITORIA_ACTIVA")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Opciones de incidencias" })).toBeNull();
    expect(screen.getByRole("button", { name: "Enviados" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "ENVIADOS", category: "AUDITORIA_PAGO", status: "" })));
    expect(screen.queryByText(/Adjunta el enlace de sustento antes de enviar/)).toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
});

it("no sustituye Auditoría Activa por otro formulario cuando falta su tipo", async () => {
    mocks.getCatalog.mockResolvedValue({
        tipos: [{ id: 2, codigo: "REPORTE_PENALIDAD", categoria: "PENALIDAD" }],
        reportantes: [{ id: 7 }],
        responsables: [],
        penalidades: [],
    });
    render(<IncidenciasPage auditoriaOnly />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No está habilitado el registro de Auditoría Activa"));
    expect(screen.queryByText(/Tipos del registro:/)).toBeNull();
});

it("reinicia categoría y bandeja al cambiar entre las dos rutas", async () => {
    const view = render(<IncidenciasPage />);
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "RECIBIDOS", category: "" })));
    view.rerender(<IncidenciasPage auditoriaOnly />);
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "ENVIADOS", category: "AUDITORIA_PAGO" })));
    view.rerender(<IncidenciasPage />);
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "RECIBIDOS", category: "" })));
});

it("Periodo sincroniza las fechas del mes y conserva el concepto autorizado", async () => {
    render(<IncidenciasPage concept="UNIFORME" />);
    await waitFor(() => expect(mocks.getList).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-02" } });
    await waitFor(() =>
        expect(mocks.getList).toHaveBeenLastCalledWith(
            expect.objectContaining({ from: "2026-02-01", to: "2026-02-28", concept: "UNIFORME", tray: "TODOS", page: 1 }),
        ),
    );
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-02-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-02-28");
});

it("Facturación consulta sus penalidades en solo lectura: sin formulario de registro y con tres estados", async () => {
    mocks.isFacturacion = true;
    mocks.getCatalog.mockResolvedValue({
        tipos: [{ id: 2, codigo: "REPORTE_PENALIDAD", categoria: "PENALIDAD" }],
        reportantes: [{ id: 7 }],
        responsables: [],
        penalidades: [],
    });
    render(<IncidenciasPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Incidencias" })).toBeVisible();
    await screen.findByText("ATC Sede");
    await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
    expect(screen.queryByText(/Tipos del registro:/)).toBeNull();
    expect(screen.queryByText("No hay reportes disponibles para registrar")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Opciones de incidencias" })).toBeNull();
    const options = within(screen.getAllByRole("combobox")[0])
        .getAllByRole("option")
        .map((option) => option.textContent);
    expect(options).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
    expect(screen.getByText("Penalidades Aprobadas")).toBeVisible();
    expect(screen.queryByText("Bonos a Reportantes")).toBeNull();
});

it("Pagos consulta sus penalidades en solo lectura: sin formulario, tres estados y cabecera Colaborador", async () => {
    mocks.isPagos = true;
    mocks.getCatalog.mockResolvedValue({
        tipos: [{ id: 2, codigo: "REPORTE_PENALIDAD", categoria: "PENALIDAD" }],
        reportantes: [{ id: 7 }],
        responsables: [],
        penalidades: [],
    });
    render(<IncidenciasPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Incidencias" })).toBeVisible();
    await screen.findByText("ATC Sede");
    await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
    expect(screen.queryByText(/Tipos del registro:/)).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Opciones de incidencias" })).toBeNull();
    const options = within(screen.getAllByRole("combobox")[0])
        .getAllByRole("option")
        .map((option) => option.textContent);
    expect(options).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
    expect(screen.getByText("Penalidades Aprobadas")).toBeVisible();
    expect(screen.getByText("Colaborador")).toBeInTheDocument();
    expect(screen.queryByText("Bonos a Reportantes")).toBeNull();
    await waitFor(() => expect(mocks.getList).toHaveBeenLastCalledWith(expect.objectContaining({ tray: "TODOS" })));
    expect(screen.queryByRole("button", { name: "Recibidos" })).toBeNull();
});

it("Marketing consulta sus penalidades en solo lectura: sin formulario, tres estados y cabecera Colaborador", async () => {
    mocks.isMarketing = true;
    mocks.getCatalog.mockResolvedValue({
        tipos: [{ id: 2, codigo: "REPORTE_PENALIDAD", categoria: "PENALIDAD" }],
        reportantes: [{ id: 7 }],
        responsables: [],
        penalidades: [],
    });
    render(<IncidenciasPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Incidencias" })).toBeVisible();
    await screen.findByText("ATC Sede");
    await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
    expect(screen.queryByText(/Tipos del registro:/)).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Opciones de incidencias" })).toBeNull();
    const options = within(screen.getAllByRole("combobox")[0])
        .getAllByRole("option")
        .map((option) => option.textContent);
    expect(options).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
    expect(screen.getByText("Penalidades Aprobadas")).toBeVisible();
    expect(screen.getByText("Colaborador")).toBeInTheDocument();
    expect(screen.queryByText("Bonos a Reportantes")).toBeNull();
});
