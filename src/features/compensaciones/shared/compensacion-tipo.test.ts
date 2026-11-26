import { expect, it } from "vitest";
import { compensacionTipo, compensacionTipoLabel, compensacionTipoServidor } from "./compensacion-tipo";

it("solo existen Bono y Penalidad: comisión es un bono y descuento es una penalidad", () => {
    for (const value of ["BONO", "COMISION", "Comisión", "comisión jefe", "Bono"]) expect(compensacionTipo(value)).toBe("BONO");
    for (const value of ["DESCUENTO", "Descuento", "PENALIDAD", "Penalidad"]) expect(compensacionTipo(value)).toBe("PENALIDAD");
    expect(compensacionTipoLabel("COMISION")).toBe("Bono");
    expect(compensacionTipoLabel("DESCUENTO")).toBe("Penalidad");
});

it("traduce el filtro al servidor sin cambiar sus claves", () => {
    expect(compensacionTipoServidor("PENALIDAD")).toBe("DESCUENTO");
    expect(compensacionTipoServidor("BONO")).toBe("");
    expect(compensacionTipoServidor("")).toBe("");
});
