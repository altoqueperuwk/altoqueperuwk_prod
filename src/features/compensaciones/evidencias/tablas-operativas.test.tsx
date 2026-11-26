import type { ReactNode } from "react";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/shared/data-table";
import { renderWithAlerts as render } from "@/features/compensaciones/shared/test-alerts";
import { incidenciaColumns, incidenciaRows } from "../incidencias/incidencia-columns";
import type { IncidenciaEvento } from "../incidencias/incidencias.types";
import { EstrellasCell, NotasCell } from "../shared/compensacion-cells";
import { evidenciaColumns, evidenciaRows } from "./evidencia-columns";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento } from "./evidencias.types";

vi.mock("@/providers/session-cache-provider", () => ({ useSessionCache: () => ({ estados: [] }) }));
const mocks = vi.hoisted(() => ({}));

vi.mock("./evidencias.service", () => ({ evidenciasService: {} }));
vi.mock("../shared/compensacion-surface", () => ({ CompensacionSurface: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
afterEach(cleanup);

const evidence = (changes: Partial<EvidenciaEvento> = {}): EvidenciaEvento => ({
    id: 991001,
    idTipoEvento: 1,
    tipoCodigo: "CALIFICACION",
    tipoNombre: "Calificación",
    categoria: "CALIFICACION",
    conceptoNombre: "Bono",
    beneficiarioNombre: "Asesor ficticio",
    beneficiarioDocumento: "99980001",
    responsableNombre: null,
    sucursalOrigenNombre: "Lince",
    fechaEvento: "2026-10-01T15:00:00Z",
    periodoImputacion: "2026-10-01",
    titulo: null,
    descripcion: "Muy buena atención",
    datos: { cliente_nombre: "Cliente ficticio", cliente_documento: "99990001", estrellas: 5 },
    evidencia: [],
    estado: "APROBADO",
    baseCalculo: null,
    cantidad: 1,
    tarifaAplicada: 2,
    importeAprobado: 2,
    usuarioRegistraNombre: "Reportante ficticio",
    fechaRegistro: "2026-10-01T15:00:00Z",
    referencias: [],
    revisiones: [],
    ...changes,
});
const incident = (): IncidenciaEvento => ({
    id: 992001,
    idTipoEvento: 2,
    idPenalidadTipo: 3,
    tipoEventoNombre: "Penalidad",
    categoria: "PENALIDAD",
    penalidadNombre: "Error de datos",
    montoReferencia: 2,
    montoBonoReportante: null,
    requiereRespuesta: true,
    reportanteNombre: "Reportante ficticio",
    reportanteDocumento: "99980002",
    responsableNombre: "Trabajador ficticio",
    responsableDocumento: "99980001",
    sucursalOrigenNombre: "Norte",
    sucursalResponsableNombre: "Lince",
    fechaEvento: "2026-10-01T15:00:00Z",
    titulo: null,
    motivo: "Dato incorrecto",
    evidencia: [],
    estado: "PENDIENTE",
    importeAprobado: null,
    usuarioRegistraNombre: "Reportante ficticio",
    revisiones: [],
});
const table = (category: string, items = [evidence()]) =>
    render(
        <DataTable
            columns={evidenciaColumns(category)}
            data={evidenciaRows(items)}
            isLoading={false}
            page={1}
            totalPages={1}
            pageSize={20}
            onPageChange={vi.fn()}
            onPageSizeChange={vi.fn()}
        />,
    );

describe("Tablas pobladas con contrato de Compensaciones", () => {
    it("Calificaciones presenta asesor, estrellas y comentario sin PK visible", () => {
        table("CALIFICACION");
        expect(screen.getByRole("columnheader", { name: "Asesor" })).toBeTruthy();
        expect(screen.getByRole("img", { name: "5 de 5 estrellas" })).toBeTruthy();
        expect(screen.getByText("Muy buena atención")).toBeTruthy();
        expect(screen.queryByText("991001")).toBeNull();
    });
    it("Llamadas no muestra columnas de tipo o estrellas redundantes", () => {
        table("LLAMADA", [evidence({ categoria: "LLAMADA", estado: "BORRADOR", importeAprobado: null })]);
        expect(screen.getByRole("columnheader", { name: "Cliente" })).toBeTruthy();
        expect(screen.getByRole("columnheader", { name: "Registrado por" })).toBeTruthy();
        expect(screen.queryByRole("columnheader", { name: "Estrellas" })).toBeNull();
        expect(screen.getAllByText("Pendiente").length).toBeTruthy();
    });
    it("Tarjetas distingue el bono aprobado", () => {
        table("TARJETA_TERCERO");
        expect(
            screen
                .getAllByRole("columnheader")
                .slice(0, 2)
                .map((header) => header.textContent),
        ).toEqual(["DNI", "Cliente"]);
        expect(screen.getByRole("columnheader", { name: "Monto" })).toBeTruthy();
    });
    it("Referidos no inventa banco ni monto efectivizado ausentes del contrato", () => {
        table("REFERIDO");
        expect(screen.getByRole("columnheader", { name: "Referido" })).toBeTruthy();
        expect(screen.queryByRole("columnheader", { name: "Banco" })).toBeNull();
    });
    it("un importe aprobado cero sigue siendo cero, no pendiente", () => {
        table("LLAMADA", [evidence({ importeAprobado: 0 })]);
        expect(screen.getByText(/S\/\s*0\.00/)).toBeTruthy();
        expect(screen.queryByText("Pendiente")).toBeNull();
    });
    it("un rechazo sin ganancia no se presenta como pendiente", () => {
        table("LLAMADA", [evidence({ estado: "RECHAZADO", importeAprobado: null })]);
        expect(screen.getByText("Rechazado")).toBeTruthy();
        expect(screen.queryByText("Pendiente")).toBeNull();
    });
    it("Penalidades separa referencia económica de descuento aprobado", () => {
        render(
            <DataTable
                columns={incidenciaColumns("PENALIDAD")}
                data={incidenciaRows([incident()])}
                isLoading={false}
                page={1}
                totalPages={1}
                pageSize={20}
                onPageChange={vi.fn()}
                onPageSizeChange={vi.fn()}
            />,
        );
        expect(screen.getByRole("columnheader", { name: "Tarifa" })).toBeTruthy();
        expect(screen.getByRole("columnheader", { name: "Monto" })).toBeTruthy();
        expect(screen.getByText("Dato incorrecto")).toBeTruthy();
        expect(screen.queryByRole("columnheader", { name: "Bono previsto" })).toBeNull();
    });
    it("Auditoría muestra bono previsto sin convertir nulo en cero", () => {
        const cols = incidenciaColumns("AUDITORIA_PAGO");
        expect(cols.find((col) => col.key === "bono")?.render?.(null, {})).toBe("—");
        expect(cols[0].header).toBe("Colaborador");
    });
    it("no inventa estrellas válidas para datos incompletos", () => {
        render(<EstrellasCell value={6} />);
        expect(screen.getByText("Sin calificación")).toBeTruthy();
    });
    it("conserva texto completo en notas extensas sin HTML ejecutable", () => {
        const text = "<script>ejemplo</script> " + "Nota extensa ".repeat(30);
        render(<NotasCell value={text} />);
        expect(screen.getByTitle(text.trim()).textContent).toBe(text);
        expect(document.querySelector("script")).toBeNull();
    });
    it("el detalle expone cliente y estrellas sin un título técnico con PK", async () => {
        render(<EvidenciaDetailModal item={evidence()} onClose={vi.fn()} onChanged={vi.fn()} />);
        expect(await screen.findByRole("heading", { name: "Detalle de Atención Calificada" })).toBeTruthy();
        expect(screen.getByText("Cliente ficticio")).toBeTruthy();
        expect(screen.getByRole("img", { name: "5 de 5 estrellas" })).toBeTruthy();
        expect(screen.queryByText("Evidencia #991001")).toBeNull();
    });
});
