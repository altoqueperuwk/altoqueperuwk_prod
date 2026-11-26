import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "../shared/test-alerts";
import { IncidenciaEquipoForm } from "./incidencia-equipo-form";
import type { IncidenciaCatalogo } from "./incidencias.types";

const mocks = vi.hoisted(() => ({ getCatalog: vi.fn(), savePersonal: vi.fn(), createCazaErrores: vi.fn(), sendCazaErrores: vi.fn() }));
vi.mock("./incidencias.service", () => ({ incidenciasService: mocks }));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({
    useClienteLookup: (document: string) => ({ result: document.length === 8 ? { id: 77, nombre: "Cliente Demostración" } : null, isLoading: false }),
}));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <input aria-label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}));
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        items,
        selectedKey,
        onSelectionChange,
        isDisabled,
        isInvalid,
    }: {
        label: string;
        items: { id: string | number; label: string }[];
        selectedKey: string | number | null;
        onSelectionChange: (key: string) => void;
        isDisabled?: boolean;
        isInvalid?: boolean;
    }) => (
        <select
            aria-label={label}
            value={selectedKey ?? ""}
            disabled={isDisabled}
            aria-invalid={isInvalid || undefined}
            onChange={(event) => onSelectionChange(event.target.value)}
        >
            <option value="">Seleccionar</option>
            {items.map((item) => (
                <option key={item.id} value={item.id}>
                    {item.label}
                </option>
            ))}
        </select>
    );
    Select.Item = () => null;
    return { Select };
});
const catalog: IncidenciaCatalogo = {
    tipos: [{ id: 26, codigo: "AUDITORIA_ACTIVA", nombre: "Auditoría", categoria: "PENALIDAD", requiereCliente: true, requiereOperacion: false }],
    responsables: [{ id: 1, nombre: "Persona Demostración", documento: "00000011", idSucursal: 1, sucursal: "Sede Prueba" }],
    reportantes: [],
    penalidades: [
        { id: 5, codigo: "ATC_MAL_FLUJO", nombre: "Mal flujo", descripcion: null, montoReferencia: 2, montoBonoReportante: 1, requiereRespuesta: false },
        { id: 6, codigo: "ATC_UNIFORME", nombre: "Uniforme", descripcion: null, montoReferencia: 20, montoBonoReportante: null, requiereRespuesta: false },
    ],
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCatalog.mockResolvedValue(catalog);
    mocks.savePersonal.mockResolvedValue({ id: 1 });
    mocks.createCazaErrores.mockResolvedValue(12);
    mocks.sendCazaErrores.mockResolvedValue({});
});
afterEach(cleanup);
const choose = async (type: string) => {
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de incidencia" }), { target: { value: type } });
    fireEvent.change(screen.getByRole("combobox", { name: "Colaborador" }), { target: { value: "1" } });
    await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Consultando concepto vigente…")).toBeNull());
};

it("agrupa los campos pendientes en validación y Cancelar retira las marcas", () => {
    render(<IncidenciaEquipoForm catalog={catalog} onSave={vi.fn()} />);
    fireEvent.submit(screen.getByRole("form", { name: "Nueva incidencia" }));
    expect(alertSpy).toHaveBeenCalledExactlyOnceWith("validation", expect.stringMatching(/tipo de incidencia.*colaborador/i));
    expect(screen.getByRole("combobox", { name: "Colaborador" })).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("combobox", { name: "Colaborador" })).not.toHaveAttribute("aria-invalid", "true");
    expect(mocks.savePersonal).not.toHaveBeenCalled();
});

it("registra la falta personal sin elegir reportante con solo la descripción del hecho", async () => {
    const saved = vi.fn();
    render(<IncidenciaEquipoForm catalog={catalog} onSave={saved} />);
    await choose("UNIFORME");
    fireEvent.change(screen.getByRole("textbox", { name: /Descripción del hecho/ }), { target: { value: "Hecho sintético para revisión" } });
    expect(screen.queryByRole("textbox", { name: /Evidencia/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mocks.savePersonal).toHaveBeenCalledWith(
        expect.objectContaining({
            idPenalidadTipo: 6,
            idReportante: null,
            idResponsable: 1,
            motivo: "Hecho sintético para revisión",
            evidenciaUrl: "",
        }),
        "UNIFORME",
        expect.any(String),
        true,
    );
    expect(mocks.createCazaErrores).not.toHaveBeenCalled();
});

it("la auditoría pide los mismos campos sin casillas y envía las notas como motivo", async () => {
    render(<IncidenciaEquipoForm catalog={catalog} onSave={vi.fn()} flow="CAZA" />);
    // Visibles antes de elegir el tipo: el formulario no cambia de forma.
    expect(screen.getByRole("textbox", { name: /DNI del Cliente/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Notas/ })).toBeInTheDocument();
    await choose("MAL_FLUJO");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Dato errado" })).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Notas/ }), { target: { value: "Monto vacío en el envío" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alertSpy).toHaveBeenCalledWith("validation", expect.stringContaining("DNI"));
    expect(mocks.createCazaErrores).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: /DNI del Cliente/ }), { target: { value: "00000022" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.sendCazaErrores).toHaveBeenCalledExactlyOnceWith(12, "MAL_FLUJO_SAFETYPAY"));
    expect(mocks.createCazaErrores).toHaveBeenCalledWith(
        expect.objectContaining({
            idReportante: null,
            idResponsable: 1,
            clienteId: 77,
            clienteDocumento: "00000022",
            motivo: "Hallazgo: Mal Flujo SafetyPay\nNotas: Monto vacío en el envío",
            evidenciaUrl: "",
            operaciones: [],
        }),
        "MAL_FLUJO_SAFETYPAY",
        expect.any(String),
    );
    expect(mocks.savePersonal).not.toHaveBeenCalled();
});
