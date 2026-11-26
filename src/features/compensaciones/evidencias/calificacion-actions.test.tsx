import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CalificacionActions } from "./calificacion-actions";
import type { EvidenciaEvento, LlamadaContexto } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), resolve: vi.fn(), adminGet: vi.fn(), adminResolve: vi.fn() }));
vi.mock("../administracion/admin-revision.service", () => ({ adminRevisionService: { get: mocks.adminGet, resolve: mocks.adminResolve } }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isAdministrator: true }) }));
vi.mock("./evidencias.service", () => ({ evidenciasService: { administerRating: mocks.update, resolve: mocks.resolve } }));

vi.mock("../shared/compensacion-surface", () => ({
    CompensacionSurface: ({ children, title }: { children: ReactNode; title: string }) => (
        <div role="dialog" aria-label={title}>
            {children}
        </div>
    ),
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        items,
        selectedKey,
        onSelectionChange,
    }: {
        label: string;
        items: Array<{ id: number; label: string }>;
        selectedKey: number;
        onSelectionChange: (key: string) => void;
    }) => (
        <label>
            {label}
            <select aria-label={label} value={selectedKey} onChange={(e) => onSelectionChange(e.target.value)}>
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
const context: LlamadaContexto = { idUsuario: 7, idColaborador: null, puedeRegistrar: true, puedeAprobar: true, puedeRevisar: true };
const item = (state: EvidenciaEvento["estado"] = "PENDIENTE"): EvidenciaEvento => ({
    id: 1,
    estado: state,
    categoria: "CALIFICACION",
    usuarioRegistraId: 8,
    fechaActualizacion: "2026-10-09T00:00:00Z",
    idTipoEvento: 1,
    tipoCodigo: "CALIFICACION_PRESENCIAL",
    tipoNombre: "Calificación",
    conceptoNombre: "Bono",
    beneficiarioDocumento: "00000000",
    responsableNombre: null,
    fechaEvento: "2026-10-09T00:00:00Z",
    periodoImputacion: "2026-10-01",
    titulo: null,
    evidencia: [],
    baseCalculo: null,
    cantidad: null,
    tarifaAplicada: null,
    importeAprobado: null,
    usuarioRegistraNombre: "Cliente QA",
    fechaRegistro: "2026-10-09T00:00:00Z",
    referencias: [],
    revisiones: [],
    beneficiarioNombre: "Asesor QA",
    sucursalOrigenNombre: "Sede QA",
    descripcion: "Comentario original",
    datos: { estrellas: 5, cliente_documento: "01234567" },
    tarifaRegistro: { tipoCalculo: "POR_UNIDAD", valor: 2 },
});
const show = (record = item(), admin = true, ctx: LlamadaContexto | null = context) => {
    const changed = vi.fn();
    render(<CalificacionActions item={record} contexto={ctx} admin={admin} onChanged={changed} onDetail={vi.fn()} />);
    return changed;
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.adminGet.mockResolvedValue({ id: 1, version: "revision-1", puede_aprobar: true, puede_revisar: true });
    mocks.adminResolve.mockResolvedValue({ id: 1 });
});
afterEach(cleanup);
describe("Acciones administrativas de calificaciones", () => {
    it("ignora el rechazo tardío de una fila desmontada", async () => {
        let finish!: () => void;
        mocks.update.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        const changed = show(item("APROBADO"));
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        cleanup();
        await act(async () => finish());
        expect(changed).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
    });
    it.each(["Aprobar", "Rechazar"])("%s pendiente es directo y usa la revisión administrativa vigente", async (label) => {
        const changed = show();
        fireEvent.click(screen.getByRole("button", { name: label }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
        expect(mocks.adminGet).toHaveBeenCalledWith(1);
        expect(mocks.adminResolve).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1, version: "revision-1", action: label === "Aprobar" ? "APROBADO" : "RECHAZADO", reason: "" }),
        );
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
    it("rechaza una aprobada con su versión, sin modal ni doble envío", async () => {
        const changed = show(item("APROBADO"));
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
        expect(mocks.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 1, fechaActualizacion: "2026-10-09T00:00:00Z" }), "RECHAZADO", "");
    });
    it("informa el conflicto al rechazar sin mostrar éxito y refresca la consulta", async () => {
        mocks.update.mockRejectedValueOnce(new Error("La calificación cambió"));
        const changed = show(item("APROBADO"));
        fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "La calificación cambió"));
        expect(alertSpy).not.toHaveBeenCalledWith("success", expect.any(String));
        expect(changed).toHaveBeenCalledOnce();
    });
    it.each(["PENDIENTE", "APROBADO", "RECHAZADO"] as const)("la calificación %s del formulario público es automática: solo consulta", (state) => {
        show({ ...item(state), datos: { ...item().datos, autor_externo: true } });
        expect(screen.getAllByRole("button")).toHaveLength(1);
        expect(screen.getByRole("button", { name: "Ver detalle" })).toBeTruthy();
    });
    it("pendiente ofrece editar, aprobar y rechazar", () => {
        show();
        for (const name of ["Editar", "Aprobar", "Rechazar"]) expect(screen.getByRole("button", { name })).toBeTruthy();
        expect(screen.queryByText("Volver pendiente")).toBeNull();
    });
    it("aprobada ofrece editar, rechazar y volver pendiente", () => {
        show(item("APROBADO"));
        for (const name of ["Editar", "Rechazar", "Volver pendiente"]) expect(screen.getByRole("button", { name })).toBeTruthy();
        expect(screen.queryByText("Aprobar")).toBeNull();
    });
    it("liquidada y usuario sin permiso no ofrecen edición administrativa", () => {
        show(item("LIQUIDADO"));
        expect(screen.queryByText("Editar")).toBeNull();
        cleanup();
        show(item(), false);
        expect(screen.queryByText("Editar")).toBeNull();
    });
    it("no permite resolver el registro propio", () => {
        show({ ...item("APROBADO"), usuarioRegistraId: 7 });
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Volver pendiente" })).toBeNull();
    });
    it.each(["PENDIENTE", "APROBADO", "RECHAZADO"] as const)("no resuelve %s cuando el beneficiario es el revisor aunque lo registre CLIENTE", (state) => {
        const own = { ...item(state), idColaboradorBeneficiario: 12, usuarioRegistraId: null, datos: { ...item().datos, autor_externo: true } };
        show(own, true, { ...context, idColaborador: 12 });
        for (const name of ["Aprobar", "Rechazar", "Volver pendiente"]) expect(screen.queryByRole("button", { name })).toBeNull();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
    it("el jefe sin puedeAdministrar revisa al equipo pero no edita", () => {
        const team = { ...item(), idColaboradorBeneficiario: 18 };
        show(team, false, { ...context, idColaborador: 12 });
        expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
        expect(screen.getByRole("button", { name: "Aprobar" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
    });
    it("el jefe beneficiario solo consulta aunque el autor sea externo", () => {
        const own = { ...item(), idColaboradorBeneficiario: 12, usuarioRegistraId: null };
        show(own, false, { ...context, idColaborador: 12 });
        expect(screen.getAllByRole("button")).toHaveLength(1);
        expect(screen.getByRole("button", { name: /Registro propio: solo consulta/ })).toBeTruthy();
    });
    it("no habilita rechazo administrativo si el contexto no permite revisar", () => {
        show(item("APROBADO"), true, { ...context, puedeRevisar: false });
        expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Volver pendiente" })).toBeNull();
    });
    it("precarga valores, exige motivo y guarda con versión sin doble envío", async () => {
        const changed = show(item("APROBADO"));
        fireEvent.click(screen.getByRole("button", { name: "Editar" }));
        expect((screen.getByRole("textbox", { name: /DNI del cliente/ }) as HTMLInputElement).value).toBe("01234567");
        expect((screen.getByRole("textbox", { name: /Comentario/ }) as HTMLTextAreaElement).value).toBe("Comentario original");
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(screen.getByRole("alert", { hidden: true }).textContent).toMatch(/motivo/);
        expect(mocks.update).not.toHaveBeenCalled();
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo del cambio/ }), { target: { value: "QA corrección" } });
        fireEvent.change(screen.getByRole("combobox", { name: "Estrellas" }), { target: { value: "4" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ fechaActualizacion: "2026-10-09T00:00:00Z" }), "EDITAR", "QA corrección", {
            stars: 4,
            dni: "01234567",
            comment: "Comentario original",
        });
    });
    it.each([["Volver pendiente", "PENDIENTE"]])("confirma %s con motivo sin modificar datos del cliente", async (label, action) => {
        const changed = show(item("APROBADO"));
        fireEvent.click(screen.getByRole("button", { name: label }));
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo del cambio/ }), { target: { value: "QA revisión" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), action, "QA revisión", undefined);
    });
    it("mantiene el modal cuando el servidor rechaza un cambio", async () => {
        mocks.update.mockRejectedValueOnce(new Error("La calificación está incluida en una liquidación vigente"));
        show(item("APROBADO"));
        fireEvent.click(screen.getByRole("button", { name: "Editar" }));
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo del cambio/ }), { target: { value: "QA" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect((await screen.findByRole("alert", { hidden: true })).textContent).toMatch(/liquidación vigente/);
        expect(screen.getByRole("dialog")).toBeTruthy();
    });
});
