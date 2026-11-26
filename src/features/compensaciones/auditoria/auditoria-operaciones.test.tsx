import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { AuditoriaOperacionesPage } from "../atc/auditoria-operaciones-page";
import { otrasOpcionesAtc } from "./atc-auditoria";
import { otrasOpcionesFacturacion } from "./facturacion-auditoria";
import { otrasOpcionesPagos } from "./pagos-auditoria";

const mocks = vi.hoisted(() => ({
    perfil: {} as Record<string, unknown>,
    getList: vi.fn(),
    getTypes: vi.fn(),
    getCardContext: vi.fn(),
    registerCard: vi.fn(),
    penalidades: vi.fn(),
    getTeamList: vi.fn(),
    getCatalog: vi.fn(),
    createCaza: vi.fn(),
    sendCaza: vi.fn(),
    clientOperations: vi.fn(),
    pagosGuardar: vi.fn(),
    pagosAnular: vi.fn(),
    pagosOperaciones: vi.fn(),
    pagosListar: vi.fn(),
    pagosValidar: vi.fn(),
    factContexto: vi.fn(),
    factListar: vi.fn(),
    factGuardar: vi.fn(),
    factAnular: vi.fn(),
    mkList: vi.fn(),
    mkAlerts: vi.fn(),
    mkValidate: vi.fn(),
    mkSave: vi.fn(),
}));

vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [], catalogos: { estados: [] } }) }));
vi.mock("../shared/compensacion-perfil", async (original) => ({
    ...(await original<object>()),
    useCompensacionPerfil: () => mocks.perfil,
}));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => {
    const cliente = { id: 5, nombre: "CLIENTE DEMO", celular: [], id_comunidad: 0 };
    return { useClienteLookup: (dni: string) => ({ result: dni.length === 8 ? cliente : null, isLoading: false, error: "" }) };
});
vi.mock("../evidencias/evidencias.service", () => ({
    evidenciasService: { getList: mocks.getList, getTypes: mocks.getTypes, getCardContext: mocks.getCardContext, registerCard: mocks.registerCard },
}));
vi.mock("../incidencias/incidencias.service", () => ({
    incidenciasService: {
        getList: mocks.penalidades,
        getTeamList: mocks.getTeamList,
        getCatalog: mocks.getCatalog,
        createCazaErrores: mocks.createCaza,
        sendCazaErrores: mocks.sendCaza,
        getClientOperations: mocks.clientOperations,
    },
}));
vi.mock("../evidencias/pagos-detecciones.service", () => ({
    pagosDeteccionesService: { guardar: mocks.pagosGuardar, anular: mocks.pagosAnular, operaciones: mocks.pagosOperaciones },
}));
vi.mock("../evidencias/pagos-validacion.service", () => ({ pagosValidacionService: { listar: mocks.pagosListar, validar: mocks.pagosValidar } }));
vi.mock("../evidencias/facturacion-auditoria.service", async (original) => ({
    ...(await original<object>()),
    facturacionAuditoriaService: { contexto: mocks.factContexto, listar: mocks.factListar, guardar: mocks.factGuardar, anular: mocks.factAnular },
}));
vi.mock("../marketing/marketing.service", () => ({
    marketingService: { list: mocks.mkList, alertsToValidate: mocks.mkAlerts, validateAlert: mocks.mkValidate, save: mocks.mkSave },
}));
vi.mock("../evidencias/evidencia-detail-modal", () => ({ EvidenciaDetailModal: () => null }));
vi.mock("../incidencias/incidencia-detail-modal", () => ({ IncidenciaDetailModal: () => null }));
vi.mock("../incidencias/incidencia-equipo-detail", () => ({ IncidenciaEquipoDetail: () => null }));
vi.mock("../evidencias/llamada-actions", () => ({ LlamadaActions: () => <button type="button">Ver tarjeta</button> }));
vi.mock("../shared/compensacion-surface", () => ({ CompensacionSurface: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        "aria-label": ariaLabel,
        items,
        selectedKey,
        onSelectionChange,
    }: {
        label?: string;
        "aria-label"?: string;
        items: Array<{ id: string | number; label: string }>;
        selectedKey: string | number | null;
        onSelectionChange: (key: string) => void;
    }) => (
        <label>
            {label}
            <select aria-label={label ?? ariaLabel} value={selectedKey ?? ""} onChange={(e) => onSelectionChange(e.target.value)}>
                <option value="">—</option>
                {items
                    .filter((i) => i.id !== "")
                    .map((i) => (
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

const perfil = (patch: Record<string, unknown> = {}) => ({
    isAdvisor: false,
    isStoreManager: false,
    isFacturacion: false,
    isPagos: false,
    isMarketing: false,
    isAdministrator: false,
    isResolving: false,
    userId: 11,
    ...patch,
});
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const fecha = `${hoy.slice(0, 7)}-01T15:00:00Z`;
const page = (items: unknown[]) => ({ items, total: items.length, totalPages: 1, resumen: {} });
const penalidad = {
    id: 7,
    penalidadNombre: "Retraso de vouchers",
    motivo: "Voucher tardío",
    responsableNombre: "Operador Uno",
    usuarioRegistraNombre: "Administración",
    fechaEvento: fecha,
    estado: "APROBADO",
    importeAprobado: 2,
};
const bono = {
    id: 1,
    tipoNombre: "Reporte de Abandono",
    descripcion: "Chat sin respuesta",
    estado: "PENDIENTE",
    fechaEvento: fecha,
    usuarioRegistraNombre: "Operador Uno",
    datos: {},
    importeAprobado: null,
};

beforeEach(() => {
    vi.resetAllMocks();
    mocks.perfil = perfil();
    mocks.getList.mockResolvedValue(page([bono]));
    mocks.getTypes.mockResolvedValue([{ id: 13, codigo: "REPORTE_ABANDONO" }]);
    mocks.getCardContext.mockResolvedValue({ idUsuario: 11, idColaborador: 4, puedeRegistrar: true });
    mocks.penalidades.mockResolvedValue(page([penalidad]));
    mocks.getTeamList.mockResolvedValue(page([{ ...penalidad, direccion: "ENVIADAS", estado: "PENDIENTE" }]));
    mocks.getCatalog.mockImplementation(async (id?: number) => ({
        tipos: [{ id: 26, codigo: "AUDITORIA_ACTIVA" }],
        reportantes: [{ id: 3 }],
        responsables: [{ id: 8, nombre: "Asesor Demo" }],
        penalidades: id ? [{ id: 5, codigo: "ATC_ABANDONO_CHAT" }] : [],
    }));
    mocks.pagosListar.mockResolvedValue([]);
    mocks.factContexto.mockResolvedValue({ es_admin: false, puede_registrar: true, id_colaborador: 18 });
    mocks.factListar.mockResolvedValue({ items: [], total: 0 });
    mocks.mkList.mockResolvedValue({
        items: [],
        total_paginas: 1,
        es_admin: false,
        puede_registrar: true,
        responsables: [{ id: 8, nombre: "Asesor Demo", sede: "Lince" }],
    });
    mocks.mkAlerts.mockResolvedValue({ items: [] });
});
afterEach(cleanup);

const escribir = (name: RegExp, value: string) => fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });
const elegir = (name: string, value: string) => fireEvent.change(screen.getByRole("combobox", { name }), { target: { value } });
const guardar = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

describe("Auditoría Operaciones es la misma pantalla para todos los perfiles", () => {
    it.each([
        ["ATC", {}],
        ["Jefe de Sede", { isStoreManager: true }],
        ["Facturación", { isFacturacion: true }],
        ["Pagos", { isPagos: true }],
        ["Marketing", { isMarketing: true }],
    ])("%s comparte tarjetas, campos, filtros y columnas", async (_nombre, patch) => {
        mocks.perfil = perfil(patch);
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Registrar Auditoria");
        for (const texto of ["Registros", "Pendientes", "Bonos aprobados", "Penalidades aprobadas"]) expect(screen.getByText(texto)).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Tipo de incidencia" })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: /DNI del Cliente/ })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: /Notas/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
        for (const filtro of ["Filtrar por tipo", "Filtrar por estado"]) expect(screen.getByRole("combobox", { name: filtro })).toBeTruthy();
        expect(screen.getByRole("textbox", { name: "Buscar colaborador, DNI u operación" })).toBeTruthy();
        for (const columna of ["Tipo", "Detalle", "Colaborador", "Registrado por", "Fecha", "Monto", "Estado"])
            expect(screen.getByRole("columnheader", { name: columna })).toBeTruthy();
        expect(screen.queryByRole("textbox", { name: /Evidencia/ })).toBeNull();
    });

    it("cada área excluye las penalidades que tienen su propia opción", () => {
        expect(otrasOpcionesAtc).toEqual(["ATC_UNIFORME", "ATC_INDISCIPLINA"]);
        expect(otrasOpcionesFacturacion).toEqual(["FAC_UNIFORME", "FAC_INDISCIPLINA"]);
        expect(otrasOpcionesPagos).toContain("PAG_VIRTUAL_CIERRE_INCOMPLETO");
        expect(otrasOpcionesPagos.some((code) => code.includes("RETRASO_VOUCHER") || code.includes("ERROR_PAGO_CRITICO"))).toBe(false);
    });

    it("el filtro de tipo y la búsqueda actúan sobre la misma tabla", async () => {
        mocks.perfil = perfil({ isPagos: true });
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Retraso de vouchers");
        expect(screen.getByText("Chat sin respuesta")).toBeTruthy();
        elegir("Filtrar por tipo", "PENALIDAD");
        await waitFor(() => expect(screen.queryByText("Chat sin respuesta")).toBeNull());
        escribir(/Buscar colaborador/, "no existe");
        await screen.findByText("Sin registros de auditoría");
    });

    it("ATC registra la tarjeta con notas opcionales y sin operación", async () => {
        mocks.registerCard.mockResolvedValue({ id: 1 });
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Retraso de vouchers");
        escribir(/DNI del Cliente/, "70176064");
        escribir(/Tarjeta/, "1234");
        guardar();
        await waitFor(() => expect(mocks.registerCard).toHaveBeenCalledWith("70176064", "CLIENTE DEMO", hoy, "", "1234", expect.any(String), "", null));
    });

    it("Pagos registra con DNI y notas, sin operación", async () => {
        mocks.perfil = perfil({ isPagos: true });
        mocks.pagosGuardar.mockResolvedValue({ id: 1 });
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Retraso de vouchers");
        elegir("Tipo de incidencia", "REPORTE_ABANDONO");
        escribir(/DNI del Cliente/, "70176064");
        escribir(/Notas/, "Chat sin respuesta");
        guardar();
        await waitFor(() =>
            expect(mocks.pagosGuardar).toHaveBeenCalledWith(
                "REPORTE_ABANDONO",
                null,
                { motivo: "Chat sin respuesta", dni: "70176064", fecha: hoy },
                expect.any(String),
            ),
        );
    });

    it("avisa qué falta en lugar de enviar", async () => {
        mocks.perfil = perfil({ isPagos: true });
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Retraso de vouchers");
        guardar();
        expect(alertSpy).toHaveBeenCalledWith("validation", "Selecciona el tipo de incidencia.");
        expect(mocks.pagosGuardar).not.toHaveBeenCalled();
    });

    it("Pagos anula un reporte pendiente con motivo", async () => {
        mocks.perfil = perfil({ isPagos: true });
        mocks.pagosAnular.mockResolvedValue({ id: 1 });
        render(<AuditoriaOperacionesPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Anular reporte" }));
        const confirmar = screen.getAllByRole("button", { name: "Anular reporte" }).at(-1)!;
        expect(confirmar).toBeDisabled();
        escribir(/Motivo de la anulación/, "Registrado por error");
        fireEvent.click(confirmar);
        await waitFor(() => expect(mocks.pagosAnular).toHaveBeenCalledWith(1, "Registrado por error"));
    });

    it("Facturación registra una Operación Extra con su comprobante", async () => {
        mocks.perfil = perfil({ isFacturacion: true });
        mocks.factGuardar.mockResolvedValue({ id: 3 });
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Registrar Auditoria");
        elegir("Tipo de incidencia", "OPERACION_EXTRA");
        escribir(/DNI del Cliente/, "70176064");
        escribir(/Comprobante/, "EXT-1");
        escribir(/Notas/, "Comprobante sin operación");
        guardar();
        await waitFor(() =>
            expect(mocks.factGuardar).toHaveBeenCalledWith(
                expect.objectContaining({ tipo: "OPERACION_EXTRA", codigo: "EXT-1", error: null, operacion: null, clave: expect.any(String) }),
            ),
        );
    });

    it("Marketing envía la alerta con asesor, conversación y notas", async () => {
        mocks.perfil = perfil({ isMarketing: true });
        mocks.mkSave.mockResolvedValue({ id: 4 });
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Registrar Auditoria");
        elegir("Tipo de incidencia", "ERROR_DATOS");
        await screen.findByRole("option", { name: "Asesor Demo · Lince" });
        elegir("Colaborador", "8");
        escribir(/Conversación/, "CONV-1");
        escribir(/Notas/, "Datos errados en el chat");
        guardar();
        await waitFor(() =>
            expect(mocks.mkSave).toHaveBeenCalledWith(
                "ALERTA_TEMPRANA",
                expect.objectContaining({ titulo: "Error de datos", responsable_id: "8", conversacion: "CONV-1", dni: "", operacion_id: "" }),
                expect.any(String),
                true,
                null,
            ),
        );
    });

    it("el Jefe registra el hallazgo y lo envía a Administración", async () => {
        mocks.perfil = perfil({ isStoreManager: true });
        mocks.createCaza.mockResolvedValue(90);
        render(<AuditoriaOperacionesPage />);
        await screen.findByText("Retraso de vouchers");
        elegir("Tipo de incidencia", "ABANDONO_CHAT");
        await screen.findByRole("option", { name: "Asesor Demo" });
        elegir("Colaborador", "8");
        escribir(/DNI del Cliente/, "70176064");
        escribir(/Notas/, "Dejó el chat sin responder");
        guardar();
        await waitFor(() => expect(mocks.sendCaza).toHaveBeenCalledWith(90, "CONVERSACION_PROCESO"));
        expect(mocks.createCaza).toHaveBeenCalledWith(
            expect.objectContaining({
                idPenalidadTipo: 5,
                idResponsable: 8,
                clienteId: 5,
                motivo: "Hallazgo: Abandono de chat\nNotas: Dejó el chat sin responder",
            }),
            "CONVERSACION_PROCESO",
            expect.any(String),
        );
    });

    it("el Jefe valida Pagos y Marketing desde la misma tabla, aunque sean de otro mes", async () => {
        mocks.perfil = perfil({ isStoreManager: true });
        const pago = { id: 21, tipoNombre: "Error en datos manuales", estado: "PENDIENTE", fecha: "2020-01-05T10:00:00Z", beneficiario: "Operador" };
        mocks.pagosListar.mockResolvedValue([{ ...pago, descripcion: "Dato digitado mal", operacion: null, evidencia: null, decision: null }]);
        mocks.mkAlerts.mockResolvedValue({
            items: [
                {
                    id: 9,
                    fecha: "2020-01-06",
                    titulo: "Alerta",
                    descripcion: "Datos errados",
                    estado: "PENDIENTE",
                    beneficiario: "Marketing Demo",
                    responsable: "Asesor Demo",
                    motivo: "ERROR_DATOS",
                    conversacion: "CONV-1",
                    operacion: null,
                    evidencia: null,
                    decision: null,
                },
            ],
        });
        mocks.pagosValidar.mockResolvedValue({ decision: "APROBADO" });
        mocks.mkValidate.mockResolvedValue({});
        render(<AuditoriaOperacionesPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Validar reporte de Pagos" }));
        escribir(/Comentario de validación/, "Hecho verificado en el sistema");
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await waitFor(() => expect(mocks.pagosValidar).toHaveBeenCalledWith(21, "APROBADO", "Hecho verificado en el sistema"));
        fireEvent.click(await screen.findByRole("button", { name: "Validar alerta" }));
        escribir(/Comentario de validación/, "Revisado con la conversación");
        fireEvent.click(screen.getByRole("button", { name: "Validar" }));
        await waitFor(() => expect(mocks.mkValidate).toHaveBeenCalledWith(9, "APROBADO", "Revisado con la conversación"));
    });
});
