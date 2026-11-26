import { expect, it } from "vitest";
import { columnasCompensacion } from "./compensacion-data-table";

it("alinea cifras sin confundir documentos, códigos ni cuentas con montos", () => {
    const keys = [
        "monto",
        "importeAprobado",
        "total_pagar",
        "minutos_tardanza",
        "mensajes",
        "ganancia",
        "documento",
        "numero_cuenta",
        "codigo",
        "estado",
        "nombre",
    ];
    const columns = keys.map((key) => ({ key, header: key }));
    const result = columnasCompensacion(columns);
    expect(result.slice(0, 6).map((column) => column.align)).toEqual(Array(6).fill("right"));
    expect(result.slice(6).map((column) => column.align)).toEqual(Array(5).fill("left"));
    expect(columns.every((column) => !("align" in column))).toBe(true);
    expect(result.map((column) => column.key)).toEqual(keys);
});
