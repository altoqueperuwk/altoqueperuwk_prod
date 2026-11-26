import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { alertaContrapartida } from "./alerta-temprana-contrapartida";
import { AlertaTempranaPage } from "./alerta-temprana-page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), review: vi.fn(), remove: vi.fn(), operations: vi.fn(), isStoreManager: false }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isStoreManager: mocks.isStoreManager }) }));
vi.mock("./marketing.service", () => ({ marketingService: mocks }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ navegacion: { rutas_permitidas: [] } }) }));

const item = (extra: Record<string, unknown>) => ({
    id: 7,
    titulo: "Alerta del equipo",
    descripcion: "Datos comprobados",
    fecha: "2026-11-01",
    estado: "PENDIENTE",
    importe: null,
    captura: {},
    usuario: "Marketing",
    responsable: "ASESOR DEMOSTRACIÓN",
    estado_calculo: "OK",
    motivo_calculo: "",
    puede_editar: false,
    puede_revisar: false,
    ...extra,
});
const panel = (items: unknown[]) => ({
    es_admin: false,
    puede_registrar: true,
    id_colaborador: 51,
    total: items.length,
    total_paginas: 1,
    items,
    responsables: [{ id: 3, nombre: "Asesor Demo", sede: "Lince" }],
    kpis: { pendientes: 1, aprobados: 1, rechazados: 0 },
});
const open = () =>
    render(
        <MemoryRouter>
            <AlertaTempranaPage />
        </MemoryRouter>,
    );
beforeEach(() => {
    vi.resetAllMocks();
    mocks.isStoreManager = false;
});
afterEach(cleanup);

it("Alerta Temprana usa un solo estado, indica quién valida y no ofrece Liquidado ni Estado de validación", async () => {
    mocks.list.mockResolvedValue(panel([item({})]));
    open();
    await screen.findByText("Alerta del equipo");
    expect(screen.getByText(/Valida: Jefe de Tienda; aprueba: Administrador/)).toBeInTheDocument();
    expect(screen.getByText("Por validar")).toBeInTheDocument();
    expect(screen.getByLabelText(/DNI \(opcional\)/)).toBeInTheDocument();
    expect(screen.queryByText("Estado de validación")).toBeNull();
    expect(screen.queryByText("Liquidado")).toBeNull();
    expect(screen.getByText("Registrar Alerta")).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith("ALERTA_TEMPRANA", expect.any(String), "", "", 1, 20);
});

it("la alerta aprobada muestra el bono de Marketing y la penalidad ligada; sin vínculo del servidor no falla", async () => {
    mocks.list.mockResolvedValue(
        panel([
            item({
                id: 1,
                titulo: "Con vínculo",
                estado: "APROBADO",
                importe: 0.5,
                vinculo_penalidad: {
                    importe_bono: 0.5,
                    codigo_penalidad: "ATC_ERROR_DATOS",
                    nombre_penalidad: "Error de datos",
                    importe_descuento: 0.5,
                    penalidad_propia_previa: false,
                },
            }),
            item({ id: 2, titulo: "Sin vínculo", estado: "PENDIENTE" }),
        ]),
    );
    open();
    await screen.findByText("Con vínculo");
    expect(screen.getByText(/Bono Marketing/)).toBeInTheDocument();
    expect(screen.getByText(/Penalidad del asesor Error de datos/)).toBeInTheDocument();
    expect(screen.getByText("Sin vínculo")).toBeInTheDocument();
});

it("la contrapartida es tolerante: solo aprobadas, solo con vínculo y sin duplicar el descuento", () => {
    const vinculo = { importe_bono: 0.5, codigo_penalidad: "ATC_ERROR_DATOS", importe_descuento: 0.5, penalidad_propia_previa: false };
    expect(alertaContrapartida({ estado: "PENDIENTE", vinculo_penalidad: vinculo })).toBeNull();
    expect(alertaContrapartida({ estado: "APROBADO" })).toBeNull();
    expect(alertaContrapartida({ estado: "APROBADO", vinculo_penalidad: {} })).toBeNull();
    expect(alertaContrapartida({ estado: "APROBADO", vinculo_penalidad: vinculo })).toMatchObject({
        bono: 0.5,
        penalidadCodigo: "ATC_ERROR_DATOS",
        cubierta: false,
    });
    expect(alertaContrapartida({ estado: "APROBADO", vinculo_penalidad: { ...vinculo, penalidad_propia_previa: true } })?.cubierta).toBe(true);
});

it("edita y elimina solo el registro propio pendiente sin validar", async () => {
    mocks.list.mockResolvedValue(panel([item({ puede_editar: true, captura: { titulo: "Alerta del equipo", dni: "" } })]));
    mocks.remove.mockResolvedValue({ id: 7 });
    open();
    await screen.findByText("Alerta del equipo");
    fireEvent.click(screen.getByRole("button", { name: /Editar registro/i }));
    expect(screen.getByText("Editar Registro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Borrador" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar registro/i }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(7));
});

it("jefatura revisa sin formulario de registro", async () => {
    mocks.isStoreManager = true;
    mocks.list.mockResolvedValue({ ...panel([item({ puede_revisar: true })]), puede_registrar: false, es_revisor: true });
    open();
    await screen.findByText("Alerta del equipo");
    expect(screen.queryByText("Registrar Alerta")).toBeNull();
    expect(screen.getByRole("button", { name: /Revisar registro/i })).toBeInTheDocument();
});
