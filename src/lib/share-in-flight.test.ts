import { expect, it, vi } from "vitest";
import { shareInFlight } from "./share-in-flight";

it("comparte la consulta en curso y vuelve a consultar al terminar", async () => {
    const load = vi.fn().mockResolvedValue("ok");
    const [a, b] = await Promise.all([shareInFlight("k", load), shareInFlight("k", load)]);
    expect([a, b]).toEqual(["ok", "ok"]);
    expect(load).toHaveBeenCalledTimes(1);
    await shareInFlight("k", load);
    expect(load).toHaveBeenCalledTimes(2);
});

it("no mezcla claves distintas ni conserva errores", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("x"));
    await expect(shareInFlight("e", fail)).rejects.toThrow("x");
    await expect(shareInFlight("e", fail)).rejects.toThrow("x");
    expect(fail).toHaveBeenCalledTimes(2);
});
