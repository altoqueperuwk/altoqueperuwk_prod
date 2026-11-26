import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ approve: vi.fn(), resolve: vi.fn() }));
const profile = vi.hoisted(() => ({ isAdvisor: false, userId: 24, isResolving: false }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => profile }));

vi.mock("./evidencias.service", () => ({ evidenciasService: { approveLeadership: mocks.approve, resolve: mocks.resolve } }));
vi.mock("../shared/compensacion-surface", () => ({ CompensacionSurface: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const item = {
    id: 7,
    tipoCodigo: "META_SEDE_SAFETYPAY",
    tipoNombre: "Meta de jefatura",
    estado: "PENDIENTE",
    fechaEvento: "2026-10-01T09:00:00-05:00",
    importeAprobado: null,
    evidencia: [],
    revisiones: [],
    referencias: [],
    tarifaRegistro: { tipoCalculo: "FIJO", valor: 200 },
} as unknown as EvidenciaEvento;
beforeEach(() => {
    profile.isAdvisor = false;
    vi.clearAllMocks();
    mocks.approve.mockResolvedValue({});
});
afterEach(cleanup);
describe("Revisión simple de jefatura", () => {
    it("ATC no puede revisar desde el modal genérico aunque el padre omita readOnly", () => {
        profile.isAdvisor = true;
        render(
            <EvidenciaDetailModal
                item={{ ...item, datos: {}, tipoCodigo: "REFERIDO", categoria: "REFERIDO", usuarioRegistraId: 24 }}
                onClose={vi.fn()}
                onChanged={vi.fn()}
            />,
        );
        for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.queryByRole("button", { name })).toBeNull();
        expect(screen.queryByLabelText("Monto base (S/)")).toBeNull();
        expect(screen.queryByLabelText("Comentario de revisión")).toBeNull();
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
    it.each([
        null,
        { idUsuario: 30, idColaborador: 14, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false },
        { idUsuario: 30, idColaborador: 14, puedeRegistrar: true, puedeAprobar: true, puedeRevisar: true },
    ])("el detalle de llamadas no expone revisión sin contexto, sin permiso o para su autor", (contexto) => {
        render(
            <EvidenciaDetailModal
                item={{ ...item, datos: {}, tipoCodigo: "LLAMADA_CONTACTO", categoria: "LLAMADA", usuarioRegistraId: 30 }}
                llamadaContexto={contexto}
                onClose={vi.fn()}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Observar" })).toBeNull();
    });
    it("no aprueba sin confirmar chats y comentario", () => {
        render(<EvidenciaDetailModal item={item} onClose={vi.fn()} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        expect(mocks.approve).not.toHaveBeenCalled();
        expect(mocks.resolve).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringContaining("Confirma"));
    });
    it("usa la RPC de jefatura y no multiplica el bono", async () => {
        render(<EvidenciaDetailModal item={item} onClose={vi.fn()} onChanged={vi.fn()} />);
        expect(screen.queryByRole("checkbox", { name: "Cuotas cumplidas" })).toBeNull();
        expect(screen.queryByRole("checkbox", { name: "Calidad verificada" })).toBeNull();
        fireEvent.click(screen.getByRole("checkbox", { name: "Sin chats descuidados" }));
        const comment = screen.getByRole("textbox", { name: /Comentario de revisión/ });
        fireEvent.change(comment, { target: { value: "Revisado con sustento" } });
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith(7, "Revisado con sustento", { chats: true }));
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
});
