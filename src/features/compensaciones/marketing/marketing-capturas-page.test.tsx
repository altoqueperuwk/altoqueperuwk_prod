import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { MarketingCapturasPage } from "./marketing-capturas-page";
import { RecuperacionPage } from "./recuperacion-page";
import { VideoViralPage } from "./video-viral-page";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    save: vi.fn(),
    operations: vi.fn(),
    review: vi.fn(),
    remove: vi.fn(),
    isStoreManager: false,
}));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isStoreManager: mocks.isStoreManager }) }));
vi.mock("./marketing.service", () => ({ marketingService: mocks }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));

vi.mock("@/providers/session-cache-provider", () => ({
    useSessionCache: () => ({
        navegacion: { rutas_permitidas: ["/compensaciones/otros-bonos/video_viral", "/compensaciones/otros-bonos/recuperacion_cliente"] },
    }),
}));
const panel = {
    es_admin: false,
    id_colaborador: 51,
    total: 0,
    total_paginas: 1,
    items: [],
    responsables: [],
    kpis: { pendientes: 0, aprobados: 0, rechazados: 0 },
};
const open = () =>
    render(
        <MemoryRouter>
            <VideoViralPage />
        </MemoryRouter>,
    );
const openRecovery = () =>
    render(
        <MemoryRouter>
            <RecuperacionPage />
        </MemoryRouter>,
    );
beforeEach(() => {
    vi.resetAllMocks();
    mocks.isStoreManager = false;
    mocks.list.mockResolvedValue(panel);
});

it("jefatura consulta alertas y revisa sin captura ni edición, incluso con flags de edición antiguos", async () => {
    mocks.isStoreManager = true;
    mocks.list.mockResolvedValue({
        ...panel,
        puede_registrar: false,
        es_revisor: true,
        items: [
            {
                id: 7,
                titulo: "Alerta del equipo",
                descripcion: "Datos comprobados",
                fecha: "2026-11-01",
                estado: "PENDIENTE",
                captura: {},
                usuario: "Marketing",
                responsable: "ASESOR DEMOSTRACIÓN",
                estado_calculo: "FUENTE_INVALIDA",
                motivo_calculo: "Fuente sintética pendiente de comprobación",
                puede_editar: true,
                puede_revisar: true,
            },
        ],
    });
    render(
        <MemoryRouter>
            <MarketingCapturasPage alert />
        </MemoryRouter>,
    );
    await screen.findByText("Alerta del equipo");
    expect(screen.getByText("Asesor Demostración")).toHaveAttribute("title", "ASESOR DEMOSTRACIÓN");
    expect(screen.queryByRole("columnheader", { name: "Estado de validación" })).toBeNull();
    expect(mocks.list).toHaveBeenCalledWith("ALERTA_TEMPRANA", expect.any(String), "", "", 1, 20);
    expect(screen.queryByText("Registrar Alerta")).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar borrador|Videos|Clientes Recuperados|Borrador/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Revisar registro/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Motivo/ }), { target: { value: "Evidencia de alerta comprobada" } });
    mocks.review.mockResolvedValue({ id: 7 });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith(7, "APROBADO", "Evidencia de alerta comprobada"));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.operations).not.toHaveBeenCalled();
});

it("puede_registrar false prevalece sobre el fallback y es_revisor false sobre permisos de fila", async () => {
    mocks.list.mockResolvedValue({
        ...panel,
        puede_registrar: false,
        es_revisor: false,
        items: [{ id: 8, titulo: "Solo consulta", fecha: "2026-11-01", captura: {}, puede_editar: true, puede_revisar: true }],
    });
    open();
    await screen.findByText("Solo consulta");
    expect(screen.queryByText("Registrar Video")).toBeNull();
    expect(screen.queryByText("Registrar Campaña")).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar borrador|Revisar registro/i })).toBeNull();
});

it.each(["FUENTE_INVALIDA", "PENDIENTE", "EN_REVISION"])(
    "muestra verificación %s con motivo, sin segunda columna de estado ni bono cero",
    async (estado_calculo) => {
        mocks.list.mockResolvedValue({
            ...panel,
            puede_registrar: false,
            items: [
                {
                    id: 9,
                    titulo: "Cálculo por validar",
                    fecha: "2026-11-01",
                    captura: {},
                    estado_calculo,
                    motivo_calculo: "La operación vinculada requiere validación",
                    aviso_fecha: "2026-11-03T15:30:00-05:00",
                    importe: estado_calculo === "EN_REVISION" ? 50 : 0,
                },
            ],
        });
        open();
        await waitFor(() => expect(screen.getByText("La operación vinculada requiere validación")).toBeVisible());
        expect(screen.getByRole("columnheader", { name: "Verificación" })).toBeVisible();
        expect(screen.queryByRole("columnheader", { name: "Estado de validación" })).toBeNull();
        expect(screen.queryByText("Liquidado")).toBeNull();
        if (estado_calculo === "FUENTE_INVALIDA") expect(screen.getByText("Fuente inválida")).toBeVisible();
        expect(screen.queryByText("S/ 50.00")).toBeNull();
        expect(screen.getByText("Aviso interno registrado")).toBeVisible();
        expect(screen.queryByText("S/ 0.00")).toBeNull();
    },
);
afterEach(cleanup);

it("mantiene capturas propias y exige título y descripción antes de invocar el servidor", async () => {
    open();
    await screen.findByText("Registrar Video");
    expect(screen.queryByText("Revisar Registro")).toBeNull();
    expect(screen.getByRole("textbox", { name: /^Título/ })).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Borrador" }));
    expect(alertSpy).toHaveBeenCalledWith("validation", "Título y descripción son obligatorios.");
    expect(screen.getByRole("textbox", { name: /^Título/ })).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("textbox", { name: /^Título/ })).not.toHaveAttribute("aria-invalid", "true");
    expect(mocks.save).not.toHaveBeenCalled();
});
it("un doble clic guarda un solo borrador y no confirma éxito antes de la respuesta", async () => {
    let resolve!: (value: unknown) => void;
    mocks.save.mockReturnValue(
        new Promise((r) => {
            resolve = r;
        }),
    );
    open();
    await screen.findByText("Registrar Video");
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Video de prueba" } });
    fireEvent.change(screen.getAllByRole("textbox", { name: /^Descripción/ }).at(-1)!, { target: { value: "Descripción del video" } });
    const draft = screen.getByRole("button", { name: "Borrador" });
    fireEvent.click(draft);
    fireEvent.click(draft);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(
        "VIDEO_VIRAL",
        expect.objectContaining({ titulo: "Video de prueba", descripcion: "Descripción del video", red_social: "TIKTOK" }),
        expect.any(String),
        false,
        null,
    );
    expect(alertSpy).not.toHaveBeenCalled();
    resolve({ id: 1, estado: "BORRADOR" });
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("success", "Borrador guardado"));
});
it("Recuperación es una pantalla propia con DNI antes de Cliente, sin Video Viral ni pestañas", async () => {
    openRecovery();
    await screen.findByText("Registrar Recuperación");
    expect(screen.getByRole("heading", { name: "Recuperación" })).toBeVisible();
    expect(screen.getByText(/Aprueba: Administrador/)).toBeVisible();
    expect(screen.queryByText("Registrar Campaña")).toBeNull();
    expect(mocks.list).toHaveBeenCalledWith("RECUPERACION_CLIENTE", expect.any(String), "", "", 1, 20);
    expect(screen.queryByText("Registrar Video")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Videos$|Clientes Recuperados/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /^Publicación/ })).toBeNull();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.indexOf("DNI")).toBeLessThan(headers.indexOf("Cliente"));
    expect(headers).not.toContain("Métricas");
});
it("Recuperación muestra los días sin actividad, solo deja elegir la que cumple y exige la operación", async () => {
    const operacion = { dni: "12345678", cliente: "Cliente Demo", servicio: "EFECTIVIZACION", monto: 100, fecha_pago: "2026-11-20T15:00:00Z" };
    mocks.operations.mockResolvedValue({
        items: [
            { ...operacion, id: 1, codigo: "OP-1", dias_inactivo: 104, recuperable: true },
            { ...operacion, id: 2, codigo: "OP-2", dias_inactivo: 5, recuperable: false },
        ],
    });
    mocks.save.mockResolvedValue({ id: 1, estado: "PENDIENTE" });
    openRecovery();
    await screen.findByText("Registrar Recuperación");
    fireEvent.change(screen.getByRole("textbox", { name: /^Título/ }), { target: { value: "Cliente que volvió" } });
    fireEvent.change(screen.getAllByRole("textbox", { name: /^Descripción/ }).at(-1)!, { target: { value: "Volvió a operar" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alertSpy).toHaveBeenCalledWith("validation", "Elige la operación del cliente.");
    fireEvent.change(screen.getByRole("textbox", { name: /^DNI/ }), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Operaciones" }));
    expect(await screen.findByText("104")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Elegir operación OP-2" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Elegir operación OP-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
        expect(mocks.save).toHaveBeenCalledWith("RECUPERACION_CLIENTE", expect.objectContaining({ operacion_id: "1" }), expect.any(String), true, null),
    );
});
it("Video Viral es una pantalla propia con métricas manuales y sin DNI de recuperación", async () => {
    mocks.list.mockResolvedValue({
        ...panel,
        items: [{ id: 3, titulo: "Video demo", fecha: "2026-11-01", estado: "PENDIENTE", captura: { vistas: "10000", likes: "500", comentarios: "5" } }],
    });
    open();
    await screen.findByText("Registrar Video");
    expect(screen.getByRole("heading", { name: "Video Viral" })).toBeVisible();
    expect(mocks.list).toHaveBeenCalledWith("VIDEO_VIRAL", expect.any(String), "", "", 1, 20);
    expect(screen.getByText("10000 vistas · 500 reacciones · 5 comentarios")).toBeInTheDocument();
    expect(screen.queryByText("Registrar Campaña")).toBeNull();
    expect(screen.queryByRole("button", { name: /Campaña/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Red Social/ })).toBeInTheDocument();
    for (const name of ["Vistas", "Reacciones", "Comentarios"]) expect(screen.getByRole("spinbutton", { name: new RegExp("^" + name) })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /^DNI/ })).toBeNull();
    expect(screen.queryByText("Registrar Recuperación")).toBeNull();
});
it("estado único: filtro Pendiente/Aprobado/Rechazado, sin Liquidado ni Importe, y lo liquidado se lee Aprobado", async () => {
    mocks.list.mockResolvedValue({
        ...panel,
        items: [{ id: 4, titulo: "Video liquidado", fecha: "2026-11-01", estado: "LIQUIDADO", captura: {}, importe: 50, estado_calculo: "ELEGIBLE" }],
    });
    open();
    await screen.findByText("Video liquidado");
    expect(screen.getAllByText("Aprobado").length).toBeGreaterThan(0);
    expect(screen.queryByText("Liquidado")).toBeNull();
    expect(screen.getByText("S/ 50.00")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Monto" })).toBeInTheDocument();
    expect(screen.queryByText(/Importe/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Estado/ }));
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(labels).toEqual(["Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
});
it("administración solo revisa en Recuperación: sin formularios de captura ni de campaña", async () => {
    mocks.list.mockResolvedValue({
        ...panel,
        es_admin: true,
        items: [{ id: 5, titulo: "Cliente pendiente", fecha: "2026-11-01", estado: "PENDIENTE", captura: { dni: "12345678" }, puede_revisar: true }],
    });
    openRecovery();
    await screen.findByText("Cliente pendiente");
    expect(screen.queryByText("Registrar Recuperación")).toBeNull();
    expect(screen.queryByText("Registrar Campaña")).toBeNull();
    expect(screen.getByRole("button", { name: /Revisar registro/i })).toBeInTheDocument();
});
it("el punto de entrada elige la pantalla por ruta", async () => {
    render(
        <MemoryRouter>
            <MarketingCapturasPage initialRecovery />
        </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Recuperación" })).toBeVisible();
});
it("administración revisa con motivo y no recibe formularios de captura propia", async () => {
    mocks.list.mockResolvedValue({
        ...panel,
        es_admin: true,
        items: [
            {
                id: 2,
                titulo: "Video pendiente",
                descripcion: "Descripción",
                fecha: "2026-11-01",
                estado: "PENDIENTE",
                captura: {},
                usuario: "Marketing",
                puede_revisar: true,
            },
        ],
    });
    open();
    await screen.findByText("Video pendiente");
    expect(screen.queryByText("Registrar Video")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Revisar registro/i }));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /^Motivo/ }), { target: { value: "Métricas y evidencia comprobadas" } });
    mocks.review.mockResolvedValue({ id: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith(2, "APROBADO", "Métricas y evidencia comprobadas"));
});

const approvedCase = {
    id: 21,
    titulo: "Registro aprobado",
    descripcion: "Evidencia comprobada",
    fecha: "2026-11-01",
    estado: "APROBADO",
    captura: {},
    usuario: "Marketing",
    puede_revisar: true,
    puede_anular: true,
};

it("administración anula con motivo y decisión única mediante el mismo modal", async () => {
    mocks.list.mockResolvedValue({ ...panel, es_admin: true, items: [approvedCase] });
    open();
    await screen.findByText("Registro aprobado");
    expect(screen.queryByRole("button", { name: /Revisar registro/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Anular registro/i }));
    expect(screen.getByRole("heading", { name: "Anular Registro" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Decisión/ }));
    expect(await screen.findByRole("option", { name: "Anular" })).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByRole("option", { name: "Aprobar" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Rechazar" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Anular" }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Motivo/ }), { target: { value: "Registro duplicado comprobado" } });
    mocks.review.mockResolvedValue({ id: 21, estado: "ANULADO" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledExactlyOnceWith(21, "ANULADO", "Registro duplicado comprobado"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("success", "Registro anulado"));
});

it.each([
    { es_admin: false, es_revisor: true, estado: "APROBADO", puede_anular: true },
    { es_admin: true, es_revisor: true, estado: "APROBADO", puede_anular: false },
    { es_admin: true, es_revisor: true, estado: "PENDIENTE", puede_anular: true },
    { es_admin: true, es_revisor: true, estado: "LIQUIDADO", puede_anular: true },
    { es_admin: true, es_revisor: true, estado: "ANULADO", puede_anular: true },
    { es_admin: true, es_revisor: true, estado: "RECHAZADO", puede_anular: true },
])("restringe acciones por administración, estado y puede_anular: %j", async ({ es_admin, es_revisor, estado, puede_anular }) => {
    mocks.list.mockResolvedValue({ ...panel, es_admin, es_revisor, puede_registrar: false, items: [{ ...approvedCase, estado, puede_anular }] });
    open();
    await screen.findByText("Registro aprobado");
    expect(screen.queryByRole("button", { name: /Anular registro/i })).toBeNull();
    expect(Boolean(screen.queryByRole("button", { name: /Revisar registro/i }))).toBe(estado === "PENDIENTE");
    expect(mocks.review).not.toHaveBeenCalled();
});

it("no confirma anulación si el servidor rechaza un caso consolidado mientras se revisaba", async () => {
    mocks.list.mockResolvedValue({ ...panel, es_admin: true, items: [approvedCase] });
    mocks.review.mockRejectedValue(new Error("El registro ya está consolidado"));
    open();
    await screen.findByText("Registro aprobado");
    fireEvent.click(screen.getByRole("button", { name: /Anular registro/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /^Motivo/ }), { target: { value: "Registro duplicado comprobado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "El registro ya está consolidado"));
    expect(alertSpy).not.toHaveBeenCalledWith("success", expect.any(String));
    expect(screen.getByRole("heading", { name: "Anular Registro" })).toBeVisible();
});

it.each([true, false])("muestra de quién es cada registro solo a Administración (es_admin=%s)", async (es_admin) => {
    mocks.list.mockResolvedValue({
        ...panel,
        es_admin,
        items: [{ id: 3, titulo: "Video del equipo", fecha: "2026-11-02", estado: "PENDIENTE", captura: {}, usuario: "Persona Marketing" }],
    });
    open();
    await screen.findByText("Video del equipo");
    expect(screen.queryByRole("columnheader", { name: "Colaborador" }) !== null).toBe(es_admin);
});
