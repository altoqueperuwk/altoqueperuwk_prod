import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { CazaErroresForm } from "./caza-errores-form";
import type { IncidenciaCatalogo } from "./incidencias.types";

const mocks = vi.hoisted(() => ({ getCatalog: vi.fn(), createCazaErrores: vi.fn(), sendCazaErrores: vi.fn() }));
vi.mock("./incidencias.service", () => ({ incidenciasService: mocks }));

vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({
    useClienteLookup: () => ({ result: { id: 7, nombre: "Cliente de prueba" }, isLoading: false }),
}));
const catalog: IncidenciaCatalogo = {
    tipos: [{ id: 1, codigo: "AUDITORIA_ACTIVA", nombre: "Auditoría", categoria: "AUDITORIA_PAGO", requiereCliente: true, requiereOperacion: false }],
    reportantes: [],
    responsables: [{ id: 2, nombre: "Colaborador de prueba", documento: "99999999", idSucursal: 1, sucursal: "Sede de prueba" }],
    penalidades: ["ATC_ERROR_DATOS", "ATC_ERROR_REGISTRO", "ATC_MAL_FLUJO", "ATC_ABANDONO_CHAT", "ATC_PROCESO_AIRE"].map((codigo, i) => ({
        id: i + 1,
        codigo,
        nombre: codigo,
        descripcion: null,
        montoReferencia: 2,
        montoBonoReportante: 1,
        requiereRespuesta: false,
    })),
};
const choose = async (label: RegExp, name: string) => {
    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(await screen.findByRole("option", { name }));
};
beforeEach(() => {
    mocks.getCatalog.mockResolvedValue(catalog);
    mocks.createCazaErrores.mockResolvedValue(20);
    mocks.sendCazaErrores.mockResolvedValue(undefined);
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("Selección de hallazgos", () => {
    it("SafetyPay ofrece únicamente monto vacío/erróneo y código vacío", () => {
        render(<CazaErroresForm option="MAL_FLUJO_SAFETYPAY" catalog={catalog} onSave={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.getAllByRole("checkbox")).toHaveLength(2);
        expect(screen.getByRole("checkbox", { name: "Monto vacío/erróneo" })).toBeVisible();
        expect(screen.getByRole("checkbox", { name: "Código vacío" })).toBeVisible();
    });
    it("SafetyPay guarda ambas observaciones y confirma el envío sin evidencia", async () => {
        const onSave = vi.fn();
        render(<CazaErroresForm option="MAL_FLUJO_SAFETYPAY" catalog={catalog} onSave={onSave} onCancel={vi.fn()} />);
        await choose(/Colaborador/, "Colaborador de prueba");
        await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
        fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "99999999" } });
        fireEvent.click(screen.getByRole("checkbox", { name: "Monto vacío/erróneo" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Código vacío" }));
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(mocks.createCazaErrores).toHaveBeenCalledWith(
            expect.objectContaining({ idPenalidadTipo: 3, motivo: "Observaciones: Monto vacío/erróneo; Código vacío", evidenciaUrl: "" }),
            "MAL_FLUJO_SAFETYPAY",
            expect.any(String),
        );
        expect(mocks.sendCazaErrores).toHaveBeenCalledWith(20, "MAL_FLUJO_SAFETYPAY");
        expect(screen.getByRole("checkbox", { name: "Código vacío" })).not.toBeChecked();
    });
    it("Conversación usa checkbox exclusivos y descarta observaciones de otro concepto", () => {
        render(<CazaErroresForm option="CONVERSACION_PROCESO" catalog={catalog} onSave={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /Tipo de hallazgo/ })).toBeNull();
        for (const name of ["Demora (+20 min)", "Chat desatendido", "Voucher ignorado", "Cuenta incompleta", "Tarjeta incompleta"])
            expect(screen.getByRole("checkbox", { name })).toBeVisible();
        fireEvent.click(screen.getByRole("checkbox", { name: "Abandono de chat" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Chat desatendido" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Proceso al aire" }));
        expect(screen.getByRole("checkbox", { name: "Abandono de chat" })).not.toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Chat desatendido" })).not.toBeChecked();
        fireEvent.click(screen.getByRole("checkbox", { name: "Abandono de chat" }));
        expect(screen.getByRole("checkbox", { name: "Chat desatendido" })).not.toBeChecked();
    });
    it.each([
        ["Chat desatendido", "Abandono de chat", 4],
        ["Cuenta incompleta", "Proceso al aire", 5],
    ])("seleccionar %s directamente elige el concepto y guarda su penalidad", async (observation, concept, penaltyId) => {
        render(<CazaErroresForm option="CONVERSACION_PROCESO" catalog={catalog} onSave={vi.fn()} onCancel={vi.fn()} />);
        await choose(/Colaborador/, "Colaborador de prueba");
        await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
        fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "99999999" } });
        fireEvent.click(screen.getByRole("checkbox", { name: observation }));
        expect(screen.getByRole("checkbox", { name: concept })).toBeChecked();
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() =>
            expect(mocks.createCazaErrores).toHaveBeenCalledWith(
                expect.objectContaining({ idPenalidadTipo: penaltyId, motivo: `Hallazgo: ${concept}\nObservaciones: ${observation}` }),
                "CONVERSACION_PROCESO",
                expect.any(String),
            ),
        );
        await waitFor(() => expect(mocks.sendCazaErrores).toHaveBeenCalledWith(20, "CONVERSACION_PROCESO"));
    });
    it.each([
        ["Error de datos", 1],
        ["Error Registro Manual", 2],
        ["Error de Códigos", 2],
    ])("guarda %s con su penalidad y conserva la distinción en el motivo", async (choice, penaltyId) => {
        render(<CazaErroresForm option="ERROR_REGISTRO" catalog={catalog} onSave={vi.fn()} onCancel={vi.fn()} />);
        expect(screen.getAllByRole("checkbox")).toHaveLength(3);
        await choose(/Colaborador/, "Colaborador de prueba");
        await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
        fireEvent.change(screen.getByRole("textbox", { name: /Nro. Documento/ }), { target: { value: "99999999" } });
        fireEvent.click(screen.getByRole("checkbox", { name: choice }));
        await choose(/Tipo de error/, "DNI incorrecto");
        fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
        await waitFor(() =>
            expect(mocks.createCazaErrores).toHaveBeenCalledWith(
                expect.objectContaining({ idPenalidadTipo: penaltyId, motivo: `Hallazgo: ${choice}\nTipo de error: DNI incorrecto`, evidenciaUrl: "" }),
                "ERROR_REGISTRO",
                expect.any(String),
            ),
        );
        await waitFor(() => expect(mocks.sendCazaErrores).toHaveBeenCalledWith(20, "ERROR_REGISTRO"));
    });
    it("cambiar de registro manual a código limpia el detalle aunque compartan penalidad", async () => {
        render(<CazaErroresForm option="ERROR_REGISTRO" catalog={catalog} onSave={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Error Registro Manual" }));
        await choose(/Tipo de error/, "Nombre incorrecto");
        fireEvent.click(screen.getByRole("checkbox", { name: "Error de Códigos" }));
        expect(screen.getByRole("checkbox", { name: "Error Registro Manual" })).not.toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Error de Códigos" })).toBeChecked();
        expect(screen.getByRole("button", { name: /Tipo de error/ })).toHaveTextContent("Seleccionar tipo de error");
    });
});
