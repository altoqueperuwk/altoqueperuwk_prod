import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { BonoMesAdminPage } from "./bono-mes-admin-page";
import type { EvidenciaTipo } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ get: vi.fn(), validate: vi.fn() }));
vi.mock("./bono-automatico.service", () => ({ getSeleccionBonoMes: mocks.get, validarSeleccionBonoMes: mocks.validate }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./tarjeta-tercero-form", () => ({ fechaLima: () => "2026-10-18" }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});
const type = { id: 1, codigo: "COLABORADOR_MES_ATENCIONES", nombre: "Colaborador del mes por atenciones" } as EvidenciaTipo;

it("presenta una preselección auditable y distingue al candidato recomendado", async () => {
    mocks.get.mockResolvedValue({
        periodo: "2026-10-01",
        codigo: type.codigo,
        estado: "PRESELECCION_VALIDABLE",
        criterio_principal: "Mayor número de atenciones efectivas",
        desempate: "Primero el otro indicador, después menor tardanza",
        elegibilidad: "Puntualidad conservada",
        importe_referencia: 100,
        candidatos: [
            {
                id_colaborador: 7,
                nombre: "Asesora Uno",
                documento: "12345678",
                sede: "Lince",
                atenciones: 12,
                calificaciones_4_5: 4,
                minutos_tarde: 5,
                estado_puntualidad: "CONSERVA",
                motivo_elegibilidad: "Elegible",
                importe_referencia: 100,
                elegible: true,
                puesto: 1,
                es_preseleccionado: true,
                requiere_desempate: false,
            },
        ],
    });
    render(<BonoMesAdminPage type={type} />);
    expect(await screen.findByText("Preselección lista para validar")).toBeVisible();
    await waitFor(() => expect(screen.getByText("Asesora Uno")).toBeVisible());
    expect(within(screen.getByRole("table")).getByText("Preselección")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ver criterios de selección" })).toBeInTheDocument();
});

it("no elige automáticamente cuando persiste un empate", async () => {
    mocks.get.mockResolvedValue({
        periodo: "2026-10-01",
        codigo: type.codigo,
        estado: "DESEMPATE_ADMINISTRATIVO",
        criterio_principal: "Más atenciones",
        desempate: "Revisión justificada",
        elegibilidad: "Puntualidad conservada",
        importe_referencia: 100,
        candidatos: [
            {
                id_colaborador: 7,
                nombre: "Asesora Uno",
                documento: "12345678",
                sede: "Lince",
                atenciones: 12,
                calificaciones_4_5: 4,
                minutos_tarde: 0,
                estado_puntualidad: "CONSERVA",
                motivo_elegibilidad: "Elegible",
                importe_referencia: 100,
                elegible: true,
                puesto: 1,
                es_preseleccionado: false,
                requiere_desempate: true,
            },
        ],
    });
    render(<BonoMesAdminPage type={type} />);
    expect(await screen.findByText("Desempate requiere revisión")).toBeVisible();
    await waitFor(() => expect(within(screen.getByRole("table")).getByText("Pendiente")).toBeVisible());
    expect(within(screen.getByRole("table")).queryByText("Preselección", { exact: true })).toBeNull();
    expect(mocks.validate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Resolver y validar" }));
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent(/al menos 10 caracteres/);
    expect(mocks.validate).not.toHaveBeenCalled();
});

it("expone los motivos de exclusión por puntualidad o disciplina", async () => {
    mocks.get.mockResolvedValue({
        periodo: "2026-10-01",
        codigo: type.codigo,
        estado: "SIN_CANDIDATOS",
        criterio_principal: "Más atenciones",
        desempate: "Revisión justificada",
        elegibilidad: "Puntualidad conservada",
        importe_referencia: null,
        candidatos: [
            {
                id_colaborador: 8,
                nombre: "Asesora Dos",
                documento: "87654321",
                sede: "Sur",
                atenciones: 9,
                calificaciones_4_5: 2,
                minutos_tarde: 8,
                estado_puntualidad: "PERDIDO",
                motivo_elegibilidad: "Tardanza mayor de cinco minutos",
                importe_referencia: null,
                elegible: false,
                puesto: null,
                es_preseleccionado: false,
                requiere_desempate: false,
            },
        ],
    });
    render(<BonoMesAdminPage type={type} />);
    await waitFor(() => expect(screen.getByText("Asesora Dos")).toBeVisible());
    expect(within(screen.getByRole("table")).getByText("No cumple", { selector: "span" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ver detalle de Asesora Dos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar preselección" })).toBeNull();
    expect(within(screen.getByRole("table")).queryByText("Preselección", { exact: true })).toBeNull();
});

it("no presenta el importe nulo de una preselección pendiente como S/ 0.00", async () => {
    mocks.get.mockResolvedValue({
        periodo: "2026-10-01",
        codigo: type.codigo,
        estado: "ASISTENCIA_PENDIENTE",
        criterio_principal: "Mayor número de atenciones",
        desempate: "Revisión justificada",
        elegibilidad: "Puntualidad conservada",
        importe_referencia: null,
        candidatos: [],
    });
    render(<BonoMesAdminPage type={type} />);
    expect(await screen.findByText("Por confirmar")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Validar preselección|Resolver y validar/ })).toBeNull();
    expect(screen.queryByText(/Premio de referencia: S\/ 0\.00/)).toBeNull();
});

it("confirma la preselección y comunica que impactará la preliquidación", async () => {
    mocks.validate.mockResolvedValue({ id_evento: 21, estado: "APROBADO", importe: 100, idempotente: false });
    mocks.get.mockResolvedValue({
        periodo: "2026-10-01",
        codigo: type.codigo,
        estado: "PRESELECCION_VALIDABLE",
        criterio_principal: "Mayor número de atenciones",
        desempate: "Otro indicador y tardanza",
        elegibilidad: "Puntualidad conservada",
        importe_referencia: 100,
        candidatos: [
            {
                id_colaborador: 9,
                nombre: "Asesora Tres",
                documento: "11112222",
                sede: "Lince",
                atenciones: 10,
                calificaciones_4_5: 3,
                minutos_tarde: 1,
                estado_puntualidad: "CONSERVA",
                motivo_elegibilidad: "Elegible",
                importe_referencia: 100,
                elegible: true,
                puesto: 1,
                es_preseleccionado: true,
                requiere_desempate: false,
            },
        ],
    });
    render(<BonoMesAdminPage type={type} />);
    fireEvent.click(await screen.findByRole("button", { name: "Validar preselección" }));
    await waitFor(() => expect(screen.getByText(/Se incorporará a la preliquidación/)).toBeVisible());
    expect(mocks.validate).toHaveBeenCalledWith(type.codigo, "2026-10", 9, "");
});
