import type { ReactNode } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "../shared/test-alerts";
import { EvidenciasPage } from "./evidencias-page";
import type { EvidenciaEvento } from "./evidencias.types";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../shared/compensacion-perfil", () => ({
    useCompensacionPerfil: () => ({ userId: 24, isAdvisor: true, isResolving: false }),
    advisorCanRegisterBonus: () => false,
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
vi.mock("@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup", () => ({ useClienteLookup: () => ({ result: null, isLoading: false }) }));
vi.mock("./evidencias.service", () => ({
    evidenciasService: {
        getList: mocks.list,
        getCallsContext: async () => ({ idUsuario: 24, idColaborador: 15, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false }),
        getCardContext: async () => ({ idUsuario: 24, idColaborador: 15, puedeRegistrar: true, puedeAprobar: false, puedeRevisar: false }),
    },
}));
vi.mock("../shared/compensacion-date-picker", () => ({
    CompensacionDatePicker: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
        <input aria-label={label} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

const row = {
    id: 7,
    idTipoEvento: 1,
    tipoCodigo: "LLAMADA_CONTACTO",
    tipoNombre: "Llamada",
    categoria: "LLAMADA",
    estado: "APROBADO",
    importeAprobado: 0.2,
    fechaEvento: "2026-11-17T15:30:00Z",
    datos: { cliente_nombre: "CLIENTE DEMOSTRACIÓN", cliente_documento: "00000001" },
    usuarioRegistraNombre: "EQUIPO DE PRUEBA",
    usuarioRegistraId: 24,
    beneficiarioNombre: "EQUIPO DE PRUEBA",
    sucursalOrigenNombre: "Sede de prueba",
    evidencia: [],
    referencias: [],
    revisiones: [],
} as unknown as EvidenciaEvento;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
        items: [row],
        totalPages: 1,
        resumen: { borradores: 0, pendientes: 0, aprobados: 1, rechazados: 0, anulados: 0, importeAprobado: 0.2 },
    });
});
afterEach(cleanup);

it.each(["LLAMADA", "TARJETA_TERCERO"] as const)("%s conserva nombres originales", async (category) => {
    render(<EvidenciasPage category={category} />);
    expect(await screen.findByText("Cliente Demostración")).toHaveAttribute("title", "CLIENTE DEMOSTRACIÓN");
    expect(screen.getByText("Equipo De Prueba")).toHaveAttribute("title", "EQUIPO DE PRUEBA");
    expect(screen.getByRole("columnheader", { name: "Monto" })).toBeTruthy();
});

it.each([
    ["LLAMADA", "Información de Llamadas", "S/ 0.20"],
    ["TARJETA_TERCERO", "Información de Auditoría Operaciones", "S/ 10.00"],
] as const)("%s explica el concepto y su monto trazable", async (category, title, amount) => {
    render(<EvidenciasPage category={category} />);
    fireEvent.click(await screen.findByRole("button", { name: title }));
    expect(await screen.findByRole("dialog", { name: title })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: title })).getByText(new RegExp(amount.replace(" ", "\\s*")))).toBeInTheDocument();
});

it("no envía rangos invertidos al filtrar automáticamente y retoma la consulta al corregirlos", async () => {
    render(<EvidenciasPage category="LLAMADA" />);
    await screen.findByText("Cliente Demostración");
    const count = mocks.list.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-11-30" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-11-01" } });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 350)));
    expect(mocks.list).toHaveBeenCalledTimes(count);
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-11-30" } });
    await waitFor(() =>
        expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ category: "LLAMADA", from: "2026-11-30", to: "2026-11-30", page: 1 })),
    );
});
