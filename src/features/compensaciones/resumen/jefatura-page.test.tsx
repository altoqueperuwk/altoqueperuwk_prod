import type { HTMLAttributes, ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionesResumenPage } from "./compensaciones-resumen-page";
import { JefaturaPage } from "./jefatura-page";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), generalSummary: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));

vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isStoreManager: true, isAdvisor: false, isResolving: false }) }));
vi.mock("./use-compensaciones-resumen", () => ({ useCompensacionesResumen: mocks.generalSummary }));
vi.mock("./dashboard-personal", () => ({ DashboardPersonal: () => <h1>Resultados Propios</h1> }));
// Las animaciones no forman parte de estas pruebas funcionales y no deben retener filas anteriores.
vi.mock("motion/react", async () => {
    const { createElement } = await import("react");
    const element =
        (tag: string) =>
        ({
            children,
            initial,
            animate,
            exit,
            transition,
            variants,
            ...props
        }: HTMLAttributes<HTMLElement> & {
            initial?: unknown;
            animate?: unknown;
            exit?: unknown;
            transition?: unknown;
            variants?: unknown;
        }) =>
            createElement(tag, props, children);
    return { motion: { div: element("div"), tr: element("tr") }, AnimatePresence: ({ children }: { children: ReactNode }) => children };
});
// Simplificar los controles de selección; tabla, enlaces, avisos y KPI son reales.
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) => (
        <label>
            {label}
            <input type="month" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    ),
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        "aria-label": ariaLabel,
        selectedKey,
        items,
        onSelectionChange,
    }: {
        label?: string;
        "aria-label"?: string;
        selectedKey: string;
        items: Array<{ id: string; label: string }>;
        onSelectionChange: (key: string) => void;
    }) => (
        <label>
            {label}
            <select aria-label={ariaLabel} value={selectedKey} onChange={(event) => onSelectionChange(event.target.value)}>
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

const summary = () => ({
    sede: "Sede de la sesión",
    estado: "OK",
    estado_matriz: "PUBLICADA",
    equipo: 6,
    revisiones: 8,
    correcciones: 2,
    incidencias_propias: 3,
    rutas: ["/compensaciones/atenciones"],
    reglas: [{ codigo: "BONO_INNOVACION", monto: 123.45 }],
    penalidades: [{ codigo: "JEFE_ERROR_CUADRO", monto: null, porcentaje: 17 }],
});
type Result = { data: ReturnType<typeof summary> | null; error: { message: string } | null };
const deferred = () => {
    let resolve!: (result: Result) => void;
    const promise = new Promise<Result>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};
const metric = (label: string) => within(screen.getByRole("heading", { name: label }).closest("section")!);
const concept = (label: string) => within(screen.getByText(label, { exact: true }).closest("tr")!);
const metrics = ["Personal ATC", "Registros Pendientes", "Mis Incidencias Pendientes"];
const ready = () => waitFor(() => expect(screen.getByRole("button", { name: "Limpiar" })).toBeEnabled());

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    // Ya es noviembre en UTC, pero en Lima todavía corresponde octubre.
    vi.setSystemTime(new Date("2026-11-01T02:30:00Z"));
    mocks.rpc.mockResolvedValue({ data: summary(), error: null });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("Dashboard de jefatura: alcance y navegación", () => {
    it("la entrada de Resumen monta resultados propios sin consultar el resumen general ni las tareas del equipo", () => {
        render(
            <MemoryRouter initialEntries={["/compensaciones/resumen"]}>
                <CompensacionesResumenPage />
            </MemoryRouter>,
        );
        expect(screen.getByRole("heading", { name: "Resultados Propios" })).toBeVisible();
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.generalSummary).not.toHaveBeenCalled();
    });
    it("conserva la vista de responsabilidades separada de resultados propios", async () => {
        render(
            <MemoryRouter initialEntries={["/compensaciones/resumen?vista=responsabilidades"]}>
                <CompensacionesResumenPage />
            </MemoryRouter>,
        );
        await ready();
        expect(screen.getByRole("heading", { name: "Responsabilidades de Sede" })).toBeVisible();
        expect(mocks.generalSummary).not.toHaveBeenCalled();
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("f_get_compensacion_jefatura", { p_mes: "2026-10-01" });
        expect(screen.getByLabelText("Periodo")).toHaveValue("2026-10");
        expect(screen.getByText("Sede de la sesión")).toBeVisible();
        expect(screen.getAllByRole("combobox")).toHaveLength(1);
        expect(screen.getByRole("combobox", { name: "Filtrar por tipo" })).toBeVisible();
        for (const name of [/^Sede$/, /Colaborador/, /Usuario/, /Asesor/]) expect(screen.queryByLabelText(name)).toBeNull();
        for (const [index, value] of [6, 8, 3].entries()) expect(metric(metrics[index]).getByText(String(value))).toBeVisible();
    });

    it("muestra como aviso la Tolerancia Cero Digital del equipo sin afectar al Jefe", async () => {
        mocks.rpc.mockResolvedValue({
            data: { ...summary(), tolerancia_cero: [{ id: 9, colaborador: "Ivonne Ruiz", fecha: "2026-10-14", estado: "CONFIRMADO" }] },
            error: null,
        });
        render(
            <MemoryRouter initialEntries={["/compensaciones/resumen?vista=responsabilidades"]}>
                <CompensacionesResumenPage />
            </MemoryRouter>,
        );
        await ready();
        expect(await screen.findByText(/Tolerancia cero digital en tu equipo:/)).toHaveTextContent("no afecta tus comisiones");
        expect(screen.getByText(/Ivonne Ruiz \(14\/10\/2026, confirmado\)/)).toBeVisible();
        expect(screen.getByText(/no afecta tus comisiones/)).toBeVisible();
    });
    it("cada Consultar corresponde a una ruta concedida por el servidor", async () => {
        render(<JefaturaPage />);
        await ready();
        const hrefs = screen.getAllByRole("link", { name: "Consultar" }).map((link) => link.getAttribute("href"));
        expect(new Set(hrefs)).toEqual(new Set(["/compensaciones/atenciones"]));
        expect(concept("Error Supervisión").getByText("Sin acceso asignado")).toBeVisible();
        expect(concept("Error Supervisión").queryByRole("link")).toBeNull();
        expect(screen.queryByRole("link", { name: /Aprobar|Pagar/ })).toBeNull();
    });

    it("sin rutas asignadas conserva los conceptos como consulta sin crear enlaces", async () => {
        mocks.rpc.mockResolvedValue({ data: { ...summary(), rutas: [] }, error: null });
        render(<JefaturaPage />);
        await ready();
        expect(screen.getByText("Error Supervisión", { exact: true })).toBeVisible();
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getAllByText("Sin acceso asignado")).toHaveLength(13);
    });

    it("muestra referencias recibidas, porcentajes y ausencia de importe sin inventar tarifas", async () => {
        render(<JefaturaPage />);
        await ready();
        const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(123.45);
        expect(concept("Bono por Aporte e Innovación Operativa (Extra)").getByText(money, { normalizer: (value) => value })).toBeVisible();
        expect(concept("Error en Cuadro de Comisiones").getByText("17%")).toBeVisible();
    });

    it.each([
        ["Bono", 7],
        ["Penalidad", 6],
    ] as const)("filtra %s sin cambiar el alcance ni consultar de nuevo", async (kind, count) => {
        render(<JefaturaPage />);
        await ready();
        fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por tipo" }), { target: { value: kind } });
        await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(count + 1));
        for (const row of screen.getAllByRole("row").slice(1)) expect(within(row).getByText(kind, { exact: true })).toBeVisible();
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por tipo" }), { target: { value: "" } });
        await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(14));
    });
});

describe("Dashboard de jefatura: estados reales y respuestas tardías", () => {
    it("en carga muestra valores desconocidos y no simula contadores cero", async () => {
        const pending = deferred();
        mocks.rpc.mockReturnValue(pending.promise);
        render(<JefaturaPage />);
        expect(screen.getByRole("button", { name: "Limpiar" })).toBeDisabled();
        for (const label of metrics) {
            expect(metric(label).getByText("—")).toBeVisible();
            expect(metric(label).queryByText("0")).toBeNull();
        }
        expect(screen.queryByRole("link")).toBeNull();
        await act(async () => pending.resolve({ data: summary(), error: null }));
        await ready();
        expect(metric("Personal ATC").getByText("6")).toBeVisible();
    });

    it("un cero confirmado por el servidor sí representa ausencia real de pendientes", async () => {
        mocks.rpc.mockResolvedValue({ data: { ...summary(), equipo: 0, revisiones: 0, correcciones: 0, incidencias_propias: 0 }, error: null });
        render(<JefaturaPage />);
        await ready();
        for (const label of metrics) expect(metric(label).getByText("0")).toBeVisible();
        expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    });

    it("advierte que los importes de una matriz pendiente son borrador y no autorizan pagos", async () => {
        mocks.rpc.mockResolvedValue({ data: { ...summary(), estado: "MATRIZ_PENDIENTE", estado_matriz: "BORRADOR" }, error: null });
        render(<JefaturaPage />);
        await ready();
        const alert = await screen.findByRole("status");
        expect(alert).toHaveTextContent("Matriz pendiente de publicación");
        expect(alert).toHaveTextContent("referencias del borrador");
        expect(alert).toHaveTextContent("no acreditan bonos ni autorizan un pago");
        expect(concept("Bono por Aporte e Innovación Operativa (Extra)").getByText(/123[.,]45/)).toBeVisible();
    });

    it("explica la ficha pendiente sin ofrecer accesos no asignados", async () => {
        mocks.rpc.mockResolvedValue({ data: { ...summary(), estado: "SIN_ASIGNACION", rutas: [], reglas: [], penalidades: [] }, error: null });
        render(<JefaturaPage />);
        await ready();
        expect(await screen.findByRole("status")).toHaveTextContent("Ficha laboral pendiente");
        expect(await screen.findByRole("status")).toHaveTextContent("Administración debe vincular tu ficha");
        expect(screen.queryByRole("link")).toBeNull();
    });

    it.each(["rpc", "excepción", "rechazo desconocido"])("distingue un error (%s) de una sede sin pendientes", async (failure) => {
        const message = failure === "rechazo desconocido" ? "No se pudo consultar tu sede" : "No autorizado para esta sede";
        if (failure === "rpc") mocks.rpc.mockResolvedValue({ data: null, error: { message } });
        else mocks.rpc.mockRejectedValue(failure === "excepción" ? new Error(message) : "fallo de transporte");
        render(<JefaturaPage />);
        await ready();
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Error");
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent(message);
        for (const label of metrics) {
            expect(metric(label).getByText("—")).toBeVisible();
            expect(metric(label).queryByText("0")).toBeNull();
        }
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByText("Error Supervisión", { exact: true })).toBeNull();
    });

    it("al fallar Actualizar retira los datos anteriores y permite reintentar el mismo mes", async () => {
        render(<JefaturaPage />);
        await ready();
        expect(metric("Personal ATC").getByText("6")).toBeVisible();
        mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Permiso de sede revocado" } });
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await ready();
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Permiso de sede revocado");
        expect(metric("Personal ATC").queryByText("6")).toBeNull();
        expect(metric("Personal ATC").getByText("—")).toBeVisible();
        await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await ready();
        expect(metric("Personal ATC").getByText("6")).toBeVisible();
        expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
        expect(mocks.rpc).toHaveBeenCalledTimes(3);
        for (const call of mocks.rpc.mock.calls) expect(call).toEqual(["f_get_compensacion_jefatura", { p_mes: "2026-10-01" }]);
    });

    it("un cambio de mes ignora respuestas antiguas, incluidos errores tardíos", async () => {
        const old = deferred();
        const current = deferred();
        const latest = deferred();
        mocks.rpc.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise).mockReturnValueOnce(latest.promise);
        render(<JefaturaPage />);
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-09" } });
        await act(async () => current.resolve({ data: { ...summary(), equipo: 14 }, error: null }));
        await ready();
        await act(async () => old.resolve({ data: summary(), error: null }));
        expect(metric("Personal ATC").getByText("14")).toBeVisible();
        expect(metric("Personal ATC").queryByText("6")).toBeNull();
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-08" } });
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-07" } });
        // La cuarta consulta usa la respuesta inmediata configurada en beforeEach.
        await ready();
        await act(async () => latest.resolve({ data: null, error: { message: "Error del mes anterior" } }));
        expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
        expect(screen.getByLabelText("Periodo")).toHaveValue("2026-07");
        expect(mocks.rpc).toHaveBeenLastCalledWith("f_get_compensacion_jefatura", { p_mes: "2026-07-01" });
    });

    it("Limpiar restablece el filtro y aplica los accesos de la nueva respuesta", async () => {
        render(<JefaturaPage />);
        await ready();
        fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por tipo" }), { target: { value: "Penalidad" } });
        mocks.rpc.mockResolvedValueOnce({ data: { ...summary(), rutas: ["/compensaciones/resumen"] }, error: null });
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await ready();
        expect(screen.getByRole("combobox", { name: "Filtrar por tipo" })).toHaveValue("");
        expect(screen.getAllByRole("row")).toHaveLength(14);
        const hrefs = screen.getAllByRole("link", { name: "Consultar" }).map((link) => link.getAttribute("href"));
        expect(new Set(hrefs)).toEqual(new Set(["/compensaciones/resumen"]));
        expect(concept("Error Supervisión").getByRole("link", { name: "Consultar" })).toHaveAttribute("href", "/compensaciones/resumen");
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
    });
});
