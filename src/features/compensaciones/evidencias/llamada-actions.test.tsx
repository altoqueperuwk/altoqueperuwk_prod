import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { EvidenciaEvento, LlamadaContexto } from "./evidencias.types";
import { LlamadaActions } from "./llamada-actions";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), save: vi.fn(), admin: false, getRevision: vi.fn(), adminResolve: vi.fn() }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { resolve: mocks.resolve } }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isAdministrator: mocks.admin }) }));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: { get: mocks.getRevision, resolve: mocks.adminResolve } }));

const context: LlamadaContexto = { idUsuario: 7, idColaborador: 12, puedeRegistrar: true, puedeAprobar: true, puedeRevisar: true };
const event = (beneficiary: number | null | undefined, categoria: EvidenciaEvento["categoria"] = "CALIFICACION"): EvidenciaEvento =>
    ({
        id: 30,
        idColaboradorBeneficiario: beneficiary,
        usuarioRegistraId: null,
        categoria,
        estado: "PENDIENTE",
        datos: { autor_externo: true },
        tarifaRegistro: { tipoCalculo: "POR_UNIDAD", valor: 2 },
    }) as unknown as EvidenciaEvento;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin = false;
    mocks.resolve.mockResolvedValue({});
});
afterEach(cleanup);

describe("Acciones: autor y beneficiario del ingreso", () => {
    it("ATC consulta su llamada sin edición, anulación ni revisión administrativa", () => {
        render(
            <LlamadaActions
                iconOnly
                item={{ ...event(12, "LLAMADA"), usuarioRegistraId: 7 }}
                contexto={{ ...context, puedeAprobar: false, puedeRevisar: false }}
                onChanged={vi.fn()}
                onDetail={vi.fn()}
            />,
        );
        expect(screen.getAllByRole("button")).toHaveLength(1);
        for (const action of [/^Editar/i, /^Anular/i, /^Aprobar$/i, /^Rechazar$/i]) expect(screen.queryByRole("button", { name: action })).toBeNull();
        expect(mocks.resolve).not.toHaveBeenCalled();
        expect(mocks.adminResolve).not.toHaveBeenCalled();
    });
    it("un responsable implicado tampoco puede aprobar ni rechazar aunque no sea beneficiario", () => {
        render(<LlamadaActions iconOnly item={{ ...event(18), idColaboradorResponsable: 12 }} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        expect(screen.getByRole("button", { name: /Registro propio: solo consulta/ })).toBeTruthy();
    });
    it.each(["CALIFICACION", "LLAMADA", "TARJETA_TERCERO"] as const)("%s propia de autor externo solo permite detalle", (category) => {
        const detail = vi.fn();
        render(<LlamadaActions iconOnly item={event(12, category)} contexto={context} onChanged={vi.fn()} onDetail={detail} />);
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Registro propio: solo consulta/ }));
        expect(detail).toHaveBeenCalledOnce();
        expect(mocks.resolve).not.toHaveBeenCalled();
    });

    it("conserva la prohibición por autor aunque el beneficiario sea otro", () => {
        render(<LlamadaActions item={{ ...event(18), usuarioRegistraId: 7 }} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        expect(screen.getByRole("button", { name: "Ver detalle" })).toBeTruthy();
    });

    it.each([null, undefined])("sin ID de beneficiario (%s) no habilita revisión de calificaciones", (beneficiary) => {
        render(<LlamadaActions iconOnly item={event(beneficiary)} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.getAllByRole("button")).toHaveLength(1);
        expect(screen.getByRole("button", { name: "Ver detalle" })).toBeTruthy();
    });

    it("un contexto no disponible nunca habilita revisión", () => {
        render(<LlamadaActions iconOnly item={event(18)} contexto={null} onChanged={vi.fn()} onDetail={vi.fn()} />);
        expect(screen.getAllByRole("button")).toHaveLength(1);
        expect(screen.getByRole("button", { name: "Ver detalle" })).toBeTruthy();
    });

    it("permite aprobar al equipo sin cambiar cantidades ni tarifas", async () => {
        const changed = vi.fn();
        render(<LlamadaActions item={event(18)} contexto={context} onChanged={changed} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
        expect(mocks.resolve).toHaveBeenCalledWith(30, "APROBADO", "", null, 1);
    });

    it("rechaza directamente sin pedir un motivo ni abrir un diálogo", async () => {
        render(<LlamadaActions item={event(18)} contexto={context} onChanged={vi.fn()} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledWith(30, "RECHAZADO", "", null, null));
    });

    it("retira las decisiones cuando el evento cambia a beneficiario propio", () => {
        const props = { contexto: context, onChanged: vi.fn(), onDetail: vi.fn() };
        const { rerender } = render(<LlamadaActions item={event(18)} {...props} />);
        rerender(<LlamadaActions item={event(12)} {...props} />);
        expect(screen.queryByRole("button", { name: "Confirmar rechazo" })).toBeNull();
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
});

it("un revisor puede leer prueba y no modificar la del autor", () => {
    render(
        <LlamadaActions
            iconOnly
            item={{ ...event(18, "LLAMADA"), usuarioRegistraId: 9, evidencia: [{ tipo: "SUSTENTO_ATC", url: "https://example.test/contact" }] }}
            contexto={context}
            onChanged={vi.fn()}
            onDetail={vi.fn()}
        />,
    );
    expect(screen.getByRole("link", { name: "Ver Evidencia" })).toHaveAttribute("href", "https://example.test/contact");
    expect(screen.queryByRole("button", { name: "Completar evidencia" })).toBeNull();
});

describe("Revisión administrativa directa", () => {
    it("usa versión vigente y no abre un modal", async () => {
        mocks.admin = true;
        mocks.getRevision.mockResolvedValue({ version: "v1", puede_aprobar: true, puede_revisar: true });
        mocks.adminResolve.mockResolvedValue({ id: 30 });
        const changed = vi.fn();
        render(<LlamadaActions iconOnly item={event(18)} contexto={context} onChanged={changed} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
        expect(mocks.getRevision).toHaveBeenCalledOnce();
        expect(mocks.adminResolve).toHaveBeenCalledWith({ id: 30, version: "v1", action: "APROBADO", reason: "", quantity: 1 });
        expect(mocks.resolve).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("no resuelve si el servidor ya no permite la acción", async () => {
        mocks.admin = true;
        mocks.getRevision.mockResolvedValue({ version: "v2", puede_aprobar: false, puede_revisar: false, motivo: "Registro resuelto" });
        const changed = vi.fn();
        render(<LlamadaActions iconOnly item={event(18)} contexto={context} onChanged={changed} onDetail={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Registro resuelto"));
        expect(mocks.adminResolve).not.toHaveBeenCalled();
        expect(changed).not.toHaveBeenCalled();
    });
});

it("una tarjeta con archivo privado no pide completar evidencia nuevamente", () => {
    render(
        <LlamadaActions
            iconOnly
            item={{
                ...event(12, "TARJETA_TERCERO"),
                usuarioRegistraId: 7,
                evidencia: [{ tipo: "IMAGEN_TARJETA", bucket: "compensaciones-tarjetas-erroneas", path: "actor/captura.png" }],
            }}
            contexto={context}
            onChanged={vi.fn()}
            onDetail={vi.fn()}
        />,
    );
    expect(screen.queryByRole("button", { name: "Completar evidencia" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
});
