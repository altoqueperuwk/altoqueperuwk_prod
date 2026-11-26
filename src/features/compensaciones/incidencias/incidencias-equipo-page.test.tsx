import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { IncidenciasEquipoPage } from "./incidencias-equipo-page";
import type { IncidenciaEvento } from "./incidencias.types";
import { OperacionesAdjuntarDialog } from "./operaciones-adjuntar-dialog";

const mocks = vi.hoisted(() => ({ getTeamList: vi.fn(), getCatalog: vi.fn(), getClientOperations: vi.fn(), respondTeam: vi.fn(), annul: vi.fn() }));
vi.mock("./incidencias.service", () => ({ incidenciasService: mocks }));
vi.mock("../shared/compensacion-perfil", async (importActual) => ({
    ...(await importActual<typeof import("../shared/compensacion-perfil")>()),
    useCompensacionPerfil: () => ({
        isAdvisor: false,
        isStoreManager: true,
        isFacturacion: false,
        isPagos: false,
        isMarketing: false,
        isAdministrator: false,
        isResolving: false,
        userId: 7,
    }),
}));

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./incidencia-equipo-form", () => ({ IncidenciaEquipoForm: () => <p>Formulario de nueva incidencia</p> }));
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <input aria-label="Periodo" value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <label>
            {label}
            <input aria-label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    ),
}));

const base = {
    idTipoEvento: 26,
    idPenalidadTipo: 5,
    tipoEventoNombre: "Reporte",
    categoria: "PENALIDAD" as const,
    requiereRespuesta: false,
    montoReferencia: 2,
    montoBonoReportante: null,
    reportanteNombre: null,
    reportanteDocumento: null,
    responsableNombre: "IVONNE RUIZ",
    responsableDocumento: "11111111",
    sucursalOrigenNombre: "Norte",
    sucursalResponsableNombre: "Lince",
    fechaEvento: "2026-11-12T10:00:00Z",
    titulo: "Abandono Chat",
    motivo: "Chat sin respuesta",
    evidencia: [],
    importeAprobado: null,
    usuarioRegistraNombre: "Administración",
    revisiones: [],
} satisfies Partial<IncidenciaEvento>;
const received = { ...base, id: 11, penalidadNombre: "Abandono Chat", estado: "PENDIENTE", direccion: "RECIBIDAS" } as IncidenciaEvento;
const sent = {
    ...base,
    id: 12,
    penalidadNombre: "Error de datos",
    estado: "APROBADO",
    direccion: "ENVIADAS",
    usuarioRegistraNombre: "Jefe",
} as IncidenciaEvento;
const result = (items: IncidenciaEvento[]) => ({
    items,
    resumen: { recibidasPendientes: 1, enviadasPendientes: 0, aprobadas: 1, rechazadas: 0 },
    totalPages: 1,
});

beforeEach(() => {
    mocks.getCatalog.mockResolvedValue({
        tipos: [],
        reportantes: [],
        responsables: [{ id: 1, nombre: "Ivonne", documento: "1", idSucursal: 1, sucursal: "Lince" }],
        penalidades: [],
    });
    mocks.getTeamList.mockResolvedValue(result([received, sent]));
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("Incidencias del equipo (Jefe de Sede)", () => {
    it("muestra tarjetas y una sola tabla con Recibidas y Enviadas; sin formulario (dashboard)", async () => {
        render(<IncidenciasEquipoPage />);
        await screen.findAllByText("Abandono Chat");
        expect(screen.queryByText("Formulario de nueva incidencia")).toBeNull();
        expect((await screen.findAllByText("Abandono Chat")).length).toBeGreaterThan(0);
        expect(screen.getAllByText("Error de datos").length).toBeGreaterThan(0);
        for (const label of ["Recibidas Pendientes", "Enviadas Pendientes", "Aprobadas", "Rechazadas"])
            expect(screen.getAllByText(label).length).toBeGreaterThan(0);
        expect(screen.getAllByText("Recibida").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Enviada").length).toBeGreaterThan(0);
        expect(mocks.getTeamList).toHaveBeenCalledWith(expect.objectContaining({ direction: "" }));
    });

    it("filtra por dirección con el servidor", async () => {
        render(<IncidenciasEquipoPage />);
        await screen.findAllByText("Abandono Chat");
        fireEvent.click(screen.getByRole("button", { name: /Dirección/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Recibidas" }));
        await waitFor(() => expect(mocks.getTeamList).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "RECIBIDAS", page: 1 })));
        fireEvent.click(screen.getByRole("button", { name: /Dirección/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Enviadas" }));
        await waitFor(() => expect(mocks.getTeamList).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "ENVIADAS" })));
    });

    it("el Jefe responde una recibida con conformidad o descargo y no ve botones de aprobar", async () => {
        mocks.respondTeam.mockResolvedValue({ id: 11 });
        render(<IncidenciasEquipoPage />);
        await screen.findAllByText("Abandono Chat");
        fireEvent.click(screen.getAllByRole("button", { name: "Ver detalle de incidencia" })[0]);
        expect(await screen.findByText("Tu respuesta como Jefe de Sede")).toBeVisible();
        expect(screen.queryByRole("button", { name: /Aprobar|Rechazar/ })).toBeNull();
        expect(screen.getByRole("button", { name: "Enviar respuesta" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: /Postura/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Presentar descargo" }));
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "El chat fue atendido en el tiempo permitido" } });
        fireEvent.click(screen.getByRole("button", { name: "Enviar respuesta" }));
        await waitFor(() => expect(mocks.respondTeam).toHaveBeenCalledWith(11, "DESCARGO", "El chat fue atendido en el tiempo permitido"));
    });

    it("una enviada es solo consulta", async () => {
        render(<IncidenciasEquipoPage />);
        await screen.findAllByText("Abandono Chat");
        fireEvent.click(screen.getAllByRole("button", { name: "Ver detalle de incidencia" })[1]);
        expect(await screen.findByRole("heading", { name: "Error de datos" })).toBeVisible();
        expect(screen.queryByText("Tu respuesta como Jefe de Sede")).toBeNull();
        expect(screen.queryByRole("button", { name: "Enviar respuesta" })).toBeNull();
    });

    it("el autor anula su enviada pendiente con motivo y no puede anular una ajena", async () => {
        mocks.annul.mockResolvedValue({ id: 13 });
        const own = { ...sent, id: 13, estado: "PENDIENTE", usuarioRegistraId: 7 } as IncidenciaEvento;
        const other = { ...sent, id: 14, estado: "PENDIENTE", usuarioRegistraId: 99 } as IncidenciaEvento;
        mocks.getTeamList.mockResolvedValue(result([other, own]));
        render(<IncidenciasEquipoPage />);
        await screen.findAllByText("Error de datos");
        fireEvent.click(screen.getAllByRole("button", { name: "Ver detalle de incidencia" })[0]);
        expect(await screen.findByRole("heading", { name: "Error de datos" })).toBeVisible();
        expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
        cleanup();
        mocks.getTeamList.mockResolvedValue(result([own]));
        render(<IncidenciasEquipoPage />);
        await screen.findAllByText("Error de datos");
        fireEvent.click(screen.getByRole("button", { name: "Ver detalle de incidencia" }));
        fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
        expect(mocks.annul).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo de la anulación/ }), { target: { value: "Se registró por error" } });
        fireEvent.click(screen.getByRole("button", { name: "Anular" }));
        await waitFor(() => expect(mocks.annul).toHaveBeenCalledWith(13, "Se registró por error"));
    });

    it("muestra el error de consulta sin datos inventados", async () => {
        mocks.getTeamList.mockRejectedValue(new Error("Esta consulta corresponde a Jefatura de sede"));
        render(<IncidenciasEquipoPage />);
        await waitFor(() => expect(screen.getByText("Esta consulta corresponde a Jefatura de sede")).toBeVisible());
        expect(alertSpy).toHaveBeenCalledWith("error", "Esta consulta corresponde a Jefatura de sede");
    });

    it("sincroniza Periodo y fechas, omite rangos invertidos y limpia conservando la bandeja", async () => {
        render(<IncidenciasEquipoPage />);
        await screen.findAllByText("Abandono Chat");
        const originalFrom = mocks.getTeamList.mock.calls[0][0].from;
        fireEvent.change(screen.getByLabelText("Periodo"), { target: { value: "2026-02" } });
        await waitFor(() => expect(mocks.getTeamList).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-02-01", to: "2026-02-28", page: 1 })));
        const count = mocks.getTeamList.mock.calls.length;
        fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-01-31" } });
        await act(() => new Promise<void>((resolve) => setTimeout(resolve, 410)));
        expect(mocks.getTeamList).toHaveBeenCalledTimes(count);
        fireEvent.click(screen.getByRole("button", { name: /Dirección/ }));
        fireEvent.click(await screen.findByRole("option", { name: "Enviadas" }));
        fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
        await waitFor(() =>
            expect(mocks.getTeamList).toHaveBeenLastCalledWith(
                expect.objectContaining({ direction: "ENVIADAS", from: originalFrom, dni: "", code: "", search: "", status: "", page: 1 }),
            ),
        );
        expect(screen.getByLabelText("Desde")).toHaveValue(originalFrom);
    });

    it("normaliza nombres y mantiene fecha completa con hora separada", async () => {
        mocks.getTeamList.mockResolvedValue(
            result([
                {
                    ...received,
                    responsableNombre: "PERSONA DEMOSTRACIÓN",
                    clienteNombre: "CLIENTE DEMOSTRACIÓN",
                    clienteDocumento: "00000022",
                    usuarioRegistraNombre: "EQUIPO DEMOSTRACIÓN",
                },
            ]),
        );
        render(<IncidenciasEquipoPage />);
        expect(await screen.findByText("Persona Demostración")).toHaveAttribute("title", "PERSONA DEMOSTRACIÓN");
        expect(screen.getByText("Cliente Demostración")).toHaveAttribute("title", "CLIENTE DEMOSTRACIÓN");
        expect(screen.getByText("Equipo Demostración")).toHaveAttribute("title", "EQUIPO DEMOSTRACIÓN");
        expect(screen.getByText("12/11/2026")).toBeInTheDocument();
        expect(screen.getByText("00000022")).toBeInTheDocument();
    });
});

describe("Opciones compartidas del Jefe de Sede", () => {
    it.each([
        ["AUDITORIA", "Auditoría Operaciones", "Registrar Auditoria"],
        ["PERSONAL", "Indisciplina Colaborador", "Registrar Indisciplina"],
    ] as const)("%s: una sola pantalla con formulario propio y el concepto filtrado en el servidor", async (grupo, title, formTitle) => {
        render(<IncidenciasEquipoPage grupo={grupo} />);
        expect(await screen.findByText("Formulario de nueva incidencia")).toBeVisible();
        expect(screen.getByRole("heading", { name: title })).toBeVisible();
        expect(screen.getByText(formTitle)).toBeVisible();
        await waitFor(() => expect(mocks.getTeamList).toHaveBeenCalledWith(expect.objectContaining({ grupo })));
    });

    it("Penalidad Escalonada Bonos es solo consulta: sin formulario y con su grupo", async () => {
        render(<IncidenciasEquipoPage grupo="ESCALONADA" />);
        expect(await screen.findByRole("heading", { name: "Penalidad Escalonada Bonos" })).toBeVisible();
        expect(screen.queryByText("Formulario de nueva incidencia")).toBeNull();
        await waitFor(() => expect(mocks.getTeamList).toHaveBeenCalledWith(expect.objectContaining({ grupo: "ESCALONADA" })));
    });
});

describe("Adjuntar operación", () => {
    const ops = [
        { id: 1, tipo: "Efectivización", codigo: "OP-100", monto: 350, fecha: "2026-11-10T10:00:00Z", estado: "Pagado" },
        { id: 2, tipo: "Pago de Deuda", codigo: "OP-200", monto: 120, fecha: "2026-11-09T10:00:00Z", estado: "Pendiente" },
    ];
    it("lista las operaciones del DNI, filtra por código y confirma la selección", async () => {
        mocks.getClientOperations.mockResolvedValue({ cliente: "Cliente Prueba", items: ops });
        const onConfirm = vi.fn();
        render(<OperacionesAdjuntarDialog document="12345678" selected={[]} onClose={vi.fn()} onConfirm={onConfirm} />);
        expect((await screen.findAllByText("OP-100")).length).toBeGreaterThan(0);
        expect(mocks.getClientOperations).toHaveBeenCalledWith("12345678", "");
        fireEvent.click(screen.getAllByRole("checkbox", { name: "Seleccionar operación OP-200" })[0]);
        fireEvent.click(screen.getByRole("button", { name: "Adjuntar selección" }));
        expect(onConfirm).toHaveBeenCalledWith([ops[1]]);
        fireEvent.change(screen.getByRole("textbox", { name: /Código de operación/ }), { target: { value: "OP-1" } });
        fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
        await waitFor(() => expect(mocks.getClientOperations).toHaveBeenLastCalledWith("12345678", "OP-1"));
    });

    it("conserva lo ya adjuntado y muestra el error del servidor", async () => {
        mocks.getClientOperations.mockRejectedValue(new Error("El DNI no pertenece a un cliente registrado y activo"));
        render(<OperacionesAdjuntarDialog document="99999999" selected={[ops[0]]} onClose={vi.fn()} onConfirm={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("El DNI no pertenece a un cliente registrado y activo")).toBeVisible());
    });
});
