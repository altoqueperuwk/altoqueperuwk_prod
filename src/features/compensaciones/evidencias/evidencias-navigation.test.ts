import { describe, expect, it } from "vitest";
import { evidenciaScreens, expandEvidenciasMenu } from "./evidencias-navigation";

const evidenceMenu = { id: "41", nombre: "Evidencias", ruta: "/compensaciones/evidencias", icono: "file-text" };

describe("Accesos directos de Evidencias", () => {
    it("expande el permiso existente en seis accesos, sin SafetyPay", () => {
        const result = expandEvidenciasMenu([evidenceMenu]);
        expect(result.map((entry) => entry.ruta)).toEqual(evidenciaScreens.map((entry) => entry.path));
        expect(result.map((entry) => entry.nombre)).toEqual([
            "Atención Calificada",
            "Llamadas",
            "Tarjetas erróneas",
            "Referidos",
            "Otros bonos",
            "Todos los registros",
        ]);
        expect(result.every((entry) => entry.id === evidenceMenu.id)).toBe(true);
        expect(result.some((entry) => entry.ruta.includes("safetypay"))).toBe(false);
    });

    it("no añade accesos si no existe el permiso de Evidencias", () => {
        const entries = [{ ...evidenceMenu, ruta: "/compensaciones/asistencia", nombre: "Asistencia" }];
        expect(expandEvidenciasMenu(entries)).toEqual(entries);
        expect(expandEvidenciasMenu([])).toEqual([]);
    });

    it("no altera otros módulos, el orden ni el objeto original", () => {
        const operations = { ...evidenceMenu, id: "90", ruta: "/operaciones/interbank", nombre: "Interbank" };
        const entries = [operations, evidenceMenu];
        const result = expandEvidenciasMenu(entries);
        expect(result[0]).toBe(operations);
        expect(entries[1].nombre).toBe("Evidencias");
        expect(new Set(result.map((entry) => entry.ruta)).size).toBe(result.length);
    });

    it("es idempotente y no duplica un acceso explícito del servidor", () => {
        const explicit = { ...evidenceMenu, id: "42", ruta: "/compensaciones/llamadas", nombre: "Llamadas" };
        const result = expandEvidenciasMenu([explicit, evidenceMenu]);
        expect(result.filter((entry) => entry.ruta === explicit.ruta)).toEqual([explicit]);
        expect(expandEvidenciasMenu(result)).toEqual(result);
    });
});
