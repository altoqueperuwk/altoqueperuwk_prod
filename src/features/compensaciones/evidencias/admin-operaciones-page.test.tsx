// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminOperacionesPage, penalidadesEscalonada, penalidadesIndisciplina, penalidadesOperaciones } from "./admin-operaciones-page";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    incidencia: vi.fn(),
    evidencia: vi.fn(),
    getCatalog: vi.fn(),
}));
vi.mock("./admin-operaciones.service", () => ({ adminOperacionesService: mocks }));
vi.mock("../incidencias/incidencias.service", () => ({ incidenciasService: { getCatalog: mocks.getCatalog } }));
vi.mock("@/components/application/app-layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../shared/compensacion-heading", () => ({ CompensacionHeading: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../shared/compensacion-perfil", () => ({ useCompensacionPerfil: () => ({ userId: 1, isAdministrator: true }) }));
vi.mock("../incidencias/incidencia-popup", () => ({ IncidenciaPopup: () => <p>formulario de penalidades</p> }));
vi.mock("../incidencias/incidencia-detail-modal", () => ({
    IncidenciaDetailModal: ({ item }: { item: { id: number } | null }) => (item ? <p>revisión incidencia {item.id}</p> : null),
}));
vi.mock("./evidencia-detail-modal", () => ({
    EvidenciaDetailModal: ({ item }: { item: { id: number } | null }) => (item ? <p>revisión evidencia {item.id}</p> : null),
}));
vi.mock("./facturacion-revision-dialog", () => ({ FacturacionRevisionDialog: () => null }));
vi.mock("@/features/compensaciones/shared/compensacion-data-table", () => ({
    CompensacionDataTable: ({ data, columns, renderActions }: any) => (
        <table>
            <tbody>
                {data.map((row: any) => (
                    <tr key={row.id}>
                        {columns.map((column: any) => (
                            <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>
                        ))}
                        <td>{renderActions(row)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    ),
}));

const fila = (id: number, origen: string, tipo: string, concepto: string, validacion: string | null = null) => ({
    id,
    tipo,
    origen,
    concepto,
    descripcion: "detalle",
    colaborador: "Persona Prueba",
    cargo: "Facturacion",
    registrado_por: "Administrador",
    fecha_evento: "2026-11-20T15:00:00Z",
    estado_evento: "PENDIENTE",
    importe_aprobado: null,
    documento: null,
    validacion_jefe: validacion,
});

beforeEach(() => {
    mocks.list.mockResolvedValue({
        items: [fila(441, "INCIDENCIA", "PENALIDAD", "Error con solución"), fila(381, "EVIDENCIA", "BONO", "Reporte de abandono", "SIN_VALIDAR")],
        total: 2,
        total_paginas: 1,
        resumen: { pendientes: 2, bonos_aprobados: 0, penalidades_aprobadas: 0 },
    });
    mocks.getCatalog.mockResolvedValue({ tipos: [], reportantes: [], responsables: [], penalidades: [] });
    mocks.incidencia.mockResolvedValue({ id: 441 });
    mocks.evidencia.mockResolvedValue({ id: 381 });
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

it("muestra bonos y penalidades con la validación del Jefe y abre la revisión de cada flujo", async () => {
    render(<AdminOperacionesPage />);
    expect(await screen.findByText("Error con solución")).toBeInTheDocument();
    expect(screen.getByText("Reporte de abandono")).toBeInTheDocument();
    expect(screen.getByText("Sin validar")).toBeInTheDocument();
    expect(await screen.findByText("formulario de penalidades")).toBeInTheDocument();
    expect(mocks.list).toHaveBeenLastCalledWith({
        grupo: "OPERACIONES",
        tipo: "",
        concepto: "",
        perfil: "",
        estado: "",
        busqueda: "",
        pagina: 1,
        tamano: 20,
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Ver y revisar" })[0]);
    expect(await screen.findByText("revisión incidencia 441")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Ver y revisar" })[1]);
    expect(await screen.findByText("revisión evidencia 381")).toBeInTheDocument();
});

it("registra solo las penalidades de esta opción", () => {
    for (const codigo of [
        "FAC_ERROR_SOLUCION",
        "FAC_ERROR_SIN_SOLUCION",
        "PAG_CARTERA_RETRASO_VOUCHER",
        "PAG_JEFE_SUPERIOR_PAGOS_ERROR_PAGO_CRITICO",
        "JEFE_ERROR_SUPERVISION",
        "JEFE_ABANDONO_SOLIDARIO",
        "ATC_ERROR_DATOS",
        "ATC_ABANDONO_CHAT",
    ])
        expect(penalidadesOperaciones.test(codigo)).toBe(true);
    for (const codigo of ["FAC_UNIFORME", "JEFE_QUEJA_TARDIA", "PAG_CARTERA_CIERRE_INCOMPLETO", "ATC_UNIFORME", "PAG_OPERADOR_ALTA_DEMANDA_DESCUADRE"])
        expect(penalidadesOperaciones.test(codigo)).toBe(false);
});

it("en Indisciplina Colaborador consulta las faltas de todas las sedes con sede y descargo", async () => {
    mocks.list.mockResolvedValue({
        items: [{ ...fila(432, "INCIDENCIA", "PENALIDAD", "Falta de uniforme completo"), sede: "Sede Lince", descargo: "PENDIENTE" }],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 1, bonos_aprobados: 0, penalidades_aprobadas: 0 },
    });
    render(<AdminOperacionesPage grupo="INDISCIPLINA" />);
    expect(await screen.findByText("Falta de uniforme completo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Indisciplina Colaborador" })).toBeInTheDocument();
    expect(screen.getByText("Sede Lince")).toBeInTheDocument();
    expect(screen.queryByText("Bonos aprobados")).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ grupo: "INDISCIPLINA" }));
    for (const codigo of ["ATC_UNIFORME", "JEFE_INDISCIPLINA", "JEFE_QUEJA_TARDIA"]) expect(penalidadesIndisciplina.test(codigo)).toBe(true);
    expect(penalidadesIndisciplina.test("FAC_ERROR_SOLUCION")).toBe(false);
});

it("en Penalidad Escalonada cuenta confirmadas, sin montos, y lleva a Bonos del mes", async () => {
    mocks.list.mockResolvedValue({
        items: [{ ...fila(440, "INCIDENCIA", "PENALIDAD", "Error en cuadro de comisiones"), sede: "Sede Lince", descargo: "PRESENTADO" }],
        total: 1,
        total_paginas: 1,
        resumen: { pendientes: 0, bonos_aprobados: 0, penalidades_aprobadas: 0, penalidades_confirmadas: 1 },
    });
    render(<AdminOperacionesPage grupo="ESCALONADA" />);
    expect(await screen.findByText("Error en cuadro de comisiones")).toBeInTheDocument();
    expect(screen.getByText("Confirmadas")).toBeInTheDocument();
    expect(screen.queryByText("Penalidades aprobadas")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Aplicar escalonado en Bonos del mes" })).toHaveAttribute("href", "/compensaciones/bonos-mes");
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ grupo: "ESCALONADA" }));
    for (const codigo of ["JEFE_ERROR_CUADRO", "PAG_OPERADOR_ALTA_DEMANDA_ERROR_CUADRO"]) expect(penalidadesEscalonada.test(codigo)).toBe(true);
    expect(penalidadesEscalonada.test("PAG_OPERADOR_ALTA_DEMANDA_DESCUADRE")).toBe(false);
});
