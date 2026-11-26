import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { IncidenciaDetailModal } from "./incidencia-detail-modal";
import type { IncidenciaEvento } from "./incidencias.types";

const mocks = vi.hoisted(() => ({
    reviewContext: vi.fn(),
    reviewDecision: vi.fn(),
    resolve: vi.fn(),
    observe: vi.fn(),
    discharge: vi.fn(),
    send: vi.fn(),
    annul: vi.fn(),
    updateDraft: vi.fn(),
    profile: { isAdministrator: true, isAdvisor: false, isFacturacion: false, isStoreManager: false, isResolving: false, userId: 24 },
}));
vi.mock("./incidencias.service", () => ({ incidenciasService: mocks }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));

vi.mock("../shared/compensacion-surface", () => ({
    CompensacionSurface: ({ children, busy }: { children: ReactNode; busy?: boolean }) => (
        <div role="dialog" aria-busy={busy}>
            {children}
        </div>
    ),
}));
vi.mock("@/components/base/buttons/button", () => ({
    Button: ({
        children,
        isDisabled,
        isLoading,
        onClick,
        "aria-label": label,
    }: {
        children?: ReactNode;
        isDisabled?: boolean;
        isLoading?: boolean;
        onClick: () => void;
        "aria-label"?: string;
    }) => (
        <button aria-label={label} disabled={isDisabled || isLoading} onClick={onClick}>
            {children}
        </button>
    ),
}));
vi.mock("@/components/base/textarea/textarea", () => ({
    TextArea: ({ label, value, onChange, isDisabled }: { label: string; value: string; onChange: (value: string) => void; isDisabled?: boolean }) => (
        <label>
            {label}
            <textarea aria-label={label} value={value} disabled={isDisabled} onChange={(event) => onChange(event.target.value)} />
        </label>
    ),
}));

const record = (id = 5): IncidenciaEvento => ({
    id,
    usuarioRegistraId: 7,
    reportanteId: 10,
    responsableId: 20,
    idTipoEvento: 1,
    idPenalidadTipo: 2,
    tipoEventoNombre: "Incidencia",
    categoria: "PENALIDAD",
    penalidadNombre: `Incidencia ${id}`,
    montoReferencia: 999,
    montoBonoReportante: 10,
    requiereRespuesta: true,
    reportanteNombre: "Reportante",
    reportanteDocumento: "11111111",
    responsableNombre: "Responsable",
    responsableDocumento: "22222222",
    sucursalOrigenNombre: "Centro",
    sucursalResponsableNombre: "Centro",
    fechaEvento: "2026-11-04T16:30:00Z",
    titulo: "Reporte",
    motivo: "Motivo del reporte",
    evidencia: [],
    estado: "PENDIENTE",
    importeAprobado: null,
    usuarioRegistraNombre: "Autora",
    revisiones: [],
});
const context = (id = 5) => ({
    id,
    version: "version-1",
    puede_aprobar: true,
    puede_revisar: true,
    puede_observar: true,
    bloqueado: false,
    motivo: "",
    descuento_estimado: null as number | null,
    efecto: "Pierde bono por cuadre",
    requiere_descargo: true,
    descargo_presentado: false,
    fuentes: [{ tipo: "BONO", codigo: "CUADRE", estado: "PENDIENTE", monto: null as number | null }],
    estado: "PENDIENTE",
});
const props = { onClose: vi.fn(), onChanged: vi.fn(), actorCollaboratorId: 30 };
const reason = "Sustento revisado y verificado";
const ready = async () => {
    await waitFor(() => expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled());
};
const writeReason = (value = reason) => fireEvent.change(screen.getByRole("textbox", { name: "Motivo de la Decisión" }), { target: { value } });
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.profile, { isAdministrator: true, isAdvisor: false, isFacturacion: false, isStoreManager: false, isResolving: false, userId: 24 });
    mocks.reviewContext.mockResolvedValue(context());
    mocks.reviewDecision.mockResolvedValue({ id: 5 });
    mocks.resolve.mockResolvedValue({ id: 5 });
    mocks.observe.mockResolvedValue({ id: 5 });
    mocks.discharge.mockResolvedValue({ id: 5 });
});
afterEach(cleanup);

describe("Revisión administrativa de incidencias", () => {
    it("consulta una vez al abrir y muestra efecto, fuente y descargo del servidor sin inventar descuento", async () => {
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await ready();
        expect(mocks.reviewContext).toHaveBeenCalledExactlyOnceWith(5);
        const panel = screen.getByRole("heading", { name: "Revisión Administrativa" }).closest("section")!;
        expect(within(panel).getByText("Pierde bono por cuadre")).toBeTruthy();
        expect(within(panel).getByText("Requerido, pendiente")).toBeTruthy();
        expect(within(panel).getByText("BONO · CUADRE")).toBeTruthy();
        expect(within(panel).queryByText(/0\.00|999/)).toBeNull();
        expect(screen.queryByText("Descuento previsto")).toBeNull();
        expect(screen.getByText("04/11/2026")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Presentar descargo" })).toBeNull();
    });
    it("muestra descuento económico y cero real únicamente si el servidor lo entrega", async () => {
        mocks.reviewContext.mockResolvedValue({
            ...context(),
            efecto: "Descuento por pérdida",
            descuento_estimado: 15,
            fuentes: [{ tipo: "PERDIDA", codigo: "CAJA", estado: "VERIFICADO", monto: 0 }],
            descargo_presentado: true,
        });
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await ready();
        expect(screen.getByText("Descuento por pérdida")).toBeTruthy();
        expect(screen.getByText(/15\.00/)).toBeTruthy();
        expect(screen.getByText(/0\.00/)).toBeTruthy();
        expect(screen.getByText("Presentado")).toBeTruthy();
    });
    it.each([
        ["APROBADO", "Aprobar"],
        ["RECHAZADO", "Rechazar"],
        ["OBSERVADO", "Observar"],
    ] as const)("%s usa solo reviewDecision, versión y motivo de diez caracteres", async (decision, label) => {
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await ready();
        writeReason("   corto   ");
        fireEvent.click(screen.getByRole("button", { name: label }));
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("al menos 10 caracteres");
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
        writeReason(`  ${reason}  `);
        fireEvent.click(screen.getByRole("button", { name: label }));
        await waitFor(() => expect(mocks.reviewDecision).toHaveBeenCalledExactlyOnceWith(5, "version-1", decision, reason));
        expect(mocks.resolve).not.toHaveBeenCalled();
        expect(mocks.observe).not.toHaveBeenCalled();
        expect(props.onChanged).toHaveBeenCalledOnce();
    });
    it("permanece cerrado a decisiones durante carga y permite recuperar error de contexto", async () => {
        let reject!: (error: Error) => void;
        mocks.reviewContext.mockImplementationOnce(
            () =>
                new Promise((_resolve, no) => {
                    reject = no;
                }),
        );
        render(<IncidenciaDetailModal {...props} item={record()} />);
        expect(screen.getByRole("status")).toHaveTextContent("Cargando revisión");
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        await act(async () => {
            reject(new Error("Consulta sin acceso"));
        });
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Consulta sin acceso");
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Reintentar Revisión" }));
        await ready();
        expect(mocks.reviewContext).toHaveBeenCalledTimes(2);
    });
    it.each(["puede_aprobar", "puede_revisar", "puede_observar"] as const)("respeta capacidad %s denegada", async (capability) => {
        mocks.reviewContext.mockResolvedValue({ ...context(), [capability]: false });
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await screen.findByText("Pierde bono por cuadre");
        const label = { puede_aprobar: "Aprobar", puede_revisar: "Rechazar", puede_observar: "Observar" }[capability];
        expect(screen.getByRole("button", { name: label })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: label }));
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
    });
    it("muestra bloqueo del servidor y no concede decisiones por ser Admin", async () => {
        mocks.reviewContext.mockResolvedValue({ ...context(), bloqueado: true, motivo: "Período liquidado" });
        render(<IncidenciaDetailModal {...props} item={record()} />);
        expect(await screen.findByText("Período liquidado")).toHaveTextContent("Período liquidado");
        for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.getByRole("button", { name })).toBeDisabled();
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
    });
    it.each(["autor", "reportante", "responsable"])("impide decisión propia como %s aunque el servidor habilite capacidades", async (participation) => {
        const item = {
            ...record(),
            ...(participation === "autor" ? { usuarioRegistraId: 24 } : participation === "reportante" ? { reportanteId: 30 } : { responsableId: 30 }),
        };
        render(<IncidenciaDetailModal {...props} item={item} />);
        expect(await screen.findByText(/No puedes decidir/)).toHaveTextContent("No puedes decidir");
        for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.getByRole("button", { name })).toBeDisabled();
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
    });
    it("permite al administrador decidir su propio registro solo cuando el servidor confirma la excepción de Queja Tardía", async () => {
        mocks.reviewContext.mockResolvedValue({ ...context(), excepcion_independencia: true });
        render(<IncidenciaDetailModal {...props} item={{ ...record(), usuarioRegistraId: 24 }} />);
        await ready();
        expect(screen.queryByText("Registro propio")).toBeNull();
        writeReason();
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        await waitFor(() => expect(mocks.reviewDecision).toHaveBeenCalledExactlyOnceWith(5, "version-1", "APROBADO", reason));
    });
    it("la excepción de independencia no exime al responsable ni al reportante", async () => {
        mocks.reviewContext.mockResolvedValue({ ...context(), excepcion_independencia: true });
        for (const override of [{ responsableId: 30 }, { reportanteId: 30 }]) {
            const view = render(<IncidenciaDetailModal {...props} item={{ ...record(), usuarioRegistraId: 24, ...override }} />);
            expect(await screen.findByText(/No puedes decidir/)).toHaveTextContent("No puedes decidir");
            for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.getByRole("button", { name })).toBeDisabled();
            view.unmount();
        }
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
    });
    it("solo el responsable presenta descargo, incluido Admin si es el responsable", async () => {
        render(<IncidenciaDetailModal {...props} actorCollaboratorId={20} item={record()} />);
        const discharge = await screen.findByRole("button", { name: "Presentar descargo" });
        fireEvent.change(screen.getByRole("textbox", { name: "Comentario" }), { target: { value: "Mi descargo responsable" } });
        fireEvent.click(discharge);
        await waitFor(() => expect(mocks.discharge).toHaveBeenCalledExactlyOnceWith(5, "Mi descargo responsable", ""));
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
    });
    it("bloquea doble clic y el cierre mientras guarda", async () => {
        let finish!: (value: { id: number }) => void;
        mocks.reviewDecision.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    finish = done;
                }),
        );
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await ready();
        writeReason();
        const approve = screen.getByRole("button", { name: "Aprobar" });
        fireEvent.click(approve);
        fireEvent.click(approve);
        expect(mocks.reviewDecision).toHaveBeenCalledOnce();
        expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
        for (const close of screen.getAllByRole("button", { name: "Cerrar" })) expect(close).toBeDisabled();
        await act(async () => {
            finish({ id: 5 });
        });
        expect(props.onChanged).toHaveBeenCalledOnce();
    });
    it("un conflicto invalida las capacidades, conserva el motivo y reintenta con versión nueva", async () => {
        mocks.reviewDecision.mockRejectedValueOnce({ message: "Versión cambió" });
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await ready();
        writeReason();
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("Versión cambió");
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
        expect(props.onChanged).not.toHaveBeenCalled();
        mocks.reviewContext.mockResolvedValue({ ...context(), version: "version-2" });
        fireEvent.click(screen.getByRole("button", { name: "Reintentar Revisión" }));
        await ready();
        expect(screen.getByRole("textbox", { name: "Motivo de la Decisión" })).toHaveValue(reason);
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        await waitFor(() => expect(mocks.reviewDecision).toHaveBeenLastCalledWith(5, "version-2", "RECHAZADO", reason));
    });
    it("ignora contexto y decisión tardíos al cambiar de incidencia", async () => {
        let oldContext!: (value: ReturnType<typeof context>) => void;
        mocks.reviewContext.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    oldContext = done;
                }),
        );
        const view = render(<IncidenciaDetailModal {...props} item={record()} />);
        mocks.reviewContext.mockResolvedValue(context(6));
        view.rerender(<IncidenciaDetailModal {...props} item={record(6)} />);
        await ready();
        await act(async () => {
            oldContext({ ...context(), efecto: "Efecto obsoleto" });
        });
        expect(screen.queryByText("Efecto obsoleto")).toBeNull();
        let oldDecision!: (value: { id: number }) => void;
        mocks.reviewDecision.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    oldDecision = done;
                }),
        );
        writeReason();
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        mocks.reviewContext.mockResolvedValue(context(7));
        view.rerender(<IncidenciaDetailModal {...props} item={record(7)} />);
        await ready();
        await act(async () => {
            oldDecision({ id: 6 });
        });
        expect(props.onChanged).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
        expect(screen.getByRole("textbox", { name: "Motivo de la Decisión" })).toHaveValue("");
    });
    it("rechaza contexto de otro id o incompleto", async () => {
        mocks.reviewContext.mockResolvedValue(context(99));
        render(<IncidenciaDetailModal {...props} item={record()} />);
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("contexto completo");
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    });
    it("no permite decisiones si no se verificó la identidad del administrador", async () => {
        mocks.profile.userId = 0;
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await screen.findByText("Pierde bono por cuadre");
        expect(screen.getByRole("textbox", { name: "Motivo de la Decisión" })).toBeDisabled();
        for (const name of ["Aprobar", "Rechazar", "Observar"]) expect(screen.getByRole("button", { name })).toBeDisabled();
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
    });
    it("no anuncia éxito ni conserva capacidades si falta confirmar la incidencia decidida", async () => {
        mocks.reviewDecision.mockResolvedValueOnce({ id: 99 });
        render(<IncidenciaDetailModal {...props} item={record()} />);
        await ready();
        writeReason();
        fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
        expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("no confirmó la decisión");
        expect(alertSpy).not.toHaveBeenCalled();
        expect(props.onChanged).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    });
    it("los otros revisores conservan resolve/observe y no consultan la API administrativa", async () => {
        mocks.profile.isAdministrator = false;
        render(<IncidenciaDetailModal {...props} item={record()} />);
        fireEvent.change(screen.getByRole("textbox", { name: "Comentario" }), { target: { value: "Revisión habitual" } });
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        await waitFor(() => expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith(5, "RECHAZADO", "Revisión habitual"));
        expect(mocks.reviewContext).not.toHaveBeenCalled();
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Presentar descargo" })).toBeNull();
    });
    it("no consulta revisión con modal cerrado o identidad en resolución", () => {
        const view = render(<IncidenciaDetailModal {...props} item={null} />);
        expect(mocks.reviewContext).not.toHaveBeenCalled();
        mocks.profile.isResolving = true;
        view.rerender(<IncidenciaDetailModal {...props} item={record()} />);
        expect(mocks.reviewContext).not.toHaveBeenCalled();
        expect(mocks.reviewDecision).not.toHaveBeenCalled();
    });
});
