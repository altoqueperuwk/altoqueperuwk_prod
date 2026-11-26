import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CompensacionesResumenPage } from "../resumen/compensaciones-resumen-page";
import { BonosDescuentosPage } from "./bonos-descuentos-page";
import type { BonosDescuentosResultado } from "./bonos-descuentos.types";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    detail: vi.fn(),
    registros: vi.fn(),
    dashboard: vi.fn(),
    advisor: true,
    manager: false,
    leader: vi.fn(),
    observaciones: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: { estado: "SIN_FUENTE" }, error: null }) } }));
vi.mock("./bonos-descuentos.service", () => ({
    bonosDescuentosService: { list: mocks.list, detail: mocks.detail, registros: mocks.registros, dashboard: mocks.dashboard },
}));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({ isAdvisor: mocks.advisor, isStoreManager: mocks.manager, isResolving: false }),
}));
vi.mock("../evidencias/liderazgo.service", () => ({ liderazgoService: { getMonth: mocks.leader } }));
vi.mock("../shared/seguimiento-jefatura.service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../shared/seguimiento-jefatura.service")>()),
    seguimientoJefaturaService: { misExpedientes: mocks.observaciones },
}));
vi.mock("@/providers/auth-provider", () => ({ useOptionalAuth: () => ({ user: { id: "own-user" } }) }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("../resumen/use-compensaciones-resumen", () => ({
    useCompensacionesResumen: () => {
        throw new Error("ATC no debe consultar periodos globales");
    },
}));
// Native controls make filter state and remote requests directly observable, independent of popup keyboard mechanics.
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) => (
        <label>
            {label}
            <input type="month" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
    ),
}));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <label>
            {label}
            <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    ),
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        selectedKey,
        items,
        onSelectionChange,
    }: {
        label?: string;
        selectedKey: string;
        items: { id: string | number; label: string }[];
        onSelectionChange: (v: string) => void;
    }) => (
        <label>
            {label}
            <select aria-label={label ?? "Tamaño de página"} value={selectedKey} onChange={(e) => onSelectionChange(e.target.value)}>
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

const result = (amount = 7): BonosDescuentosResultado => ({
    items: [
        { codigo: "REGISTRO", concepto: "Registro Nuevo", tipo: "BONO", cantidad: 10, pendientes: 2, importe: amount },
        { codigo: "UNIFORME", concepto: "Falta de Uniforme", tipo: "DESCUENTO", cantidad: 0, pendientes: 1, importe: null },
    ],
    total: 2,
    conceptos: [
        { codigo: "REGISTRO", concepto: "Registro Nuevo" },
        { codigo: "UNIFORME", concepto: "Falta de Uniforme" },
    ],
    kpis: { bonos: amount, comisiones: 0, descuentos: 0, neto: amount, pendientes: 3 },
    disponible: true,
});
beforeEach(() => {
    vi.clearAllMocks();
    // Dashboard = una sola consulta (SQL138): se compone con los mismos mocks de resumen y registros.
    mocks.dashboard.mockImplementation(async (filters, tipo) => {
        const summary = await mocks.list(filters);
        const records = await mocks.registros(filters, tipo);
        return { ...summary, ...records, conceptos: summary?.conceptos ?? [] };
    });
    mocks.advisor = true;
    mocks.list.mockResolvedValue(result());
    mocks.registros.mockResolvedValue({
        items: [
            {
                id: "REGISTRO:1",
                concepto_codigo: "REGISTRO",
                concepto_nombre: "Registro Nuevo",
                tipo: "BONO",
                fecha: "2026-10-26",
                descripcion: "Primera operación",
                estado: "PENDIENTE",
                importe: null,
            },
            {
                id: "UNIFORME:1",
                concepto_codigo: "UNIFORME",
                concepto_nombre: "Falta de Uniforme",
                tipo: "PENALIDAD",
                fecha: "2026-10-25",
                descripcion: "Uniforme",
                estado: "PENDIENTE",
                importe: null,
            },
        ],
        total: 2,
        total_paginas: 1,
        disponible: true,
    });
    mocks.detail.mockResolvedValue({
        items: [
            {
                id: 1,
                documento: "70176064",
                cliente: "Cliente Uno",
                fecha: "2026-10-26T15:00:00Z",
                descripcion: "Primera operación",
                estado: "PENDIENTE",
                importe: null,
            },
        ],
        total: 1,
    });
});
afterEach(cleanup);

it("el Dashboard conserva bonos y comisiones aunque falten jornadas para prorratear el sueldo", async () => {
    mocks.list.mockResolvedValue({
        ...result(),
        aviso: "Importes provisionales. Faltan jornadas para prorrateo.",
        advertencias: [{ codigo: "ASISTENCIA_INCOMPLETA", mensaje: "Faltan jornadas consolidadas para un tramo con prorrateo por asistencia" }],
    });
    render(
        <MemoryRouter>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    expect(screen.queryByText(/Faltan jornadas|Importes provisionales|Cómo Leer el Resumen|Seguimiento muestra/)).toBeNull();
    expect(screen.queryByRole("cell", { name: "En revisión" })).toBeNull();
    const bonos = screen.getByRole("heading", { name: /^Bonos$/ }).closest("section")!;
    expect(bonos).toHaveTextContent(/S\/\s*7\.00/);
    expect(screen.getAllByRole("cell", { name: "Pendiente" })[0]).toBeInTheDocument();
});

it("la primera falta de Uniforme sin monto: Marketing sin descuento y los demás pierden Puntualidad", async () => {
    mocks.registros.mockResolvedValue({
        items: [
            {
                id: "MKT_UNIFORME:1",
                concepto_codigo: "MKT_UNIFORME",
                concepto_nombre: "Falta de Uniforme Completo",
                tipo: "PENALIDAD",
                fecha: "2026-10-25",
                descripcion: "Uniforme",
                estado: "APROBADO",
                importe: 0,
            },
            {
                id: "ATC_UNIFORME:2",
                concepto_codigo: "ATC_UNIFORME",
                concepto_nombre: "Falta de Uniforme Completo",
                tipo: "PENALIDAD",
                fecha: "2026-10-26",
                descripcion: "Uniforme",
                estado: "APROBADO",
                importe: 0,
            },
        ],
        total: 2,
        total_paginas: 1,
        disponible: true,
    });
    render(
        <MemoryRouter>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    expect(await screen.findByText("Pierde Puntualidad")).toBeInTheDocument();
    expect(screen.getByText("Sin Descuento")).toBeInTheDocument();
    expect(screen.queryByText(/−S\/\s*0\.00/)).toBeNull();
});

it("los eventos pendientes no ocultan los montos habilitados del Dashboard", async () => {
    mocks.list.mockResolvedValue({
        ...result(),
        advertencias: [{ codigo: "EVENTO_PENDIENTE", mensaje: "Existen eventos monetarios pendientes de decision" }],
    });
    render(
        <MemoryRouter>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    expect(screen.queryByText(/eventos monetarios pendientes/)).toBeNull();
    const bonos = screen.getByRole("heading", { name: /^Bonos$/ }).closest("section")!;
    expect(bonos).toHaveTextContent(/S\/\s*7\.00/);
});

it("ocultar el aviso de sueldo no oculta una fuente faltante de bonos", async () => {
    mocks.list.mockResolvedValue({
        ...result(0),
        advertencias: [
            { codigo: "ASISTENCIA_INCOMPLETA", mensaje: "Faltan jornadas para el sueldo" },
            { codigo: "FUENTE", mensaje: "Falta fuente del periodo" },
        ],
    });
    render(
        <MemoryRouter>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Falta fuente del periodo");
    expect(screen.queryByText(/Faltan jornadas/)).toBeNull();
});

it("solo ofrece la vista de seguimiento", async () => {
    render(<BonosDescuentosPage />);
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    const vista = screen.getByRole("combobox", { name: "Vista" });
    expect(within(vista).queryByRole("option", { name: /Liquidado/ })).toBeNull();
    expect(mocks.list).not.toHaveBeenCalledWith(expect.objectContaining({ vista: "LIQUIDADO" }));
});

it("aplica filtros remotos, reinicia página y permite limpiar", async () => {
    render(<BonosDescuentosPage />);
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-09" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), { target: { value: "PENALIDAD" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ mes: "2026-09", tipo: "DESCUENTO", pagina: 1 })));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: "", concepto: "", vista: "SEGUIMIENTO", pagina: 1 })));
});

it("muestra pendientes sin importe inventado y detalle de solo lectura", async () => {
    render(<BonosDescuentosPage />);
    await screen.findByRole("cell", { name: "Falta de Uniforme" });
    const row = screen.getByRole("cell", { name: "Falta de Uniforme" }).closest("tr")!;
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Ver detalle de Falta de Uniforme" }));
    const dialog = await screen.findByRole("dialog", { name: "Detalle: Falta de Uniforme" });
    await within(dialog).findByText("Cliente Uno");
    expect(mocks.detail).toHaveBeenCalledWith(expect.objectContaining({ concepto: "UNIFORME", vista: "SEGUIMIENTO", pagina: 1 }));
    expect(
        within(dialog)
            .getAllByRole("columnheader")
            .slice(0, 2)
            .map((h) => h.textContent),
    ).toEqual(["DNI", "Cliente"]);
    expect(within(dialog).queryByRole("button", { name: /Guardar|Editar|Aprobar|Eliminar/ })).toBeNull();
});

it("presenta los estados reales de RPC59 sin confundir habilitación, aprobación y pago", async () => {
    const states = [
        ["HABILITADO", "Cumple"],
        ["APROBADA", "Aprobado"],
        ["PAGO_PARCIAL", "Pago parcial"],
        ["PAGADA", "Pagado"],
        ["ESPERANDO_OPERACION", "Sin operación"],
        ["OPERACION_PENDIENTE", "Pendiente"],
        ["PROVISIONAL", "Provisional"],
        ["EN_IMPLEMENTACION", "En implementación"],
        ["EN_REVISION", "Pendiente"],
    ];
    mocks.detail.mockResolvedValue({
        items: states.map(([estado], index) => ({
            id: index + 1,
            fecha: "2026-10-26",
            descripcion: `Registro ${index + 1}`,
            estado,
            importe: null,
        })),
        total: states.length,
    });
    render(<BonosDescuentosPage />);
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Registro Nuevo" }));
    const dialog = await screen.findByRole("dialog", { name: "Detalle: Registro Nuevo" });
    for (const [code, label] of states) expect(await within(dialog).findByTitle(code)).toHaveTextContent(label);
    expect(within(dialog).queryByText("Sin información")).toBeNull();
});

it("descarta una respuesta tardía de la vista anterior", async () => {
    let resolveOld!: (value: BonosDescuentosResultado) => void;
    mocks.list
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveOld = resolve;
                }),
        )
        .mockResolvedValue(result(14));
    render(<BonosDescuentosPage />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("combobox", { name: "Vista" }), { target: { value: "LIQUIDADO" } });
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    resolveOld(result(99));
    await waitFor(() => expect(screen.queryByText(/S\/\s*99\.00/)).toBeNull());
});

it("no consulta datos ni habilita importes fuera del perfil ATC", async () => {
    mocks.advisor = false;
    render(<BonosDescuentosPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("Atención al Cliente");
    await Promise.resolve();
    expect(mocks.list).not.toHaveBeenCalled();
});

it("un error no se representa como importes cero", async () => {
    mocks.list.mockRejectedValue(new Error("Sin permiso"));
    render(<BonosDescuentosPage />);
    await screen.findByText("Sin permiso");
    expect(screen.queryByText(/S\/\s*0\.00/)).toBeNull();
});

it("suma bonos y comisiones en el KPI Bonos del contrato real y conserva pendientes fuera del importe", async () => {
    const response = result();
    response.kpis = { bonos: 50, comisiones: 2.1, descuentos: 5, neto: 47.1, pendientes: 12 };
    mocks.list.mockResolvedValue(response);
    render(<BonosDescuentosPage />);
    const header = await screen.findByRole("heading", { name: "Bonos" });
    await waitFor(() => expect(header.closest("section")).toHaveTextContent(/S\/\s*52\.10/));
    expect(screen.getByRole("heading", { name: "Neto" }).closest("section")).toHaveTextContent(/S\/\s*47\.10/);
    expect(screen.getByRole("heading", { name: "Pendientes" }).closest("section")).toHaveTextContent("12");
});

it("distingue un periodo no disponible de importes nulos sin fabricarlos como cero", async () => {
    const response = result();
    response.items = [];
    response.total = 0;
    response.kpis = { bonos: null, comisiones: null, descuentos: null, neto: null, pendientes: 2 };
    mocks.list.mockResolvedValueOnce({ ...response, disponible: false, aviso: "Periodo sin liquidación" }).mockResolvedValue(response);
    render(<BonosDescuentosPage />);
    await screen.findByText(/Periodo sin liquidación/);
    expect(screen.queryByText(/S\/\s*0\.00/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/S\/\s*0\.00/)).toBeNull();
});

it.each([
    ["APROBADA", "Aprobado"],
    ["PAGO_PARCIAL", "Aprobado"],
    ["PAGADA", "Aprobado"],
] as const)("Dashboard consolidado distingue %s de una ganancia provisional", async (state, label) => {
    const value = result(20);
    value.items = [{ ...value.items[0], pendientes: 0 }];
    mocks.list.mockResolvedValue({ ...value, seguimiento_consolidado: true, estado_liquidacion: state });
    mocks.registros.mockResolvedValue({
        items: [
            {
                id: "REGISTRO:1",
                concepto_codigo: "REGISTRO",
                concepto_nombre: "Registro Nuevo",
                tipo: "BONO",
                fecha: "2026-10-26",
                descripcion: "Registro",
                estado: state,
                importe: 20,
            },
        ],
        total: 1,
        total_paginas: 1,
        disponible: true,
    });
    render(
        <MemoryRouter initialEntries={["/compensaciones/resumen"]}>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole("cell", { name: label })).toBeVisible());
    expect(screen.getByRole("columnheader", { name: "Monto" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Bono" })).toBeVisible();
});
it("consolida Dashboard ATC sin consulta global ni N+1 y aplica el concepto de URL", async () => {
    render(
        <MemoryRouter initialEntries={["/compensaciones/resumen?concepto=COLABORADOR_MES_CALIFICACIONES"]}>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    expect(screen.getByRole("heading", { name: "Mis Bonos y Penalidades" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Registros Pendientes" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "En Seguimiento" })).toBeNull();
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ concepto: "BONO_COLABORADOR_MES" }));
    // Una sola tabla de registros con una consulta plana paginada en el servidor, sin N+1 por concepto.
    await waitFor(() => expect(mocks.registros).toHaveBeenCalledWith(expect.objectContaining({ concepto: "BONO_COLABORADOR_MES", pagina: 1 }), ""));
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getAllByRole("cell", { name: "Pendiente" })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "Pendiente" })[1]).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Neto" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Mi ficha/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-09" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ concepto: "BONO_COLABORADOR_MES", mes: "2026-09" })));
});

it("conserva los datos al actualizar el mismo periodo y permite reintentar el detalle", async () => {
    render(<BonosDescuentosPage />);
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    mocks.list.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await screen.findByText("Actualizando resumen…");
    expect(screen.getByRole("cell", { name: "Registro Nuevo" })).toBeInTheDocument();
    mocks.detail.mockRejectedValueOnce(new Error("Fuente no disponible"));
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Registro Nuevo" }));
    await screen.findByText("Fuente no disponible");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar Detalle" }));
    await screen.findByText("Cliente Uno");
    expect(mocks.detail).toHaveBeenCalledTimes(2);
});

it("pagina el detalle solo al solicitarlo y conserva el periodo del resumen", async () => {
    mocks.detail.mockResolvedValue({ items: [], total: 41 });
    render(<BonosDescuentosPage />);
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    expect(mocks.detail).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-09" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ mes: "2026-09" })));
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Registro Nuevo" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Página 1 de 3");
    fireEvent.click(within(dialog).getByRole("button", { name: "Página siguiente" }));
    await waitFor(() =>
        expect(mocks.detail).toHaveBeenLastCalledWith(expect.objectContaining({ mes: "2026-09", concepto: "REGISTRO", pagina: 2, tamano: 20 })),
    );
});

it("las advertencias del motor muestran datos incompletos sin convertirlos en cero definitivo", async () => {
    mocks.list.mockResolvedValue({ ...result(0), advertencias: [{ codigo: "FUENTE", mensaje: "Falta fuente del periodo" }] });
    render(
        <MemoryRouter>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Falta fuente del periodo");
    expect(screen.queryByText(/S\/\s*0\.00/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Penalidades Confirmadas" })).toBeVisible();
});

it("comparte estado/rango entre lista y detalle y sincroniza mes bisiesto", async () => {
    render(<BonosDescuentosPage />);
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2024-02" } });
    expect(screen.getByLabelText("Desde")).toHaveValue("2024-02-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2024-02-29");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2024-02-10" } });
    fireEvent.change(screen.getByLabelText("Estado de Origen"), { target: { value: "PENDIENTE" } });
    await waitFor(() =>
        expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ desde: "2024-02-10", hasta: "2024-02-29", estado: "PENDIENTE", pagina: 1 })),
    );
    await screen.findByRole("cell", { name: "Registro Nuevo" });
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de Registro Nuevo" }));
    await waitFor(() =>
        expect(mocks.detail).toHaveBeenLastCalledWith(expect.objectContaining({ desde: "2024-02-10", hasta: "2024-02-29", estado: "PENDIENTE" })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ estado: "", criterio: "", pagina: 1 })));
});

it("separa criterios de URL sin inferir ranking o una nueva adjudicación", async () => {
    render(
        <MemoryRouter initialEntries={["/compensaciones/resumen?concepto=COLABORADOR_MES_ATENCIONES"]}>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ concepto: "BONO_COLABORADOR_MES", criterio: "ATENCIONES" })));
    expect(screen.getByText(/La ausencia de registros no confirma que hayas perdido el bono/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Criterio"), { target: { value: "CALIFICACIONES" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ criterio: "CALIFICACIONES", pagina: 1 })));
});

it("el Dashboard es una sola tabla de registros con Tipo Bono/Penalidad e importe con signo", async () => {
    mocks.list.mockResolvedValue({
        ...result(),
        items: [
            { codigo: "REGISTRO", concepto: "Registro Nuevo", tipo: "COMISION", cantidad: 1, pendientes: 0, importe: 5 },
            { codigo: "TARDANZA", concepto: "Tardanza", tipo: "DESCUENTO", cantidad: 1, pendientes: 0, importe: 3 },
        ],
    });
    mocks.registros.mockResolvedValue({
        items: [
            {
                id: "REGISTRO:1",
                concepto_codigo: "REGISTRO",
                concepto_nombre: "Registro Nuevo",
                tipo: "BONO",
                fecha: "2026-10-26",
                descripcion: "Detalle",
                estado: "HABILITADO",
                importe: 5,
            },
            {
                id: "TARDANZA:1",
                concepto_codigo: "TARDANZA",
                concepto_nombre: "Tardanza",
                tipo: "PENALIDAD",
                fecha: "2026-10-25",
                descripcion: "Detalle",
                estado: "HABILITADO",
                importe: 3,
            },
        ],
        total: 2,
        total_paginas: 1,
        disponible: true,
    });
    render(
        <MemoryRouter initialEntries={["/compensaciones/resumen"]}>
            <CompensacionesResumenPage />
        </MemoryRouter>,
    );
    expect(await screen.findByText(/\+\s*S\/\s*5\.00/)).toBeInTheDocument();
    expect(screen.getByText(/−\s*S\/\s*3\.00/)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Bono" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Penalidad" })).toBeInTheDocument();
    expect(screen.queryByText("Comisión", { exact: true })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getAllByRole("table")).toHaveLength(1);
});
