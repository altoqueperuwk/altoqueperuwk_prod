import type { ReactNode } from "react";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { AuditoriaCuadreCierrePage, otrasOpcionesCuadre } from "./auditoria-cuadre-cierre-page";

const mocks = vi.hoisted(() => ({
    types: vi.fn(),
    list: vi.fn(),
    penalidades: vi.fn(),
    catalog: vi.fn(),
    colaboradores: vi.fn(),
    profile: { userId: 11, isResolving: false, isAdministrator: false },
}));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ catalogos: { estados: [] } }) }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => mocks.profile }));
vi.mock("../evidencias/evidencias.service", () => ({ evidenciasService: { getTypes: mocks.types, getList: mocks.list } }));
vi.mock("./incidencias.service", () => ({ incidenciasService: { getCatalog: mocks.catalog, getList: mocks.penalidades } }));
vi.mock("./pagos-cuadre.service", () => ({ pagosCuadreService: { colaboradores: mocks.colaboradores, registrarCuadre: vi.fn() } }));
vi.mock("../evidencias/evidencia-detail-modal", () => ({ EvidenciaDetailModal: () => null }));
vi.mock("./incidencia-detail-modal", () => ({ IncidenciaDetailModal: () => null }));

const page = (items: unknown[]) => ({ items, total: items.length, totalPages: 1, page: 1, pageSize: 100, resumen: {} });
const pena = (id: number, penalidadNombre: string) => ({
    id,
    penalidadNombre,
    motivo: "Motivo de prueba",
    fechaEvento: "2026-11-21T10:00:00Z",
    estado: "PENDIENTE",
    importeAprobado: null,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.isAdministrator = false;
    mocks.types.mockResolvedValue([{ id: 12, codigo: "CUADRE_PERFECTO" }]);
    mocks.list.mockResolvedValue(
        page([
            {
                id: 1,
                estado: "APROBADO",
                fechaEvento: "2026-11-01T10:00:00Z",
                periodoImputacion: "2026-10-01",
                importeAprobado: 100,
                beneficiarioNombre: "Operador",
            },
        ]),
    );
    mocks.penalidades.mockResolvedValue(page([pena(7, "Descuadre"), pena(8, "Cierre diario incompleto"), pena(9, "Retraso de vouchers")]));
    mocks.catalog.mockResolvedValue({ tipos: [], reportantes: [], responsables: [], penalidades: [] });
    mocks.colaboradores.mockResolvedValue([]);
});
afterEach(cleanup);

describe("Auditoría Cuadre y Cierre", () => {
    it("Pagos consulta cuadre, descuadre y cierre incompleto, sin formulario de registro", async () => {
        render(<AuditoriaCuadreCierrePage />);
        await screen.findAllByText("Descuadre");
        expect(screen.getAllByText("Cuadre Perfecto").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Cierre diario incompleto").length).toBeGreaterThan(0);
        expect(screen.queryByText("Retraso de vouchers")).toBeNull();
        expect(screen.queryByText("Registrar Cuadre o Cierre")).toBeNull();
        expect(mocks.colaboradores).not.toHaveBeenCalled();
        expect(mocks.penalidades).toHaveBeenCalledWith(expect.objectContaining({ excludeCodes: otrasOpcionesCuadre }));
    });
    it("Administración ve el formulario de registro y la lista de colaboradores de Pagos", async () => {
        mocks.profile.isAdministrator = true;
        render(<AuditoriaCuadreCierrePage />);
        await screen.findByText("Registrar Cuadre o Cierre");
        await waitFor(() => expect(mocks.colaboradores).toHaveBeenCalled());
        expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    });
    it("no mezcla las opciones con su propia pantalla", () => {
        expect(otrasOpcionesCuadre).toContain("PAG_JEFE_SUPERIOR_PAGOS_UNIFORME");
        expect(otrasOpcionesCuadre).toContain("PAG_VIRTUAL_RETRASO_VOUCHER");
        expect(otrasOpcionesCuadre.some((code) => code.endsWith("_DESCUADRE") || code.endsWith("_CIERRE_INCOMPLETO"))).toBe(false);
    });
});
