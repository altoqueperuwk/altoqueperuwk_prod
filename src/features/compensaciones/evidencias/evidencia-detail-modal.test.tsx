import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ getTiktokEvidenceUrl: vi.fn() }));
vi.mock("./evidencias.service", () => ({ evidenciasService: mocks }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isAdvisor: true, userId: 10 }) }));

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

it("muestra la respuesta pública sin ofrecer aprobación a ATC", async () => {
    const item = {
        id: 8,
        categoria: "CALIFICACION",
        tipoCodigo: "CALIFICACION_PRESENCIAL",
        tipoNombre: "Atención Presencial Calificada",
        fechaEvento: "2026-10-22T20:00:00Z",
        estado: "PENDIENTE",
        usuarioRegistraId: 10,
        datos: { estrellas: 4, cliente_documento: "12345678" },
        evidencia: [{ tipo: "FORMULARIO_PUBLICO" }],
        referencias: [],
        revisiones: [],
        importeAprobado: null,
        tarifaRegistro: null,
    } as unknown as EvidenciaEvento;
    render(<EvidenciaDetailModal item={item} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Detalle de Atención Calificada" })).toBeTruthy();
    expect(screen.getByText("12345678")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    expect(screen.queryByText(/Sustentos/)).toBeNull();
});

it("muestra la evidencia TikTok en un pop-up y conserva abierto el detalle", async () => {
    mocks.getTiktokEvidenceUrl.mockResolvedValue("https://storage.example/signed-image.png");
    const item = {
        id: 7,
        tipoCodigo: "TIKTOK_LIVE",
        tipoNombre: "Registro y operación desde TikTok Live",
        fechaEvento: "2026-10-18T20:32:00Z",
        estado: "PENDIENTE",
        beneficiarioNombre: "Asesora",
        beneficiarioDocumento: "12345678",
        sucursalOrigenNombre: "Sede",
        usuarioRegistraNombre: "Asesora",
        usuarioRegistraId: 10,
        importeAprobado: null,
        tarifaRegistro: null,
        categoria: "OTRO",
        datos: {},
        titulo: null,
        descripcion: null,
        evidencia: [{ tipo: "IMAGEN_TIKTOK", bucket: "compensaciones-tiktok-live", path: "user/image.png", nombre: "1.png" }],
        revisiones: [],
        referencias: [],
    } as unknown as EvidenciaEvento;

    render(<EvidenciaDetailModal item={item} onClose={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver imagen 1.png" }));

    expect(await screen.findByRole("img", { name: "1.png" })).toHaveAttribute("src", "https://storage.example/signed-image.png");
    expect(screen.getByRole("button", { name: "Cerrar imagen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar imagen" }));
    await waitFor(() => expect(screen.queryByRole("img", { name: "1.png" })).toBeNull());
    expect(screen.getByText("Sustentos (1)")).toBeTruthy();
});
