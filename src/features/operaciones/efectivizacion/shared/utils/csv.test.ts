import { describe, expect, it } from "vitest";
import { buildCsv, csvValue } from "./csv";

describe("csv", () => {
    it("escapes values with quotes", () => {
        expect(csvValue('A "quoted" value')).toBe('"A ""quoted"" value"');
    });

    it("builds a csv string", () => {
        expect(buildCsv(["Nombre", "Monto"], [["BCP", 120]])).toBe('"Nombre","Monto"\n"BCP","120"');
    });
});
