import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import type { Expediente } from "../shared/seguimiento-jefatura.service";
import { HallazgoExpedienteDialog } from "./hallazgo-expediente-dialog";

const mocks = vi.hoisted(() => ({ get: vi.fn(), correct: vi.fn(), discharge: vi.fn() }));
vi.mock("../shared/seguimiento-jefatura.service", () => ({ seguimientoJefaturaService: { expediente: mocks.get, corregir: mocks.correct } }));
vi.mock("./incidencias.service", () => ({ incidenciasService: { discharge: mocks.discharge } }));

vi.mock("../shared/compensacion-surface", () => ({ CompensacionSurface: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../shared/compensacion-dialog-chrome", () => ({
    CompensacionDialogHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
    CompensacionDialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}));
vi.mock("@/components/base/select/select", () => {
    const Select = Object.assign(
        ({
            label,
            selectedKey,
            items,
            onSelectionChange,
        }: {
            label: string;
            selectedKey: string;
            items: Array<{ id: string; label: string }>;
            onSelectionChange: (value: string) => void;
        }) => (
            <label>
                {label}
                <select value={selectedKey} onChange={(event) => onSelectionChange(event.target.value)}>
                    {items.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.label}
                        </option>
                    ))}
                </select>
            </label>
        ),
        { Item: () => null },
    );
    return { Select };
});
const fixture: Expediente = {
    id: 97,
    id_origen: 97,
    titulo: "Monto Incorrecto",
    motivo: "Monto vacío en registro",
    fecha: "2026-11-12T13:00:00Z",
    estado: "PENDIENTE",
    reportante: "Jefe",
    colaborador: "Ivonne",
    id_responsable: 15,
    id_reportante: 10,
    es_hallazgo: true,
    correccion: null,
    puede_corregir: false,
    puede_descargo: true,
    consecuencias: [{ id: 97, titulo: "Error de Datos", tipo: "Penalidad", estado: "PENDIENTE", importe: null }],
    historial: [],
};
beforeEach(() => {
    vi.resetAllMocks();
    mocks.get.mockResolvedValue(fixture);
    mocks.correct.mockResolvedValue({});
    mocks.discharge.mockResolvedValue({});
});
afterEach(cleanup);
it("muestra el expediente propio y envia descargo, sin habilitar correccion ajena", async () => {
    render(<HallazgoExpedienteDialog id={97} onClose={() => {}} />);
    await screen.findByText("Monto vacío en registro");
    expect(screen.queryByText("Guardar Corrección")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Mi Descargo/), { target: { value: "El monto fue confirmado con el cliente" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar Descargo" }));
    await waitFor(() => expect(mocks.discharge).toHaveBeenCalledWith(97, "El monto fue confirmado con el cliente", ""));
    expect(alertSpy).toHaveBeenCalledWith("success", "Descargo enviado a revisión");
});
it("respeta el bloqueo de descargo devuelto por el servidor", async () => {
    mocks.get.mockResolvedValue({ ...fixture, puede_descargo: false });
    render(<HallazgoExpedienteDialog id={97} onClose={() => {}} />);
    await screen.findByText("Monto vacío en registro");
    expect(screen.queryByLabelText(/Mi Descargo/)).toBeNull();
});
it("envia fecha de Lima, autor y version vigente al corregir", async () => {
    mocks.get.mockResolvedValue({
        ...fixture,
        puede_descargo: false,
        puede_corregir: true,
        correccion: {
            estado: "PENDIENTE",
            nota: "Pendiente de validar",
            version: 3,
            antes_escalamiento: false,
            fecha_correccion: null,
            id_colaborador_corrige: 15,
        },
    });
    render(<HallazgoExpedienteDialog id={97} onClose={() => {}} />);
    await screen.findByLabelText("Estado");
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "CORREGIDO" } });
    fireEvent.change(screen.getByLabelText(/Fecha de Corrección/), { target: { value: "2026-11-12T10:00" } });
    fireEvent.change(screen.getByLabelText(/Detalle de Corrección/), { target: { value: "Se corrigio el monto con el asesor" } });
    fireEvent.click(screen.getByLabelText("Corregido antes de escalar a Pagos / Facturación"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar Corrección" }));
    await waitFor(() =>
        expect(mocks.correct).toHaveBeenCalledWith(97, {
            estado: "CORREGIDO",
            fecha: "2026-11-12T15:00:00.000Z",
            antes: true,
            corrige: 15,
            nota: "Se corrigio el monto con el asesor",
            version: 3,
        }),
    );
});
it("descarta respuestas atrasadas al cambiar de expediente", async () => {
    let resolve!: (value: Expediente) => void;
    mocks.get.mockImplementationOnce(
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    const view = render(<HallazgoExpedienteDialog id={97} onClose={() => {}} />);
    view.rerender(<HallazgoExpedienteDialog id={98} onClose={() => {}} />);
    await screen.findByText("Monto vacío en registro");
    await act(async () => resolve({ ...fixture, motivo: "RESPUESTA ANTIGUA" }));
    expect(screen.queryByText("RESPUESTA ANTIGUA")).toBeNull();
});
