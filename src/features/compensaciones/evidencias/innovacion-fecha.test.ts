import { expect, it } from "vitest";
import { innovacionFechaEvento } from "./innovacion-fecha";

it("conserva la fecha seleccionada y genera la hora de Lima al guardar", () => {
    expect(innovacionFechaEvento("2026-09-10", new Date("2026-10-25T03:04:05Z"))).toBe("2026-09-10T22:04:05-05:00");
});
it("usa las 00:00 en medianoche sin cambiar el día seleccionado", () => {
    expect(innovacionFechaEvento("2026-10-24", new Date("2026-10-24T05:00:00Z"))).toBe("2026-10-24T00:00:00-05:00");
});
