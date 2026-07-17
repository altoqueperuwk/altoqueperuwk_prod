import { describe, expect, it } from "vitest";
import { findCodigoServicioForRuta } from "./route-config";

describe("route-config", () => {
    const servicios = [
        { id: 2, nombre: "BCP", tipo: "EFECTIVIZACION" },
        { id: 3, nombre: "Scotiabank", tipo: "EFECTIVIZACION" },
        { id: 4, nombre: "Pago Deuda", tipo: "PAGO_DEUDA" },
    ];

    it("selects the service matching the active banking route", () => {
        expect(findCodigoServicioForRuta(servicios, "scotiabank")).toMatchObject({
            id: 3,
            nombre: "Scotiabank",
        });
    });

    it("supports common Scotiabank aliases", () => {
        expect(
            findCodigoServicioForRuta(
                [
                    { id: 2, nombre: "BCP", tipo: "EFECTIVIZACION" },
                    { id: 7, nombre: "Scotia", tipo: "EFECTIVIZACION" },
                ],
                "scotiabank",
            ),
        ).toMatchObject({
            id: 7,
            nombre: "Scotia",
        });
    });

    it("does not fall back to the first efectivizacion service when a route match exists", () => {
        expect(findCodigoServicioForRuta(servicios, "bcp")).toMatchObject({
            id: 2,
            nombre: "BCP",
        });
    });

    it("does not return another bank when the active route has no service", () => {
        expect(findCodigoServicioForRuta([{ id: 2, nombre: "BCP", tipo: "EFECTIVIZACION" }], "scotiabank")).toBeNull();
    });
});
