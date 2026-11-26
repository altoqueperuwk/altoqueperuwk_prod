import { afterEach, expect, it, vi } from "vitest";
import { canEditCliente } from "./cliente-nuevo-eligibility";
import type { ClienteNuevo } from "./clientes-nuevos.service";

const client = { puede_editar: true, estado: "ESPERANDO_OPERACION", operacion: null, vence: "2026-11-08T14:00:00Z" } as ClienteNuevo;
afterEach(() => vi.useRealTimers());
it("admite el límite inclusivo de 168 horas y rechaza un segundo después", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(client.vence));
    expect(canEditCliente(client)).toBe(true);
    vi.setSystemTime(new Date(Date.parse(client.vence) + 1000));
    expect(canEditCliente(client)).toBe(false);
});
it("deniega edición sin permiso, con vínculo o fecha desconocida", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T14:00:00Z"));
    expect(canEditCliente({ ...client, puede_editar: false })).toBe(false);
    expect(canEditCliente({ ...client, operacion: "OP1" })).toBe(false);
    expect(canEditCliente({ ...client, id_operacion: 1 })).toBe(false);
    expect(canEditCliente({ ...client, vence: "" })).toBe(false);
});
