import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { FacturacionAuditoriaPage } from "./facturacion-auditoria-page";
import type { FacturacionReporte } from "./facturacion-auditoria.service";

const mocks = vi.hoisted(() => ({ contexto: vi.fn(), listar: vi.fn(), operaciones: vi.fn(), guardar: vi.fn(), resolver: vi.fn(), reabrir: vi.fn() }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./facturacion-auditoria.service", async (original) => ({ ...(await original<object>()), facturacionAuditoriaService: mocks }));

vi.mock("../shared/compensacion-surface", () => ({ CompensacionSurface: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }));
// Native controls isolate workflow behaviour from the shared React Aria overlays.
vi.mock("@/components/base/select/select", () => {
    const Select = ({
        label,
        "aria-label": ariaLabel,
        items,
        selectedKey,
        onSelectionChange,
        isDisabled,
    }: {
        label?: string;
        "aria-label"?: string;
        items: Array<{ id: string; label: string }>;
        selectedKey: string | null;
        onSelectionChange: (key: string) => void;
        isDisabled?: boolean;
    }) => (
        <label>
            {label}
            <select aria-label={label ?? ariaLabel} value={selectedKey ?? ""} disabled={isDisabled} onChange={(e) => onSelectionChange(e.target.value)}>
                <option value="">Seleccionar</option>
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
vi.mock("@/components/shared/data-table", () => ({
    DataTable: ({
        data,
        toolbar,
        renderActions,
        onPageChange,
    }: {
        data: FacturacionReporte[];
        toolbar: ReactNode;
        renderActions: (r: FacturacionReporte) => ReactNode;
        onPageChange: (p: number) => void;
    }) => (
        <div>
            {toolbar}
            {data.map((r) => (
                <div key={r.id}>
                    {r.descripcion}
                    {renderActions(r)}
                </div>
            ))}
            <button onClick={() => onPageChange(2)}>Página Siguiente</button>
        </div>
    ),
}));
const report = (extra = true): FacturacionReporte => ({
    id: 7,
    tipo: extra ? "OPERACION_EXTRA" : "DETECCION_ERROR_PAGO",
    descripcion: "Comprobante encontrado",
    estado_evento: "PENDIENTE",
    fecha_evento: "2026-10-20T12:00:00Z",
    fecha_registro: "2026-10-20T12:00:00Z",
    fecha_actualizacion: "2026-10-20T12:00:00Z",
    importe_aprobado: null,
    beneficiario: "Facturación",
    cliente: "Sin vincular",
    datos: { cliente_documento: "12345678", codigo_externo: extra ? "EXT-1" : null, error: extra ? null : "MONTO" },
    evidencia: [{ evidencia: "Referencia externa 1" }],
    criterios_validacion_snapshot: { regla_registro: { monto: 0.2 } },
    revisiones: [],
});
beforeEach(() => {
    mocks.contexto.mockResolvedValue({ es_admin: false, puede_registrar: true, id_colaborador: 18 });
    mocks.listar.mockResolvedValue({ items: [], total: 0, pendientes: 0, aprobado: 0 });
    mocks.guardar.mockResolvedValue({ id: 7 });
});
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});
const setup = async () => {
    render(<FacturacionAuditoriaPage />);
    await screen.findByText("Auditoría de Pagos");
};
const input = (name: string, value: string) => fireEvent.change(screen.getAllByLabelText(name, { exact: false })[0], { target: { value } });
it("registra extra con evidencia previa sin operación ni selector de beneficiario", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Tipo de Reporte"), { target: { value: "OPERACION_EXTRA" } });
    input("DNI", "12345678");
    input("Comprobante", "EXT-1");
    input("Descripción", "Comprobante encontrado");
    expect(screen.queryByLabelText("Operación Real")).toBeNull();
    expect(screen.queryByLabelText(/Beneficiario/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
        expect(mocks.guardar).toHaveBeenCalledWith(
            expect.objectContaining({ tipo: "OPERACION_EXTRA", operacion: null, dni: "12345678", clave: expect.any(String) }),
        ),
    );
    expect(mocks.resolver).not.toHaveBeenCalled();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("success", "Reporte enviado a Gerencia."));
});
it("descarta operaciones que llegan después de cambiar DNI", async () => {
    let complete!: (value: unknown) => void;
    mocks.operaciones.mockReturnValue(
        new Promise((resolve) => {
            complete = resolve;
        }),
    );
    await setup();
    input("DNI", "12345678");
    fireEvent.click(screen.getByRole("button", { name: "Consultar Operaciones" }));
    input("DNI", "87654321");
    await act(async () => complete([{ id: 22, dni: "12345678", codigo: "ANTIGUA", monto: 100, estado: "Pagado" }]));
    expect(screen.queryByRole("option", { name: /ANTIGUA/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
});
it("no confirma una captura que termina después de abandonar la pantalla", async () => {
    let complete!: (value: unknown) => void;
    mocks.guardar.mockReturnValue(
        new Promise((resolve) => {
            complete = resolve;
        }),
    );
    const view = render(<FacturacionAuditoriaPage />);
    await screen.findByText("Auditoría de Pagos");
    fireEvent.change(screen.getByLabelText("Tipo de Reporte"), { target: { value: "OPERACION_EXTRA" } });
    input("DNI", "12345678");
    input("Comprobante", "EXT-1");
    input("Descripción", "Captura pendiente");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.guardar).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
        complete({ id: 7, estado_evento: "PENDIENTE" });
    });
    expect(alertSpy).not.toHaveBeenCalled();
});
it("mantiene la clave al reintentar una respuesta fallida y no autoaprueba", async () => {
    mocks.guardar.mockRejectedValue(new Error("Red interrumpida"));
    await setup();
    fireEvent.change(screen.getByLabelText("Tipo de Reporte"), { target: { value: "OPERACION_EXTRA" } });
    input("DNI", "12345678");
    input("Comprobante", "EXT-1");
    input("Descripción", "Pendiente");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("Red interrumpida");
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.guardar).toHaveBeenCalledTimes(2));
    expect(mocks.guardar.mock.calls[0][0].clave).toBe(mocks.guardar.mock.calls[1][0].clave);
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
});
it("administración ve pendientes globales, requiere asociación guardada antes de aprobar", async () => {
    mocks.contexto.mockResolvedValue({ es_admin: true, puede_registrar: false, id_colaborador: 1 });
    mocks.listar.mockResolvedValue({ items: [report()], total: 1, pendientes: 1, aprobado: 0 });
    await setup();
    expect(screen.queryByText("Registrar Reporte")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Revisar Reporte" }));
    input("Justificación de Revisión", "Evidencia confirmada");
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled();
    expect(screen.getByLabelText("Descripción", { exact: false })).toBeDisabled();
    expect(screen.getByLabelText("Comprobante", { exact: false })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rechazar" })).not.toBeDisabled();
});
it("muestra errores de acceso sin exponer formulario", async () => {
    mocks.contexto.mockRejectedValue(new Error("Asignación no vigente"));
    render(<FacturacionAuditoriaPage />);
    await waitFor(() => expect(screen.getByText("Asignación no vigente")).toBeVisible());
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(mocks.listar).not.toHaveBeenCalled();
});
it("permite a administración reabrir una aprobación con motivo y versión del reporte", async () => {
    mocks.contexto.mockResolvedValue({ es_admin: true, puede_registrar: false, id_colaborador: 1 });
    const version = "2026-11-02T15:00:00Z";
    mocks.listar.mockResolvedValue({
        items: [{ ...report(), estado_evento: "APROBADO", fecha_actualizacion: version, requiere_revision: true }],
        total: 1,
        pendientes: 1,
        aprobado: 0,
    });
    mocks.reabrir.mockResolvedValue({ id: 7, estado_evento: "PENDIENTE" });
    await setup();
    fireEvent.click(await screen.findByRole("button", { name: "Revisar Reporte" }));
    expect(screen.getByRole("button", { name: "Reabrir Revisión" })).toBeDisabled();
    input("Motivo de Revisión", "Fuente requiere nuevo contraste");
    fireEvent.click(screen.getByRole("button", { name: "Reabrir Revisión" }));
    await waitFor(() => expect(mocks.reabrir).toHaveBeenCalledWith(7, version, "Fuente requiere nuevo contraste"));
});
it("cambia periodo y envía filtros al servidor desde página uno", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: /^Periodo:/ }));
    const group = await screen.findByRole("group", { name: /^Meses de / });
    let year = Number(group.getAttribute("aria-label")!.split(" ").at(-1));
    while (year > 2024) {
        fireEvent.click(screen.getByRole("button", { name: "Año anterior" }));
        year--;
    }
    while (year < 2024) {
        fireEvent.click(screen.getByRole("button", { name: "Año siguiente" }));
        year++;
    }
    fireEvent.click(screen.getByRole("button", { name: "febrero de 2024" }));
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith(expect.objectContaining({ desde: "2024-02-01", hasta: "2024-02-29", pagina: 1 })));
});
it("amplía la descripción compacta y conserva los párrafos al guardar", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Tipo de Reporte"), { target: { value: "OPERACION_EXTRA" } });
    input("DNI", "12345678");
    input("Comprobante", "EXT-1");
    fireEvent.click(screen.getByRole("button", { name: "Ampliar nota" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Descripción/ }), { target: { value: "Monto verificado\nCuenta por revisar" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver al formulario" }));
    expect(screen.getByRole("textbox", { name: /Descripción/ })).toHaveValue("Monto verificado Cuenta por revisar");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({ descripcion: "Monto verificado\nCuenta por revisar" })));
});
it("el filtro de Estado ofrece solo Pendiente, Aprobado y Rechazado", async () => {
    await setup();
    const options = within(screen.getByLabelText("Filtrar por estado")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Seleccionar", "Todos los estados", "Pendiente", "Aprobado", "Rechazado"]);
});
it("indica que Gerencia valida ambos tipos de reporte, sin hablar de Importe", async () => {
    await setup();
    expect(screen.getByText(/Valida: Gerencia/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Tipo de Reporte"), { target: { value: "OPERACION_EXTRA" } });
    expect(screen.getByText(/Valida: Gerencia/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/importe/i);
});
