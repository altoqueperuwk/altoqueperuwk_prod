import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ get: vi.fn(), resolve: vi.fn(), signedCard: vi.fn(), signedTiktok: vi.fn(), rpc: vi.fn() }));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: mocks }));
vi.mock("./tarjetas-evidence.service", () => ({ tarjetasEvidenceService: { getCardEvidenceUrl: mocks.signedCard } }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { getTiktokEvidenceUrl: mocks.signedTiktok } }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({ isAdministrator: true, isAdvisor: false, isResolving: false, userId: 20 }),
}));

const event = (patch: Partial<EvidenciaEvento> = {}) =>
    ({
        id: 8,
        categoria: "LLAMADA",
        tipoCodigo: "LLAMADA_CONTACTO",
        tipoNombre: "Llamada",
        estado: "PENDIENTE",
        fechaEvento: "2026-11-06T15:00:00Z",
        datos: { cliente_documento: "12345678", cliente_nombre: "Cliente Histórico", cliente_celular: "987654321" },
        beneficiarioNombre: "Asesora",
        beneficiarioDocumento: "99999999",
        sucursalOrigenNombre: "ATK1",
        usuarioRegistraNombre: "Usuario",
        evidencia: [],
        referencias: [],
        revisiones: [],
        usuarioRegistraId: 24,
        importeAprobado: null,
        tarifaRegistro: null,
        ...patch,
    }) as EvidenciaEvento;
const props = () => ({ onClose: vi.fn(), onChanged: vi.fn() });
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it.each(["LLAMADA", "CALIFICACION", "TARJETA_TERCERO"] as const)("%s es consulta sin revisión administrativa incluso para admin", (categoria) => {
    render(<EvidenciaDetailModal item={event({ categoria })} {...props()} />);
    expect(screen.getByText("Cliente Histórico")).toBeVisible();
    expect(screen.getByText("987654321")).toBeVisible();
    for (const name of ["Aprobar", "Rechazar", "Observar", "Enviar a revisión"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Comentario de revisión/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Revisión Administrativa" })).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
});

it("conserva notas completas, vínculos históricos y el historial plegado", () => {
    render(
        <EvidenciaDetailModal
            item={event({
                descripcion: "Nota antigua\nSegunda línea",
                evidencia: [{ url: "https://example.com/historico" }, { tipo: "REGISTRO_LLAMADA" }],
                revisiones: [
                    {
                        id: 1,
                        numeroPaso: 1,
                        etapa: "REVISION",
                        decision: "RECHAZADO",
                        comentario: "Contacto no comprobado",
                        usuarioRevisorNombre: "Revisora",
                        fechaRegistro: "2026-11-06T15:30:00Z",
                    },
                ],
            })}
            {...props()}
        />,
    );
    expect(screen.getByText(/Nota antigua/)).toHaveTextContent("Segunda línea");
    expect(screen.getByRole("link", { name: "Evidencia 1" })).toHaveAttribute("href", "https://example.com/historico");
    expect(screen.queryByText("Registro de llamada")).toBeNull();
    expect(screen.getByText("Historial de Revisión (1)").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Historial de Revisión (1)"));
    expect(screen.getByText("Contacto no comprobado")).toBeVisible();
});

it("consulta propia omite autor repetido, tarifa y marcadores sin archivo", () => {
    render(
        <EvidenciaDetailModal
            item={event({
                usuarioRegistraId: 20,
                usuarioRegistraNombre: "Propio",
                beneficiarioNombre: "Propio",
                tarifaRegistro: { tipoCalculo: "FIJO", valor: 1 },
                evidencia: [{ tipo: "REGISTRO_LLAMADA" }],
            })}
            {...props()}
        />,
    );
    for (const label of ["Propio", "Colaborador", "Registrado por", "Tarifa al Registro", "Datos del Registro", "Registro de llamada"])
        expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText(/Sustentos/)).toBeNull();
    expect(screen.getByText("Comisión")).toBeVisible();
});

it("firma los adjuntos privados y permite reintentar sin perder los enlaces antiguos", async () => {
    mocks.signedCard.mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce("https://example.com/signed-card");
    mocks.signedTiktok.mockResolvedValue("https://example.com/signed-legacy");
    render(
        <EvidenciaDetailModal
            item={event({
                evidencia: [
                    { bucket: "compensaciones-tarjetas-erroneas", path: "user/card.png", nombre: "Detección.png" },
                    { bucket: "compensaciones-tiktok-live", path: "user/old.png", nombre: "Histórica.png" },
                    { url: "https://example.com/old" },
                ],
            })}
            {...props()}
        />,
    );
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No se pudo abrir el adjunto");
    expect(await screen.findByRole("link", { name: "Histórica.png" })).toHaveAttribute("href", "https://example.com/signed-legacy");
    expect(screen.getByRole("link", { name: "Evidencia 3" })).toHaveAttribute("href", "https://example.com/old");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("link", { name: "Detección.png" })).toHaveAttribute("href", "https://example.com/signed-card");
    expect(mocks.signedCard).toHaveBeenLastCalledWith("user/card.png");
});

it("descarta la firma tardía al cambiar de registro", async () => {
    let finish!: (url: string) => void;
    mocks.signedCard.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const callbacks = props();
    const view = render(
        <EvidenciaDetailModal
            item={event({ evidencia: [{ bucket: "compensaciones-tarjetas-erroneas", path: "user/old.png", nombre: "Anterior.png" }] })}
            {...callbacks}
        />,
    );
    view.rerender(<EvidenciaDetailModal item={event({ id: 9, evidencia: [{ url: "https://example.com/new", nombre: "Actual.png" }] })} {...callbacks} />);
    await act(async () => finish("https://example.com/stale"));
    expect(screen.queryByRole("link", { name: "Anterior.png" })).toBeNull();
    expect(screen.getByRole("link", { name: "Actual.png" })).toHaveAttribute("href", "https://example.com/new");
});

it("mantiene funcional el vínculo de operación y Pancake para tarjetas", async () => {
    mocks.rpc
        .mockResolvedValueOnce({
            data: { items: [{ id: 81, codigo: "OP-81", servicio: "Efectivización", cliente: "Cliente Histórico", dni: "12345678" }] },
            error: null,
        })
        .mockResolvedValueOnce({ data: {}, error: null });
    const callbacks = props();
    render(<EvidenciaDetailModal item={event({ categoria: "TARJETA_TERCERO" })} {...callbacks} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Enlace de la conversación de Pancake/ }), { target: { value: "https://example.com/pancake" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    fireEvent.click(await screen.findByRole("button", { name: "Vincular" }));
    await waitFor(() => expect(callbacks.onChanged).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenLastCalledWith("f_post_compensacion_evento_operacion_vincular", {
        p_id_evento: 8,
        p_id_operacion: 81,
        p_pancake: "https://example.com/pancake",
    });
});

it("muestra referencias de calificación sin habilitar su edición y permite cerrar", () => {
    const callbacks = props();
    render(
        <EvidenciaDetailModal
            item={event({
                categoria: "CALIFICACION",
                referencias: [{ id: 1, tipoReferencia: "OPERACION", idOperacion: 81, idCliente: null, identificadorExterno: null }],
            })}
            {...callbacks}
        />,
    );
    expect(screen.getByText("Operación: 81")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Buscar operación pagada" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(callbacks.onClose).toHaveBeenCalledOnce();
});
