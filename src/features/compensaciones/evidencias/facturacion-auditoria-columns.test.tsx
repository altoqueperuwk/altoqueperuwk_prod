import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { facturacionColumnas } from "./facturacion-auditoria-columns";
import type { FacturacionReporte } from "./facturacion-auditoria.service";

const row = (estado: string, extra: Partial<FacturacionReporte> = {}) =>
    ({
        id: 1,
        tipo: "DETECCION_ERROR_PAGO",
        descripcion: "x",
        estado_evento: estado,
        fecha_evento: "2026-10-20T12:00:00Z",
        fecha_registro: "2026-10-20T12:00:00Z",
        importe_aprobado: 0.2,
        beneficiario: "Facturación",
        cliente: "Cliente Uno",
        datos: { cliente_documento: "12345678", codigo_externo: null, error: "MONTO" },
        evidencia: [],
        criterios_validacion_snapshot: {},
        revisiones: [],
        ...extra,
    }) as FacturacionReporte;
const cell = (key: string, r: FacturacionReporte) => {
    const col = facturacionColumnas(true).find((c) => c.key === key)!;
    return col.render!(r[key], r);
};
afterEach(cleanup);
it("usa las cabeceras del glosario y no incluye un segundo estado", () => {
    const headers = facturacionColumnas(false).map((c) => c.header);
    expect(headers).toEqual(["DNI", "Cliente", "Reporte", "Fecha", "Estado", "Liquidación", "Operación", "Monto efectivizado", "Monto"]);
    expect(headers).not.toContain("Estado de operación");
    expect(facturacionColumnas(true).map((c) => c.header)).toContain("Registrado por");
});
it("un registro liquidado muestra Aprobado y Liquidación Sí", () => {
    const liquidado = row("LIQUIDADO");
    render(<>{cell("estado_evento", liquidado)}</>);
    expect(screen.getByText("Aprobado")).toBeVisible();
    expect(screen.queryByText("Liquidado")).toBeNull();
    cleanup();
    render(<>{cell("liquidacion", liquidado)}</>);
    expect(screen.getByText("Sí")).toBeVisible();
});
it("un registro aprobado sin liquidar muestra Liquidación No y los pendientes, Pendiente", () => {
    render(<>{cell("liquidacion", row("APROBADO"))}</>);
    expect(screen.getByText("No")).toBeVisible();
    cleanup();
    render(<>{cell("estado_evento", row("APROBADO", { requiere_revision: true }))}</>);
    expect(screen.getByText("Pendiente")).toBeVisible();
});
it("la operación vinculada se muestra como dato", () => {
    const operacion = {
        id: 9,
        id_cliente: 1,
        dni: "12345678",
        cliente: "C",
        codigo: "OP-9",
        monto: 100,
        estado: "Pagado",
        pagada: true,
        fecha_registro: "",
        servicio: "POS",
    };
    render(<>{cell("codigo_operacion", row("PENDIENTE", { datos: { cliente_documento: "12345678", codigo_externo: null, error: "MONTO", operacion } }))}</>);
    expect(screen.getByText("OP-9")).toBeVisible();
    expect(screen.queryByText("Pagado")).toBeNull();
});
