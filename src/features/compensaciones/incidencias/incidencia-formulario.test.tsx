import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { IncidenciaPopup } from "./incidencia-popup";
import type { IncidenciaCatalogo } from "./incidencias.types";

const mocks = vi.hoisted(() => ({ getCatalog: vi.fn(), create: vi.fn(), send: vi.fn(), savePersonal: vi.fn() }));
const profile = vi.hoisted(() => ({ isStoreManager: false }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => profile }));
vi.mock("./incidencias.service", () => ({ incidenciasService: mocks }));

vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({ useClienteLookup: () => ({ result: null, isLoading: false }) }));
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    profile.isStoreManager = false;
});

const person = (id: number, idSucursal: number, nombre: string) => ({
    id,
    idSucursal,
    nombre,
    documento: `9998000${id}`,
    sucursal: idSucursal === 1 ? "Lince" : "Norte",
});
const catalog: IncidenciaCatalogo = {
    tipos: [{ id: 1, codigo: "PENALIDAD", nombre: "Penalidad", categoria: "PENALIDAD", requiereCliente: false, requiereOperacion: false }],
    reportantes: [person(3, 1, "Reportante ficticio")],
    responsables: [person(1, 1, "Responsable Lince"), person(2, 2, "Responsable Norte")],
    penalidades: [],
};
const openForm = () => render(<IncidenciaPopup isOpen inline catalog={catalog} onClose={vi.fn()} onSave={vi.fn()} />);
const choose = async (label: string, option: string) => {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(profile.isStoreManager && label === "Responsable" ? "Colaborador" : label) }));
    fireEvent.click(await screen.findByRole("option", { name: option }));
};

describe("Formulario de penalidades con catálogo poblado", () => {
    it("jefatura despliega los responsables autorizados y carga sus penalidades al seleccionar", async () => {
        profile.isStoreManager = true;
        mocks.getCatalog.mockResolvedValue({ ...catalog, penalidades: [] });
        render(
            <IncidenciaPopup
                isOpen
                inline
                catalog={{ ...catalog, responsables: [catalog.reportantes[0], catalog.responsables[0]] }}
                onClose={vi.fn()}
                onSave={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: /Colaborador\s*\*/ }));
        expect(await screen.findByRole("option", { name: "Responsable Lince" })).toBeVisible();
        expect(screen.queryByRole("option", { name: "Reportante ficticio" })).toBeNull();
        fireEvent.click(screen.getByRole("option", { name: "Responsable Lince" }));
        await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalledWith(1, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)));
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.send).not.toHaveBeenCalled();
    });
    it.each([{ responsables: [] }, { responsables: [catalog.reportantes[0]] }])(
        "explica un catálogo sin responsables elegibles y bloquea el envío",
        ({ responsables }) => {
            profile.isStoreManager = true;
            render(<IncidenciaPopup isOpen inline catalog={{ ...catalog, responsables }} onClose={vi.fn()} onSave={vi.fn()} />);
            expect(screen.getByRole("button", { name: /Colaborador\s*\*/ })).toBeDisabled();
            expect(screen.getByText(/No hay colaboradores habilitados/)).toBeVisible();
            expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Borrador" })).toBeDisabled();
        },
    );
    it("Uniforme fija su concepto y guarda mediante una llamada atómica pese al doble clic", async () => {
        profile.isStoreManager = true;
        mocks.getCatalog.mockResolvedValue({
            ...catalog,
            penalidades: [
                {
                    id: 80,
                    codigo: "ATC_UNIFORME",
                    nombre: "Falta de uniforme",
                    descripcion: null,
                    montoReferencia: 10,
                    montoBonoReportante: null,
                    requiereRespuesta: true,
                },
                {
                    id: 81,
                    codigo: "ATC_ERROR",
                    nombre: "Error de datos",
                    descripcion: null,
                    montoReferencia: 2,
                    montoBonoReportante: null,
                    requiereRespuesta: true,
                },
            ],
        });
        mocks.savePersonal.mockResolvedValue(100);
        render(<IncidenciaPopup isOpen inline concept="UNIFORME" catalog={catalog} onClose={vi.fn()} onSave={vi.fn()} />);
        await choose("Responsable", "Responsable Lince");
        await waitFor(() => expect(screen.getByRole("button", { name: /Penalidad/ })).not.toBeDisabled());
        fireEvent.click(screen.getByRole("button", { name: /Penalidad/ }));
        expect(screen.queryByRole("option", { name: /Error de datos/ })).toBeNull();
        fireEvent.click(await screen.findByRole("option", { name: "Falta de uniforme" }));
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "Hecho observado con sustento" } });
        const save = screen.getByRole("button", { name: "Guardar" });
        fireEvent.click(save);
        fireEvent.click(save);
        await waitFor(() => expect(mocks.savePersonal).toHaveBeenCalledTimes(1));
        expect(mocks.savePersonal).toHaveBeenCalledWith(
            expect.objectContaining({ idResponsable: 1, idPenalidadTipo: 80 }),
            "UNIFORME",
            expect.any(String),
            true,
        );
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.send).not.toHaveBeenCalled();
    });
    it("jefatura registra en panel compacto con usuario propio y Cancelar limpia sin guardar", async () => {
        profile.isStoreManager = true;
        openForm();
        expect(screen.getByRole("heading", { name: "Registrar Hallazgo" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Sede responsable/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Reportante/ })).toBeNull();
        expect(screen.queryByLabelText("Fecha y hora")).toBeNull();
        fireEvent.change(screen.getByRole("textbox", { name: /Motivo/ }), { target: { value: "Sustento de prueba" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(screen.getByRole("textbox", { name: /Motivo/ })).toHaveValue("");
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.send).not.toHaveBeenCalled();
    });
    it("filtra responsables por sede, presenta importes y los limpia al cambiar de sede", async () => {
        mocks.getCatalog.mockResolvedValue({
            ...catalog,
            penalidades: [
                { id: 8, codigo: "ERROR", nombre: "Error de datos", descripcion: null, montoReferencia: 2, montoBonoReportante: null, requiereRespuesta: true },
            ],
        });
        openForm();
        expect(screen.queryByRole("button", { name: /Tipo de reporte/ })).toBeNull();
        await choose("Sede responsable", "Norte");
        fireEvent.click(screen.getByRole("button", { name: /Responsable\s*\*/ }));
        expect(screen.queryByRole("option", { name: /Responsable Lince/ })).toBeNull();
        fireEvent.click(screen.getByRole("option", { name: /Responsable Norte/ }));
        await waitFor(() => expect(mocks.getCatalog).toHaveBeenCalledWith(2, expect.any(String)));
        await waitFor(() => expect(screen.getByRole("button", { name: /Penalidad aplicable/ }).hasAttribute("disabled")).toBe(false));
        await choose("Penalidad aplicable", "Error de datos · S/ 2.00");
        expect(screen.getByRole("region", { name: "Importes del reporte" })).toBeTruthy();
        expect(screen.getByText("No aplica")).toBeTruthy();
        await choose("Sede responsable", "Lince");
        expect(screen.queryByRole("region", { name: "Importes del reporte" })).toBeNull();
        expect(screen.getByRole("button", { name: /Penalidad aplicable/ }).hasAttribute("disabled")).toBe(true);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.send).not.toHaveBeenCalled();
    });
});
