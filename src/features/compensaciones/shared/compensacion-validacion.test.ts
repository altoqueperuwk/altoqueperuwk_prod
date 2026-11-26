import { expect, it } from "vitest";
import { oracionValidacion, soloDigitos } from "./compensacion-validacion";

it("une problemas con comas y y, conservando todos los campos", () => {
    expect(oracionValidacion(["el documento necesita 8 dígitos", "el nombre, al menos 3 letras", "el Whatsapp, 9 dígitos"])).toBe(
        "El documento necesita 8 dígitos, el nombre, al menos 3 letras y el Whatsapp, 9 dígitos.",
    );
});
it("resuelve cero, uno o dos problemas sin listas ni puntuación doble", () => {
    expect(oracionValidacion([])).toBe("");
    expect(oracionValidacion([" ", "selecciona un cargo."])).toBe("Selecciona un cargo.");
    expect(oracionValidacion(["revisa el DNI", "revisa la fecha."])).toBe("Revisa el DNI y revisa la fecha.");
});
it("respeta la longitud indicada por el campo y nunca convierte un documento a número", () => {
    expect(soloDigitos(" 00-123456789", 8)).toBe("00123456");
    expect(soloDigitos("CE 1234567890123", 12)).toBe("123456789012");
    expect(soloDigitos("987 654 321 0", 9)).toBe("987654321");
});
