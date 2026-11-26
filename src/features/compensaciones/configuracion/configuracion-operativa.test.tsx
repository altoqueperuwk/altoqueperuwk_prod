import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertSpy, renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ConfiguracionOperativa } from "./configuracion-operativa";
import type { Cargo, Concepto, PenalidadTipo, PlanVersion, Regla } from "./configuracion.types";

const mocks = vi.hoisted(() => ({ saveRule: vi.fn(), savePenalty: vi.fn(), saveParameters: vi.fn() }));

vi.mock("./configuracion.service", () => ({ configuracionService: { saveParameters: mocks.saveParameters } }));

const version: PlanVersion = {
    id: 1,
    idPlan: 1,
    planNombre: "Beta",
    numeroVersion: 1,
    nombre: "Beta",
    fechaInicio: "2026-10-01",
    fechaFin: "",
    estado: "BORRADOR",
    observacion: "",
    cantidadReglas: 4,
    esVigente: true,
};
const cargos: Cargo[] = [
    { id: 1, codigo: "ATENCION_CLIENTE", nombre: "Atención al Cliente", descripcion: "", orden: 1, idEstado: 1, estado: "ACTIVO" },
    { id: 2, codigo: "JEFE_TIENDA", nombre: "Jefe de Tienda", descripcion: "", orden: 2, idEstado: 1, estado: "ACTIVO" },
];
const concepts: Concepto[] = ["COMISION_LLAMADA", "COMISION_REFERIDO", "BONO_HORAS_EXTRA", "BONO_META_SEDE"].map((codigo, i) => ({
    id: i + 1,
    codigo,
    nombre: ["Llamada", "Referido", "Horas extra por tramos", "Meta de sede"][i],
    categoria: "BONO",
    naturaleza: "INGRESO",
    unidad: "MONTO",
    requiereEvidencia: false,
    requiereAprobacion: false,
    permiteExcepcion: false,
    orden: i,
    idEstado: 1,
    estado: "ACTIVO",
}));
const rule = (id: number, overrides: Partial<Regla> = {}): Regla => ({
    id,
    idPlanVersion: 1,
    planNombre: "Beta",
    numeroVersion: 1,
    estadoVersion: "BORRADOR",
    idConcepto: id,
    conceptoNombre: concepts[id - 1].nombre,
    categoria: "BONO",
    naturaleza: "INGRESO",
    idCargo: 1,
    cargoNombre: "Atención al Cliente",
    idSucursal: null,
    sucursalNombre: "",
    tipoCalculo: "FIJO",
    monto: 0.2,
    porcentaje: null,
    valorMinimo: null,
    valorMaximo: null,
    topeImporte: null,
    prioridad: 1,
    configuracion: {},
    fuenteOperacion: "",
    idEstado: 1,
    estado: "ACTIVO",
    ...overrides,
});
const rules = [
    rule(1),
    rule(2, { tipoCalculo: "PORCENTAJE", porcentaje: 0.4 }),
    rule(3, {
        tipoCalculo: "POR_MINUTO",
        monto: 0,
        configuracion: { metodo_extra: "RECARGO_TRAMOS", limite_primer_tramo: 120, recargo_primero: 25, recargo_siguiente: 35 },
    }),
    rule(4, { idCargo: 2, cargoNombre: "Jefe de Tienda", monto: 200 }),
];
const penalty = (id: number, idCargo: number): PenalidadTipo => ({
    id,
    idPlanVersion: 1,
    planNombre: "Beta",
    numeroVersion: 1,
    estadoVersion: "BORRADOR",
    codigo: `INTERNO_${id}`,
    nombre: idCargo === 1 ? "Error de datos" : "Error de supervisión",
    descripcion: "Descripción",
    idCargo,
    cargoNombre: cargos[idCargo - 1].nombre,
    idConceptoDescuento: 1,
    conceptoDescuentoNombre: "Descuento",
    idConceptoBono: null,
    conceptoBonoNombre: "",
    montoReferencia: 2,
    montoBono: null,
    requiereRespuesta: true,
    configuracion: {},
    idEstado: 1,
    estado: "ACTIVO",
});
const onChanged = vi.fn();
const show = (state = "BORRADOR", extra: Partial<ComponentProps<typeof ConfiguracionOperativa>> = {}) =>
    render(
        <ConfiguracionOperativa
            version={{ ...version, estado: state }}
            concepts={concepts}
            cargos={cargos}
            rules={rules}
            penalties={[penalty(1, 1), penalty(2, 2)]}
            isLoading={false}
            onChanged={onChanged}
            {...extra}
        />,
    );
beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveRule.mockResolvedValue(undefined);
    mocks.savePenalty.mockResolvedValue(undefined);
    mocks.saveParameters.mockResolvedValue({ parametros_guardados: 1 });
});
afterEach(cleanup);

describe("Administración familiar al legacy", () => {
    it("deshabilita los campos durante carga y guardado", async () => {
        let resolve!: (value: object) => void;
        mocks.saveParameters.mockImplementationOnce(
            () =>
                new Promise((yes) => {
                    resolve = yes;
                }),
        );
        const view = show("BORRADOR", { isLoading: true });
        expect(screen.getByRole("spinbutton", { name: /^Llamadas/ })).toBeDisabled();
        view.unmount();
        show("BORRADOR");
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Llamadas/ }), { target: { value: "0.3" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        expect(screen.getByRole("spinbutton", { name: /^Llamadas/ })).toBeDisabled();
        expect(mocks.saveParameters).toHaveBeenCalledWith(1, [{ tipo: "REGLA", id: expect.any(Number), anterior: "0.2", valor: "0.3" }]);
        await act(async () => resolve({ parametros_guardados: 1 }));
    });

    it("solo muestra parámetros de la versión seleccionada y conserva el histórico fuera del envío", async () => {
        show("BORRADOR", { rules: [...rules, rule(1, { id: 99, idPlanVersion: 2, monto: 999 })] });
        expect(screen.getByRole("spinbutton", { name: /^Llamadas/ })).toHaveValue(0.2);
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Llamadas/ }), { target: { value: "0.3" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        await waitFor(() => expect(mocks.saveParameters).toHaveBeenCalledWith(1, [{ tipo: "REGLA", id: 1, anterior: "0.2", valor: "0.3" }]));
    });

    it("no inventa recargos cuando faltan las condiciones registradas", () => {
        show("BORRADOR", { rules: [rule(3, { configuracion: { metodo_extra: "RECARGO_TRAMOS" } })] });
        expect(screen.getByText("Recargos por tramos según la configuración registrada.")).toBeTruthy();
        expect(screen.queryByText(/Primeros 120 min/)).toBeNull();
    });

    it("no notifica ni recarga por un guardado que terminó después de salir", async () => {
        let resolve!: (value: object) => void;
        mocks.saveParameters.mockImplementationOnce(
            () =>
                new Promise((yes) => {
                    resolve = yes;
                }),
        );
        const view = show();
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        view.unmount();
        await act(async () => resolve({ parametros_guardados: 1 }));
        expect(alertSpy).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });

    it("permite inicializar sin cambiar tarifas artificialmente", async () => {
        show();
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        await waitFor(() => expect(mocks.saveParameters).toHaveBeenCalledWith(1, []));
    });
    it("ofrece accesos con texto a las cuatro secciones sin alterar datos", () => {
        show();
        expect(screen.getByRole("navigation", { name: "Secciones de configuración" })).toBeTruthy();
        for (const [label, target] of [
            ["Generales", "pagos"],
            ["Auditoría Operaciones", "bonos"],
            ["Valores por cargo", "cargos"],
            ["Penalidades", "penalidades"],
        ]) {
            const href = screen.getByRole("link", { name: label }).getAttribute("href");
            expect(href).toBe(`#config-${target}`);
            expect(document.getElementById(`config-${target}`)).toBeTruthy();
        }
        expect(mocks.saveRule).not.toHaveBeenCalled();
        expect(mocks.savePenalty).not.toHaveBeenCalled();
    });
    it("mantiene todos los bloques visibles sin acordeones", () => {
        show();
        expect(screen.queryByText(/SafetyPay|Cuota Diaria/)).toBeNull();
        for (const name of ["Bonos generales", "Bonos de Auditoría Operaciones", "Valores por cargo", "Otros bonos"])
            expect(screen.getByRole("heading", { name })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /Jefatura|Bonos por Cargo/ })).toBeNull();
        expect(screen.queryByRole("heading", { name: "Jornadas y Asistencia" })).toBeNull();
        expect(screen.getByRole("spinbutton", { name: /^Referidos/ })).toBeInTheDocument();
        expect(document.querySelector("details")).toBeNull();
        expect(screen.getByRole("button", { name: "Guardar parámetros" }).closest("div[aria-label='Guardar parámetros']")?.className).toContain("sticky");
    });
    it("muestra unidades monetarias y porcentaje sin convertir valores", () => {
        show();
        expect(screen.getByRole("spinbutton", { name: /^Llamadas/ }).getAttribute("value")).toBe("0.2");
        expect(screen.getByRole("spinbutton", { name: /^Referidos/ }).getAttribute("value")).toBe("0.4");
    });
    it("presenta recargos por tramos y no permite editar una falsa tarifa cero", () => {
        show();
        expect(screen.getByText("Primeros 120 min: +25%; siguientes: +35%.")).toBeTruthy();
        expect(screen.queryByRole("spinbutton", { name: /Horas extra/ })).toBeNull();
        expect(screen.queryByRole("button", { name: "Ver condiciones" })).toBeNull();
        expect(screen.queryByText("Configuración avanzada")).toBeNull();
    });
    it("muestra cada bono una sola vez y solo las penalidades del perfil elegido", () => {
        show();
        expect(screen.getAllByText(/^Meta de sede/)).toHaveLength(1);
        expect(screen.queryByText("INTERNO_1")).toBeNull();
        expect(screen.getByText("Error de datos")).toBeTruthy();
        expect(screen.queryByText("Error de supervisión")).toBeNull();
    });
    it("guarda solo cambios usando el contrato existente con los bloques visibles", async () => {
        show();
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Referidos/ }), { target: { value: "0.5" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(mocks.saveParameters).toHaveBeenCalledTimes(1);
        expect(mocks.saveParameters).toHaveBeenCalledWith(1, [{ tipo: "REGLA", id: 2, anterior: "0.4", valor: "0.5" }]);
        expect(mocks.saveRule).not.toHaveBeenCalled();
        expect(mocks.savePenalty).not.toHaveBeenCalled();
    });
    it("un campo común guarda en todas las reglas del bono y dice a qué cargos aplica", async () => {
        show("BORRADOR", { rules: [rule(1), rule(1, { id: 11, idCargo: 2, cargoNombre: "Jefe de Tienda" })] });
        expect(screen.getAllByRole("spinbutton", { name: /^Llamadas/ })).toHaveLength(1);
        expect(screen.getByText("Todos los cargos")).toBeTruthy();
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Llamadas/ }), { target: { value: "0.25" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        await waitFor(() =>
            expect(mocks.saveParameters).toHaveBeenCalledWith(1, [
                { tipo: "REGLA", id: 1, anterior: "0.2", valor: "0.25" },
                { tipo: "REGLA", id: 11, anterior: "0.2", valor: "0.25" },
            ]),
        );
    });
    it("si los importes difieren usa la tabla por cargo y nunca los iguala", async () => {
        show("BORRADOR", { rules: [rule(1), rule(1, { id: 11, idCargo: 2, cargoNombre: "Jefe de Tienda", monto: 0.5 })] });
        expect(screen.getByRole("columnheader", { name: "Llamadas" })).toBeTruthy();
        fireEvent.change(screen.getByRole("spinbutton", { name: "Llamadas para Jefe de Tienda (S/)" }), { target: { value: "0.6" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        await waitFor(() => expect(mocks.saveParameters).toHaveBeenCalledWith(1, [{ tipo: "REGLA", id: 11, anterior: "0.5", valor: "0.6" }]));
    });
    it("no muestra reglas desactivadas ni las cuenta como vigentes", () => {
        show("BORRADOR", { rules: [rule(1), rule(4, { idCargo: 2, estado: "INACTIVO", idEstado: 2 })] });
        expect(screen.queryByText(/^Meta de sede/)).toBeNull();
        expect(screen.getByText("Bonos vigentes").closest("section")?.textContent).toContain("1");
    });
    it("muestra la escala sin dejar editarla, y el bono a quien reporta", () => {
        show("BORRADOR", {
            penalties: [
                { ...penalty(1, 1), codigo: "ATC_FRAUDE_DIGITAL", nombre: "Tolerancia cero digital", montoReferencia: 0 },
                { ...penalty(3, 1), codigo: "ATC_ERROR_DATOS", montoBono: 1 },
            ],
        });
        expect(screen.getByText("Según escala")).toBeTruthy();
        expect(screen.getByText(/100 % de las comisiones del mes/)).toBeTruthy();
        expect(screen.getByText("Bono por reportar: S/ 1.00")).toBeTruthy();
        expect(screen.queryByRole("spinbutton", { name: /Tolerancia/ })).toBeNull();
    });
    it("mantiene una versión publicada en solo lectura", () => {
        show("PUBLICADO");
        expect(screen.getByRole("spinbutton", { name: /^Llamadas/ }).hasAttribute("disabled")).toBe(true);
        expect(screen.getByRole("button", { name: "Guardar parámetros" }).hasAttribute("disabled")).toBe(true);
    });
    it("informa desde cuándo se aplicarán las tarifas guardadas", async () => {
        show();
        mocks.saveParameters.mockResolvedValueOnce({ parametros_guardados: 1, tarifas_desde: "2026-10-05" });
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Llamadas/ }), { target: { value: "0.3" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("success", expect.stringContaining("Tarifas desde")));
        expect(screen.getByText(/rige desde hoy/)).toBeTruthy();
    });
    it("guarda varios campos con una llamada y conserva cambios ante un conflicto", async () => {
        show();
        mocks.saveParameters.mockRejectedValueOnce({ message: "Otro usuario cambió el parámetro" });
        fireEvent.change(screen.getByRole("spinbutton", { name: /^Llamadas/ }), { target: { value: "0.3" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: /Monto Error de datos/ }), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error", "Otro usuario cambió el parámetro"));
        expect(mocks.saveParameters).toHaveBeenCalledTimes(1);
        expect(mocks.saveParameters.mock.calls[0][1]).toHaveLength(2);
        expect(onChanged).not.toHaveBeenCalled();
        expect(screen.getByRole("spinbutton", { name: /^Llamadas/ }).getAttribute("value")).toBe("0.3");
    });
});
