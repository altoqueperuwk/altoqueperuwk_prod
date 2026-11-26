import type { ReactNode } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { ColaboradorMesPersonalPage } from "../evidencias/colaborador-mes-personal-page";
import type { EvidenciaEvento } from "../evidencias/evidencias.types";
import { OperacionTrazabilidad } from "../evidencias/operacion-trazabilidad";
import { atcConceptMenus } from "./compensaciones-navigation";

const mocks = vi.hoisted(() => ({ atenciones: vi.fn(), ratings: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../atenciones/atenciones.service", () => ({ atencionesService: { list: mocks.atenciones } }));
vi.mock("../evidencias/evidencias.service", () => ({ evidenciasService: { getRatings: mocks.ratings } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/application/date-picker/month-picker", () => ({
    MonthPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <input aria-label="Mes" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));
vi.mock("@/components/base/buttons/button", () => ({
    Button: ({ children, onClick, isDisabled }: { children: ReactNode; onClick: () => void; isDisabled?: boolean }) => (
        <button onClick={onClick} disabled={isDisabled}>
            {children}
        </button>
    ),
}));
vi.mock("@/components/base/input/input", () => ({
    Input: ({ label, value, onChange, isDisabled }: { label: string; value: string; onChange?: (v: string) => void; isDisabled?: boolean }) => (
        <input aria-label={label} value={value} disabled={isDisabled} onChange={(e) => onChange?.(e.target.value)} />
    ),
}));
vi.mock("./compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ isAdvisor: true, isAdministrator: false, isResolving: false }) }));
vi.mock("@/components/shared/data-table", () => ({
    DataTable: ({ data, toolbar, onPageChange }: { data: unknown[]; toolbar?: ReactNode; onPageChange: (v: number) => void }) => (
        <div data-testid="table">
            {toolbar}
            <pre>{JSON.stringify(data)}</pre>
            <button onClick={() => onPageChange(2)}>Página siguiente</button>
        </div>
    ),
}));
afterEach(cleanup);
beforeEach(() => {
    vi.resetAllMocks();
    mocks.atenciones.mockResolvedValue({ items: [], total: 0, validas: 0 });
    mocks.ratings.mockResolvedValue({ items: [], totalPages: 1 });
    mocks.rpc.mockResolvedValue({ data: { items: [], total: 0 }, error: null });
});

describe("Menú ATC según conceptos", () => {
    it("conserva permisos y evita un acceso redundante de tardanza", () => {
        const input = [{ label: "Personal", items: [{ label: "Puntualidad", href: "/compensaciones/otros-bonos/bono_puntualidad" }] }];
        const result = atcConceptMenus(input);
        expect(result).toEqual([]);
        expect(input[0].items).toHaveLength(1);
        expect(input[0].items[0].label).toBe("Puntualidad");
        expect(result.flatMap((g) => g.items ?? []).some((i) => i.href?.includes("liquidaciones"))).toBe(false);
    });
    it("consolida los conceptos en una consulta propia sin abrir Incidencias", () => {
        const result = atcConceptMenus([
            {
                label: "Liquidaciones",
                items: [
                    { label: "Mi sueldo", href: "/compensaciones/liquidaciones" },
                    { label: "Resumen", href: "/compensaciones/resumen" },
                    { label: "Anterior", href: "/compensaciones/mis-bonos-descuentos" },
                ],
            },
        ]);
        expect(result.map((group) => group.label)).toEqual(["General"]);
        expect(result[0].items?.map(({ label, href }) => ({ label, href }))).toEqual([
            { label: "Centro de Trabajo", href: "/compensaciones/resumen?vista=centro" },
            { label: "Mis Bonos y Penalidades", href: "/compensaciones/resumen" },
        ]);
        expect(atcConceptMenus(result)).toEqual(result);
        expect(atcConceptMenus([{ label: "Liquidaciones", items: [{ label: "Mi sueldo", href: "/compensaciones/liquidaciones" }] }])).toEqual([]);
        expect(atcConceptMenus([])).toEqual([]);
    });
});

it("colaborador del mes tiene dos tablas personales con paginación independiente", async () => {
    render(<ColaboradorMesPersonalPage />);
    expect(screen.getByRole("heading", { name: "Atenciones efectivas en Pancake" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Calificaciones por estrellas" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.atenciones).toHaveBeenCalled());
    await waitFor(() => expect(mocks.ratings).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: "Página siguiente" })[0]);
    await waitFor(() => expect(mocks.atenciones).toHaveBeenLastCalledWith(expect.any(String), 2, 20));
    expect(mocks.ratings).toHaveBeenCalledTimes(1);
    expect(mocks.ratings.mock.calls[0][0]).toMatchObject({ advisor: 0, page: 1, pageSize: 20 });
    expect(screen.queryByRole("button", { name: /validar|aprobar/i })).toBeNull();
});

const traceEvent = { id: 10, estado: "PENDIENTE", datos: { cliente_documento: "00000000" }, referencias: [] } as unknown as EvidenciaEvento;
it("vincular exige conversación y envía únicamente la operación elegida del servidor", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { items: [{ id: 7, codigo: "QA-7", servicio: "POS", dni: "00000000", cliente: "QA" }] }, error: null });
    const changed = vi.fn();
    render(<OperacionTrazabilidad item={traceEvent} onChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar operación pagada" }));
    fireEvent.click(await screen.findByRole("button", { name: "Vincular" }));
    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent("HTTPS");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Enlace de la conversación de Pancake"), { target: { value: "https://pancake.vn/test" } });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenLastCalledWith("f_post_compensacion_evento_operacion_vincular", {
        p_id_evento: 10,
        p_id_operacion: 7,
        p_pancake: "https://pancake.vn/test",
    });
});

it("los eventos aprobados no permiten cambiar la trazabilidad", () => {
    render(<OperacionTrazabilidad item={{ ...traceEvent, estado: "APROBADO" }} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Buscar operación pagada" })).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
});
