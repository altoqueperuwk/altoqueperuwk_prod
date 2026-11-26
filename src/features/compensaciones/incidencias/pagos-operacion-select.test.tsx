import { expect, it, vi } from "vitest";
import type { PagosControlOperacion } from "../pagos/pagos-control.service";
import { operacionAcredita, pagosVinculo } from "./pagos-operacion-select";

vi.mock("../pagos/pagos-control.service", () => ({ pagosControlService: { list: vi.fn() } }));

const operacion = (extra: Partial<PagosControlOperacion>) =>
    ({
        id: 1,
        pagada: true,
        limite: "2026-11-22T15:00:00Z",
        cierre_estado: "POR_REVISAR",
        entrega_id: null,
        entrega_tardia: null,
        ...extra,
    }) as PagosControlOperacion;
const ahora = Date.parse("2026-11-25T12:00:00Z");

it("exige operación solo a descuadre, cierre incompleto y retraso de voucher", () => {
    expect(pagosVinculo("PAG_OPERADOR_ALTA_DEMANDA_DESCUADRE")).toBe("DESCUADRE");
    expect(pagosVinculo("PAG_OPERADOR_CIERRE_INCOMPLETO")).toBe("CIERRE");
    expect(pagosVinculo("PAG_VIRTUAL_RETRASO_VOUCHER")).toBe("VOUCHER");
    expect(pagosVinculo("PAG_OPERADOR_ALTA_DEMANDA_ERROR_CUADRO")).toBeNull();
    expect(pagosVinculo("PAG_OPERADOR_ALTA_DEMANDA_ERROR_PAGO_CRITICO")).toBeNull();
});

it("solo ofrece operaciones que la aprobación puede acreditar", () => {
    const hecho = "2026-11-24T10:00";
    expect(operacionAcredita(operacion({}), "CIERRE", hecho, ahora)).toBe(true);
    expect(operacionAcredita(operacion({ cierre_estado: "CERRADO" }), "CIERRE", hecho, ahora)).toBe(false);
    expect(operacionAcredita(operacion({}), "CIERRE", "2026-11-22T09:00", ahora)).toBe(false);
    expect(operacionAcredita(operacion({}), "VOUCHER", hecho, ahora)).toBe(true);
    expect(operacionAcredita(operacion({ entrega_id: 3, entrega_tardia: false }), "VOUCHER", hecho, ahora)).toBe(false);
    expect(operacionAcredita(operacion({ entrega_id: 3, entrega_tardia: true }), "VOUCHER", hecho, ahora)).toBe(true);
    expect(operacionAcredita(operacion({ pagada: false, limite: null }), "VOUCHER", hecho, ahora)).toBe(false);
    expect(operacionAcredita(operacion({ pagada: false, limite: null }), "DESCUADRE", hecho, ahora)).toBe(true);
});
