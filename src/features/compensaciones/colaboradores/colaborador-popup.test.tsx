import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ColaboradorPopup } from "./colaborador-popup";
import type { Colaborador } from "./colaboradores.types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), users: vi.fn(), assignments: vi.fn() }));
vi.mock("./colaboradores.service", () => ({
    colaboradoresService: {
        create: mocks.create,
        update: mocks.update,
        getEligibleUsers: mocks.users,
        getAssignments: mocks.assignments,
    },
}));

vi.mock("@/providers/session-cache-provider", () => ({
    useSessionCache: () => ({
        estados: [
            { id: 1, nombre: "Activo" },
            { id: 2, nombre: "Inactivo" },
        ],
    }),
}));
vi.mock("../shared/compensacion-surface", () => ({ CompensacionSurface: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }));
vi.mock("@/components/base/select/select", () => {
    const Select = Object.assign(
        ({
            label,
            items,
            selectedKey,
            onSelectionChange,
            isDisabled,
            "aria-label": ariaLabel,
        }: {
            label?: string;
            "aria-label"?: string;
            items: Array<{ id: string | number; label: string }>;
            selectedKey: string | number;
            onSelectionChange: (key: string) => void;
            isDisabled: boolean;
        }) => (
            <label>
                {label}
                <select aria-label={ariaLabel ?? label} value={selectedKey ?? ""} onChange={(e) => onSelectionChange(e.target.value)} disabled={isDisabled}>
                    <option value="">Selecciona</option>
                    {items.map((i) => (
                        <option key={i.id} value={i.id}>
                            {i.label}
                        </option>
                    ))}
                </select>
            </label>
        ),
        { Item: () => null },
    );
    return { Select };
});

const catalog = [{ id: 1, nombre: "General", codigo: "PLAN_COMPENSACIONES_GENERAL" }];
const props = { isOpen: true, onClose: vi.fn(), onSave: vi.fn(), item: null, cargos: catalog, planes: catalog, sucursales: catalog };
const edited = {
    id: 7,
    idUsuario: 9,
    nombreCompleto: "María Del Carmen Rojas",
    nombres: "María Del Carmen",
    apellidoPaterno: "Rojas",
    apellidoMaterno: "",
    numeroDocumento: "12345678",
    tipoDocumento: "DNI",
    fechaIngreso: "2026-10-01",
    motivoCese: "",
    idEstado: 1,
} as Colaborador;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.users.mockResolvedValue([{ id: 9, nombre: "María Del Carmen Rojas", username: "maria", email: "correo-invalido", idSucursal: 1 }]);
    mocks.create.mockResolvedValue({ id: 7 });
    mocks.update.mockResolvedValue({ id: 7 });
    mocks.assignments.mockResolvedValue([]);
});
afterEach(cleanup);
describe("Ficha simple del colaborador", () => {
    it("bloquea el cambio de usuario al editar y conserva el vinculo original", async () => {
        mocks.users.mockResolvedValue([
            { id: 9, nombre: "Original" },
            { id: 10, nombre: "Otro" },
        ]);
        render(<ColaboradorPopup {...props} item={edited} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false));
        const user = screen.getByLabelText("Usuario del Sistema") as HTMLSelectElement;
        expect(user.disabled).toBe(true);
        fireEvent.change(user, { target: { value: "10" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({ idUsuario: 9 })));
    });
    it("conserva la asignación vigente y no envía jornada ni cuentas al guardar", async () => {
        mocks.assignments.mockResolvedValue([{ esVigente: true, idCargo: 1, idSucursal: 1, idPlan: 1, modalidad: "REMOTO" }]);
        render(<ColaboradorPopup {...props} item={edited} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false));
        expect((screen.getByLabelText("Modalidad") as HTMLSelectElement).value).toBe("REMOTO");
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
        const values = mocks.update.mock.calls[0][1];
        expect(values).toMatchObject({ modalidad: "REMOTO", idCargo: 1, idSucursal: 1 });
        expect(values).not.toHaveProperty("idJornada");
        expect(values).not.toHaveProperty("cuentas");
        expect(values).not.toHaveProperty("importes");
        expect(screen.queryByLabelText("Horario")).toBeNull();
    });
    it("bloquea el guardado si falla la precarga de la asignación", async () => {
        mocks.assignments.mockRejectedValue(new Error("Fallo"));
        render(<ColaboradorPopup {...props} item={edited} />);
        expect(await screen.findByRole("alert", { hidden: true })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it("unifica nombres y oculta campos ajenos al flujo legacy", () => {
        render(<ColaboradorPopup {...props} />);
        expect(screen.getByRole("textbox", { name: /Nombre Completo/ })).toBeTruthy();
        for (const label of [/Código de huellero/, /Apellido paterno/, /Apellido materno/, /^Nombres/, /Correo/, /Celular/])
            expect(screen.queryByLabelText(label)).toBeNull();
    });
    it("precarga el nombre completo al editar, sin duplicar apellidos", async () => {
        render(<ColaboradorPopup {...props} item={edited} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false));
        expect((screen.getByRole("textbox", { name: /Nombre Completo/ }) as HTMLInputElement).value).toBe(edited.nombreCompleto);
        fireEvent.change(screen.getByRole("textbox", { name: /Nombre Completo/ }), { target: { value: "María Rojas Torres" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() =>
            expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({ nombreCompleto: "María Rojas Torres", numeroDocumento: "12345678" })),
        );
    });
    it("registra inline solo con cargo y sede, sin sueldo, horario ni cuentas", async () => {
        render(<ColaboradorPopup {...props} inline />);
        await waitFor(() => expect((screen.getByLabelText("Usuario del Sistema") as HTMLSelectElement).disabled).toBe(false));
        fireEvent.change(screen.getByLabelText("Usuario del Sistema"), { target: { value: "9" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "12345678" } });
        for (const label of ["Cargo", "Sede"]) fireEvent.change(screen.getByLabelText(label), { target: { value: "1" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
        const values = mocks.create.mock.calls[0][0];
        expect(values).toMatchObject({
            nombreCompleto: "María Del Carmen Rojas",
            idUsuario: 9,
            idSucursal: 1,
            tipoDocumento: "DNI",
            fechaIngreso: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        });
        for (const key of ["idJornada", "cuentas", "importes", "email"]) expect(values).not.toHaveProperty(key);
        for (const label of ["Horario", "Sueldo Mensual", "Cuenta Principal"]) expect(screen.queryByLabelText(label)).toBeNull();
    });
    it("valida DNI y nombre antes de guardar", async () => {
        render(<ColaboradorPopup {...props} item={edited} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false));
        fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "123" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledWith("validation", "El DNI debe tener 8 dígitos.");
        fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "12345678" } });
        fireEvent.change(screen.getByRole("textbox", { name: /Nombre Completo/ }), { target: { value: "  " } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(alertSpy).toHaveBeenCalledWith("validation", "El nombre completo es obligatorio.");
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it("conserva el formulario ante un error del servidor", async () => {
        mocks.update.mockRejectedValueOnce(new Error("Sin acceso"));
        render(<ColaboradorPopup {...props} item={edited} />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Sin acceso"));
        expect(props.onSave).not.toHaveBeenCalled();
        expect((screen.getByRole("textbox", { name: /Nombre Completo/ }) as HTMLInputElement).value).toBe(edited.nombreCompleto);
    });
});
