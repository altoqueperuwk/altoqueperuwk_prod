import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { EvidenciaEvento, LlamadaContexto } from "./evidencias.types";
import { LlamadaActions } from "./llamada-actions";
import { ReferidoRowActions } from "./referido-row-actions";
import type { Referido } from "./referidos.service";

const mocks = vi.hoisted(() => ({ advisor: true, manager: false, update: vi.fn(), annul: vi.fn() }));
vi.mock("./evidencias.service", () => ({
    evidenciasService: { updateCapture: mocks.update, annul: mocks.annul, resolve: vi.fn(), saveContactEvidence: vi.fn() },
}));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({ isAdministrator: false, isAdvisor: mocks.advisor, isStoreManager: mocks.manager }),
}));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: { get: vi.fn(), resolve: vi.fn() } }));

const context: LlamadaContexto = { idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false };
const call = (patch: Partial<EvidenciaEvento> = {}) =>
    ({
        id: 40,
        categoria: "LLAMADA",
        estado: "PENDIENTE",
        usuarioRegistraId: 7,
        idColaboradorBeneficiario: 12,
        fechaEvento: "2026-11-20T10:00:00-05:00",
        descripcion: null,
        datos: { cliente_documento: "12345678", cliente_nombre: "Ana Prueba" },
        evidencia: [],
        ...patch,
    }) as unknown as EvidenciaEvento;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.advisor = true;
    mocks.update.mockResolvedValue({});
    mocks.annul.mockResolvedValue({});
});
afterEach(cleanup);

describe("ATC edita y elimina sus propios registros", () => {
    it("ofrece editar y eliminar en su llamada pendiente", () => {
        render(<LlamadaActions iconOnly item={call()} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Editar llamada" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Eliminar llamada" })).toBeTruthy();
    });
    it("no los ofrece cuando ya fue aprobada, es ajena o el perfil no es ATC", () => {
        const { rerender } = render(<LlamadaActions iconOnly item={call({ estado: "APROBADO" })} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();
        rerender(<LlamadaActions iconOnly item={call({ usuarioRegistraId: 99 })} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();
        mocks.advisor = false;
        rerender(<LlamadaActions iconOnly item={call()} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();
    });
    it("el Jefe de Sede edita y elimina solo lo propio", () => {
        mocks.advisor = false;
        mocks.manager = true;
        const { rerender } = render(<LlamadaActions iconOnly item={call()} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Editar llamada" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Eliminar llamada" })).toBeTruthy();
        rerender(<LlamadaActions iconOnly item={call({ usuarioRegistraId: 99 })} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();
        mocks.manager = false;
        mocks.advisor = true;
    });
    it("el modal de edición guarda los cambios y avisa", async () => {
        const changed = vi.fn();
        render(<LlamadaActions iconOnly item={call()} contexto={context} onChanged={changed} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Editar llamada" }));
        fireEvent.change(await screen.findByLabelText(/Cliente/), { target: { value: "Ana Corregida" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(40, expect.objectContaining({ dni: "12345678", nombre: "Ana Corregida" })));
        await waitFor(() => expect(changed).toHaveBeenCalled());
    });
    it("eliminar exige el motivo y anula el registro", async () => {
        const changed = vi.fn();
        render(<LlamadaActions iconOnly item={call()} contexto={context} onChanged={changed} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Eliminar llamada" }));
        fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
        expect(await screen.findByText(/Indica el motivo/)).toBeTruthy();
        expect(mocks.annul).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Registro duplicado" } });
        fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
        await waitFor(() => expect(mocks.annul).toHaveBeenCalledWith(40, "Registro duplicado"));
        await waitFor(() => expect(changed).toHaveBeenCalled());
    });
});

describe("Referidos: acciones propias", () => {
    const referido = (patch: Partial<Referido> = {}) =>
        ({
            id: 5,
            id_evento: 50,
            estado_referido: "PENDIENTE",
            estado_evento: "PENDIENTE",
            id_usuario_registra: 7,
            operaciones: [],
            ...patch,
        }) as unknown as Referido;
    it("muestra editar y eliminar solo en un referido propio pendiente", () => {
        const { rerender } = render(<ReferidoRowActions item={referido()} context={context} onOpen={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Editar referido" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Eliminar referido" })).toBeTruthy();
        rerender(
            <ReferidoRowActions
                item={referido({ estado_referido: "VALIDADO", estado_evento: "APROBADO" })}
                context={context}
                onOpen={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();
        rerender(<ReferidoRowActions item={referido({ id_usuario_registra: 99 })} context={context} onOpen={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();
    });
});
