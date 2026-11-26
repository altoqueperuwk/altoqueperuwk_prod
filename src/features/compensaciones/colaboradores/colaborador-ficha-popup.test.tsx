import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ColaboradorFichaPopup } from "./colaborador-ficha-popup";
import type { Colaborador, ColaboradorAsignacion } from "./colaboradores.types";

const { assignments, profile } = vi.hoisted(() => ({
    assignments: vi.fn(),
    profile: { isAdvisor: false, isStoreManager: false, isResolving: false },
}));
vi.mock("./colaboradores.service", () => ({ colaboradoresService: { getAssignments: assignments } }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => profile }));

vi.mock("../shared/compensacion-surface", () => ({
    CompensacionSurface: ({ children, title }: { children: ReactNode; title: string }) => (
        <div role="dialog" aria-label={title}>
            {children}
        </div>
    ),
}));
vi.mock("@/components/base/select/select", () => ({
    Select: ({ label, items, isDisabled }: { label: string; items: Array<{ id: string; label: string }>; isDisabled: boolean }) => (
        <label>
            {label}
            <select aria-label={label} disabled={isDisabled} value="actual" onChange={() => {}}>
                {items.map((item) => (
                    <option key={item.id} value={item.id}>
                        {item.label}
                    </option>
                ))}
            </select>
        </label>
    ),
}));

const assignment = (cargoNombre: string) =>
    ({
        id: 1,
        idCargo: 3,
        idSucursal: 4,
        idPlan: 2,
        cargoNombre,
        sucursalNombre: "Sede",
        fechaInicio: "2026-01-01",
        fechaFin: null,
        modalidad: "REMOTO",
    }) as ColaboradorAsignacion;
const person = (id = 1) =>
    ({
        id,
        nombreCompleto: "Persona " + id,
        usuarioNombre: "Usuario",
        tipoDocumento: "DNI",
        numeroDocumento: "12345678",
        fechaIngreso: "2026-01-01",
        fechaCese: null,
        motivoCese: "",
        estadoNombre: "Activo",
        asignacion: assignment("Cargo base"),
        ficha: {
            permisos: { puedeVerFicha: true, puedeEditarFicha: true },
        },
    }) as unknown as Colaborador;
const props = { isOpen: true, onClose: vi.fn(), fechaReferencia: "2026-01-10" };
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(profile, { isAdvisor: false, isStoreManager: false, isResolving: false });
    assignments.mockResolvedValue([]);
});
afterEach(cleanup);
it("ignora respuestas de otra persona que llegan tarde", async () => {
    let resolve!: (rows: ColaboradorAsignacion[]) => void;
    assignments
        .mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        )
        .mockResolvedValueOnce([assignment("Cargo correcto")]);
    const view = render(<ColaboradorFichaPopup {...props} colaborador={person()} />);
    view.rerender(<ColaboradorFichaPopup {...props} colaborador={person(2)} />);
    await screen.findByText("Cargo correcto");
    resolve([assignment("Cargo obsoleto")]);
    await waitFor(() => expect(screen.queryByText("Cargo obsoleto")).toBeNull());
    expect(screen.getByText("Cargo correcto")).toBeTruthy();
});
it("ignora respuestas de otra persona que llegan tarde", async () => {
    let resolve!: (rows: ColaboradorAsignacion[]) => void;
    assignments
        .mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        )
        .mockResolvedValueOnce([assignment("Cargo correcto")]);
    const view = render(<ColaboradorFichaPopup {...props} colaborador={person()} />);
    view.rerender(<ColaboradorFichaPopup {...props} colaborador={person(2)} />);
    await screen.findByText("Cargo correcto");
    resolve([assignment("Cargo obsoleto")]);
    await waitFor(() => expect(screen.queryByText("Cargo obsoleto")).toBeNull());
    expect(screen.getByText("Cargo correcto")).toBeTruthy();
});
it("permite reintentar cuando falla la consulta de la asignación", async () => {
    assignments.mockRejectedValueOnce(new Error("No disponible"));
    render(<ColaboradorFichaPopup {...props} colaborador={person()} />);
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("No disponible");
    assignments.mockResolvedValueOnce([assignment("Cargo reintentado")]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Cargo reintentado")).toBeTruthy();
});
it.each(["isAdvisor", "isStoreManager"] as const)("%s consulta valores sin controles de formulario ni acciones de edicion", async (key) => {
    profile[key] = true;
    render(<ColaboradorFichaPopup {...props} colaborador={person()} />);
    await screen.findByText("Cargo base");
    for (const role of ["textbox", "combobox", "spinbutton"]) expect(screen.queryAllByRole(role)).toHaveLength(0);
    for (const action of [/Guardar/, /Cambiar asignación/]) expect(screen.queryByRole("button", { name: action })).toBeNull();
});
it("presenta los datos laborales y ya no muestra sueldo, horario ni cuentas", async () => {
    render(<ColaboradorFichaPopup {...props} colaborador={person()} />);
    expect(screen.getByRole("dialog", { name: "Ficha del Colaborador" })).toBeTruthy();
    expect(screen.getByText("Persona 1")).toBeTruthy();
    for (const name of [
        "Usuario del Sistema",
        "Nombre Completo",
        "Documento",
        "Estado",
        "Cargo",
        "Sede",
        "Modalidad",
        "Fecha de Ingreso",
        "Fecha de Cese",
        "Motivo de Cese",
    ])
        expect(screen.getByText(name, { exact: true, selector: "dt" })).toBeTruthy();
    for (const name of ["Horario", "Sueldo Mensual", "Pen. por Min. Tarde", "Bono Puntualidad", "Cuenta Principal"])
        expect(screen.queryByText(name, { exact: true, selector: "dt" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Cuentas para Depósito" })).toBeNull();
});
it("muestra la asignación consultada", async () => {
    assignments.mockResolvedValue([
        { ...assignment("Cargo consultado"), esVigente: false },
        { ...assignment("Cargo actual"), id: 2, modalidad: "PRESENCIAL", esVigente: true },
    ]);
    render(<ColaboradorFichaPopup {...props} colaborador={person()} />);
    expect(await screen.findByText("Cargo consultado")).toBeTruthy();
    expect(screen.getByText("Remoto")).toBeTruthy();
    expect(screen.queryByText("Cargo actual")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(props.onClose).toHaveBeenCalledOnce();
});
