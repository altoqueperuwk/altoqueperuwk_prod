import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CalificacionValidez } from "./calificacion-validez";
import { CalificacionesPage } from "./calificaciones-page";
import type { CalificacionesResult, EvidenciaEvento } from "./evidencias.types";
import { LlamadaActions } from "./llamada-actions";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    policy: vi.fn(),
    resolve: vi.fn(),
    context: vi.fn(),
    operations: vi.fn(),
    profile: { isAdvisor: false, isStoreManager: false, isResolving: false },
}));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));
vi.mock("./evidencias.service", () => ({
    evidenciasService: { saveRatingPolicy: mocks.policy, resolve: mocks.resolve, getCallContext: mocks.context },
}));
vi.mock("./calificacion-list.service", () => ({ calificacionListService: { getRatings: mocks.list } }));

vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./evidencia-detail-modal", () => ({
    EvidenciaDetailModal: ({ item, readOnly }: { item: EvidenciaEvento | null; readOnly: boolean }) =>
        item ? <div data-testid="detail" data-readonly={readOnly} /> : null,
}));
vi.mock("@/features/atencion/mi-enlace-qr/mi-enlace-qr-acciones", () => ({
    MiEnlaceQrAcciones: () => <button>Mostrar QR</button>,
}));
vi.mock("./calificacion-operaciones-modal", () => ({
    CalificacionOperacionesModal: (props: { item: EvidenciaEvento; onSaved: () => void }) => {
        mocks.operations(props);
        return <button onClick={props.onSaved}>Guardar Operaciones</button>;
    },
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        "aria-label": ariaLabel,
        items,
        selectedKey,
        onSelectionChange,
    }: {
        label: string;
        "aria-label"?: string;
        items: Array<{ id: string | number; label: string }>;
        selectedKey: string | number;
        onSelectionChange: (key: string) => void;
    }) => (
        <label aria-label={ariaLabel ?? label}>
            {ariaLabel ?? label}
            <select aria-label={ariaLabel ?? label} value={selectedKey} onChange={(e) => onSelectionChange(e.target.value)}>
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
        columns,
        onPageChange,
        toolbar,
    }: {
        data: Record<string, unknown>[];
        columns: Array<{ key: string; render?: (value: unknown, row: Record<string, unknown>) => ReactNode }>;
        onPageChange: (page: number) => void;
        toolbar?: ReactNode;
    }) => (
        <div>
            {toolbar}
            <pre data-testid="rows">{JSON.stringify(data)}</pre>
            {data.map((row) => (
                <div key={Number(row.id)} data-testid={`record-${row.id}`}>
                    {columns.find((column) => column.key === "operaciones")?.render?.(null, row)}
                    {columns.find((column) => column.key === "acciones")?.render?.(null, row)}
                </div>
            ))}
            <button onClick={() => onPageChange(2)}>Página siguiente</button>
        </div>
    ),
}));
const result = (): CalificacionesResult => ({
    items: [],
    total: 205,
    totalPages: 11,
    pendientes: 2,
    aprobados: 203,
    noValidas: 1,
    importeAprobado: 406,
    politica: { dni_obligatorio: true, comentario_obligatorio: false, asesor_obligatorio: false },
    puedeConfigurar: true,
    asesores: [{ id: 10, nombre: "Asesor ficticio" }],
    ranking: [{ id: 10, nombre: "Asesor ficticio", cantidad: 203 }],
    distribucion: [
        { estrellas: 5, cantidad: 204 },
        { estrellas: 3, cantidad: 1 },
    ],
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.isAdvisor = false;
    mocks.profile.isStoreManager = false;
    mocks.profile.isResolving = false;
    mocks.context.mockResolvedValue({ idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: true, puedeRevisar: true });
    mocks.list.mockResolvedValue(result());
    mocks.policy.mockResolvedValue({});
});
afterEach(cleanup);
describe("Calificaciones: bandeja propia", () => {
    it.each(["APROBADO", "RECHAZADO", "ANULADO"])("ATC consulta operaciones de una calificación %s sin ofrecer Agregar", async (estado) => {
        mocks.profile.isAdvisor = true;
        const record = {
            id: 20,
            datos: { cliente_documento: "12345678", estrellas: 4 },
            referencias: [],
            evidencia: [],
            revisiones: [],
            estado,
            categoria: "CALIFICACION",
            fechaEvento: "2026-10-25T14:00:00Z",
        } as unknown as EvidenciaEvento;
        mocks.list.mockResolvedValue({ ...result(), items: [record] });
        render(<CalificacionesPage />);
        expect(await screen.findByRole("button", { name: "Visualizar" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Agregar" })).toBeNull();
    });
    it("ATC pasa de Agregar a Visualizar al recargar las referencias guardadas", async () => {
        mocks.profile.isAdvisor = true;
        const record = {
            id: 20,
            datos: { cliente_documento: "12345678", estrellas: 4 },
            referencias: [],
            evidencia: [],
            revisiones: [],
            estado: "PENDIENTE",
            categoria: "CALIFICACION",
            fechaEvento: "2026-10-25T14:00:00Z",
        } as unknown as EvidenciaEvento;
        mocks.list.mockResolvedValue({ ...result(), items: [record] });
        render(<CalificacionesPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Agregar" }));
        mocks.list.mockResolvedValue({ ...result(), items: [{ ...record, referencias: [{ tipoReferencia: "OPERACION", idOperacion: 44 }] }] });
        fireEvent.click(screen.getByRole("button", { name: "Guardar Operaciones" }));
        expect(await screen.findByRole("button", { name: "Visualizar" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Agregar" })).toBeNull();
    });
    it("limpia criterios, restaura el mes actual y vuelve a la primera página", async () => {
        render(<CalificacionesPage />);
        await screen.findByText("203 calif.");
        const initialPeriod = mocks.list.mock.calls[0][0].desde.slice(0, 7);
        fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por nombre del cliente" }), { target: { value: "ficticio" } });
        fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estrellas" }), { target: { value: "3" } });
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ nombreCliente: "ficticio", estrellas: 3 }));
        fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0].pagina).toBe(2));
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await waitFor(() =>
            expect(mocks.list.mock.lastCall?.[0]).toMatchObject({
                documento: "",
                nombreCliente: "",
                colaborador: "",
                comentario: "",
                asesor: 0,
                estrellas: 0,
                estado: "",
                desde: `${initialPeriod}-01`,
                pagina: 1,
            }),
        );
    });
    it("ATC no ve ranking, selector de asesor ni configuración aunque el contrato antiguo los habilite", async () => {
        mocks.profile.isAdvisor = true;
        render(<CalificacionesPage />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalled());
        expect(screen.queryByRole("heading", { name: /Requisitos de validez/ })).toBeNull();
        expect(screen.getByRole("heading", { name: "Atención Calificada" })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Filtrar por nombre o DNI del colaborador" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Guardar requisitos" })).toBeNull();
        expect(screen.queryByRole("heading", { name: "Ranking de Aprobadas" })).toBeNull();
        expect(screen.queryByRole("heading", { name: "Distribución de Estrellas" })).toBeNull();
        expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeTruthy();
        expect(mocks.list.mock.calls[0][0].asesor).toBe(0);
    });
    it("muestra el ranking, sin distribución de estrellas ni configuración ni título redundante de tabla", async () => {
        render(<CalificacionesPage />);
        await screen.findByText("203 calif.");
        expect(screen.queryByRole("heading", { name: /Requisitos de validez|Calificaciones \(/ })).toBeNull();
        expect(screen.getByText("203 calif.")).toBeTruthy();
        expect(screen.getByRole("img", { name: /Ranking de Aprobadas: Asesor ficticio, 203/ })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Distribución de Estrellas" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Mostrar QR" })).toBeNull();
        expect(screen.queryByText(/Guardar borrador|Registrar calificación|Colaborador que recibe/)).toBeNull();
        expect(screen.queryByText(/La ganancia se determina al aprobar|Revisa las respuestas, sus estrellas/)).toBeNull();
    });
    it("explica los criterios y la revisión de Atención Calificada desde información", async () => {
        render(<CalificacionesPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Información de Atención Calificada" }));
        expect(screen.getByRole("heading", { name: "Información de Atención Calificada" })).toBeVisible();
        expect(screen.getByText(/4 o 5 estrellas vinculadas a efectivizaciones elegibles/)).toBeVisible();
        expect(screen.getByText(/depende de la configuración vigente del servidor/)).toBeVisible();
    });
    it("consulta el mes en horario de Lima y solicita paginación al servidor", async () => {
        render(<CalificacionesPage />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalled());
        expect(mocks.list.mock.calls[0][0]).toMatchObject({ pagina: 1, tamanoPagina: 20, estrellas: 0, asesor: 0 });
        expect(mocks.list.mock.calls[0][0].desde).toMatch(/^\d{4}-\d{2}-01$/);
        fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ pagina: 2 }));
    });
    it("filtra estrellas y colaborador sin botón Actualizar", async () => {
        render(<CalificacionesPage />);
        await screen.findByText("203 calif.");
        fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por nombre o DNI del colaborador" }), { target: { value: "12345678" } });
        fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estrellas" }), { target: { value: "3" } });
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ colaborador: "12345678", estrellas: 3, pagina: 1 }));
        expect(screen.queryByRole("button", { name: "Actualizar" })).toBeNull();
    });
    it("mantiene consulta mensual sin ofrecer todo el historial", async () => {
        render(<CalificacionesPage />);
        await screen.findByText("203 calif.");
        expect(screen.queryByRole("combobox", { name: "Tiempo" })).toBeNull();
        expect(screen.getByRole("button", { name: /^Periodo:/ })).toBeVisible();
        const query = mocks.list.mock.lastCall![0];
        expect(query.desde).toMatch(/^\d{4}-\d{2}-01$/);
        expect(query.hasta.slice(0, 7)).toBe(query.desde.slice(0, 7));
    });
    it("muestra errores sin simular resultados vacíos exitosos", async () => {
        mocks.list.mockRejectedValueOnce(new Error("Sin acceso a calificaciones"));
        render(<CalificacionesPage />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Sin acceso a calificaciones");
        expect(screen.queryByRole("button", { name: "Guardar requisitos" })).toBeNull();
    });
    it("descarta respuestas obsoletas al cambiar filtros", async () => {
        let finish!: (data: CalificacionesResult) => void;
        mocks.list.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        render(<CalificacionesPage />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
        fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por nombre del cliente" }), { target: { value: "ficticio" } });
        await screen.findByText("203 calif.");
        const old = result();
        old.ranking = [{ id: 11, nombre: "Respuesta obsoleta", cantidad: 999 }];
        await act(async () => {
            finish(old);
        });
        expect(screen.queryByText(/Respuesta obsoleta/)).toBeNull();
    });
    it("guarda solo los requisitos de validez", async () => {
        const saved = vi.fn();
        render(<CalificacionValidez politica={result().politica} puedeConfigurar onSave={saved} />);
        fireEvent.click(screen.getByRole("checkbox", { name: /Comentario obligatorio/ }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar requisitos" }));
        await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
        expect(mocks.policy).toHaveBeenCalledWith({ dni_obligatorio: true, comentario_obligatorio: true, asesor_obligatorio: false });
    });
    it("sin permiso muestra requisitos de solo lectura", () => {
        render(<CalificacionValidez politica={result().politica} puedeConfigurar={false} onSave={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Guardar requisitos" })).toBeNull();
        expect((screen.getByRole("checkbox", { name: /DNI obligatorio/ }) as HTMLInputElement).disabled).toBe(true);
    });
    it("una calificación no válida no ofrece aprobación directa", () => {
        const item = { ...rating(1, 18), usuarioRegistraId: 8, calificacionValida: false };
        render(
            <LlamadaActions
                item={item}
                contexto={{ idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: true, puedeRevisar: true }}
                onChanged={vi.fn()}
                onDetail={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
    });
});

const rating = (id: number, beneficiary: number, estado: EvidenciaEvento["estado"] = "PENDIENTE") =>
    ({
        id,
        idColaboradorBeneficiario: beneficiary,
        usuarioRegistraId: null,
        usuarioRegistraNombre: "Cliente · formulario público",
        estado,
        categoria: "CALIFICACION",
        datos: { autor_externo: true, cliente_documento: "12345678", estrellas: 5 },
        referencias: [],
        evidencia: [],
        revisiones: [],
        fechaEvento: "2026-10-25T14:00:00Z",
        tarifaRegistro: { tipoCalculo: "POR_UNIDAD", valor: 2 },
    }) as unknown as EvidenciaEvento;

describe("Calificaciones: Jefe de Tienda", () => {
    beforeEach(() => {
        mocks.profile.isStoreManager = true;
    });

    it("separa el alcance propio de la sede y reinicia la página al cambiar de vista", async () => {
        render(<CalificacionesPage />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ asesor: 12, pagina: 1 })));
        expect(screen.getByRole("heading", { name: "Atención Calificada" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Filtrar por nombre o DNI del colaborador" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Ranking de Aprobadas" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ asesor: 12, pagina: 2 }));
        fireEvent.click(screen.getByRole("button", { name: "Atención Calificada de Mi Sede" }));
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ asesor: 0, pagina: 1 }));
        expect(screen.getByRole("heading", { name: "Atención Calificada" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Ranking de Aprobadas" })).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox", { name: "Filtrar por nombre o DNI del colaborador" }), { target: { value: "Asesor ficticio" } });
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0].colaborador).toBe("Asesor ficticio"));
        expect(screen.getByRole("button", { name: "Mostrar QR" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Mi Atención Calificada" }));
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0]).toMatchObject({ asesor: 12, pagina: 1 }));
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0].asesor).toBe(12));
    });

    it("el jefe consulta las propias y revisa al equipo sin obtener edición administrativa", async () => {
        const own = rating(20, 12);
        const team = rating(21, 18);
        mocks.list.mockImplementation(async ({ asesor }: { asesor: number }) => ({
            ...result(),
            puedeAdministrar: false,
            items: asesor === 12 ? [own] : [own, team],
        }));
        render(<CalificacionesPage />);
        await screen.findByTestId("record-20");
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Atención Calificada de Mi Sede" }));
        const ownRow = within(await screen.findByTestId("record-20"));
        const teamRow = within(await screen.findByTestId("record-21"));
        expect(ownRow.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(ownRow.queryByRole("button", { name: "Rechazar" })).toBeNull();
        expect(teamRow.getByRole("button", { name: "Aprobar" })).toBeTruthy();
        expect(teamRow.getByRole("button", { name: "Rechazar" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
        fireEvent.click(ownRow.getByRole("button", { name: /Registro propio: solo consulta/ }));
        expect(screen.getByTestId("detail")).toHaveAttribute("data-readonly", "true");
        fireEvent.click(teamRow.getByRole("button", { name: "Ver detalle" }));
        expect(screen.getByTestId("detail")).toHaveAttribute("data-readonly", "false");
    });

    it("ofrece Agregar solo para la propia pendiente y Visualizar para operaciones ajenas o ya resueltas", async () => {
        const own = rating(20, 12);
        const team = { ...rating(21, 18), usuarioRegistraId: 7 };
        const saved = {
            ...rating(22, 19),
            referencias: [
                { id: 1, tipoReferencia: "OPERACION", idOperacion: 44, idCliente: null, identificadorExterno: null },
                { id: 2, tipoReferencia: "OPERACION", idOperacion: 45, idCliente: null, identificadorExterno: null },
            ],
        };
        mocks.list.mockResolvedValue({ ...result(), items: [own, team, saved, rating(23, 12, "APROBADO")] });
        render(<CalificacionesPage />);
        fireEvent.click(screen.getByRole("button", { name: "Atención Calificada de Mi Sede" }));
        expect(within(await screen.findByTestId("record-20")).getByRole("button", { name: "Agregar" })).toBeTruthy();
        for (const id of [21, 22, 23]) {
            const row = within(screen.getByTestId(`record-${id}`));
            expect(row.queryByRole("button", { name: "Agregar" })).toBeNull();
            expect(row.getByRole("button", { name: "Visualizar" })).toBeTruthy();
        }
        fireEvent.click(within(screen.getByTestId("record-22")).getByRole("button", { name: "Visualizar" }));
        expect(mocks.operations.mock.lastCall?.[0].item.referencias.map((ref: { idOperacion: number }) => ref.idOperacion)).toEqual([44, 45]);
    });

    it("espera el contexto propio y no hace una consulta de sede si falta la ficha", async () => {
        let finish!: (value: unknown) => void;
        mocks.context.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        render(<CalificacionesPage />);
        expect(mocks.list).not.toHaveBeenCalled();
        await act(async () => {
            finish({ idUsuario: 7, idColaborador: null });
        });
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo verificar tu ficha");
        expect(mocks.list).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Atención Calificada de Mi Sede" }));
        await waitFor(() => expect(mocks.list.mock.lastCall?.[0].asesor).toBe(0));
    });

    it("un fallo del contexto no convierte Mis Calificaciones en una consulta general", async () => {
        mocks.context.mockRejectedValueOnce(new Error("Sin conexión"));
        render(<CalificacionesPage />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo verificar tu ficha");
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("descarta la respuesta propia si llega después de cambiar a la sede", async () => {
        let finish!: (data: CalificacionesResult) => void;
        mocks.list.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        render(<CalificacionesPage />);
        await waitFor(() => expect(mocks.list).toHaveBeenCalledOnce());
        mocks.list.mockResolvedValue({ ...result(), items: [rating(21, 18)] });
        fireEvent.click(screen.getByRole("button", { name: "Atención Calificada de Mi Sede" }));
        await screen.findByTestId("record-21");
        await act(async () => {
            finish({ ...result(), items: [rating(20, 12)] });
        });
        expect(screen.queryByTestId("record-20")).toBeNull();
        expect(screen.getByTestId("record-21")).toBeTruthy();
    });
});
