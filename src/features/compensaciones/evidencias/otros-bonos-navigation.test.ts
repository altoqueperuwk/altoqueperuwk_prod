import { describe, expect, it } from "vitest";
import type { EvidenciaTipo } from "./evidencias.types";
import { expandOtrosBonosMenu, otroBonoPath, otrosBonosPath } from "./otros-bonos-navigation";

const type = { id: 1, codigo: "BONO_PUNTUALIDAD", nombre: "Puntualidad", categoria: "OTRO", estadoNombre: "ACTIVO" } as EvidenciaTipo;
describe("Bonos directamente en Compensaciones", () => {
    it("sustituye Otros bonos por enlaces individuales, sin grupo ni enlace al directorio", () => {
        const result = expandOtrosBonosMenu(
            [
                { nombre: "Llamadas", ruta: "/compensaciones/llamadas" },
                { nombre: "Otros bonos", ruta: otrosBonosPath },
            ],
            [type],
        );
        expect(result).toEqual([
            { nombre: "Llamadas", ruta: "/compensaciones/llamadas" },
            { nombre: "Puntualidad", ruta: otroBonoPath(type.codigo) },
        ]);
    });
    it("no agrega accesos cuando el usuario no tenía autorización al grupo", () => {
        expect(expandOtrosBonosMenu([], [type])).toEqual([]);
    });
    it("no duplica opciones ya existentes", () => {
        const entry = { nombre: "Puntualidad", ruta: otroBonoPath(type.codigo) };
        expect(expandOtrosBonosMenu([entry, { nombre: "Otros bonos", ruta: otrosBonosPath }], [type])).toEqual([entry]);
    });
    it("incluye el reconocimiento mensual por calificaciones aunque su fuente sea CALIFICACION", () => {
        const rating = {
            ...type,
            codigo: "COLABORADOR_MES_CALIFICACIONES",
            nombre: "Colaborador del mes por calificaciones",
            categoria: "CALIFICACION",
        } as EvidenciaTipo;
        expect(expandOtrosBonosMenu([{ nombre: "Otros bonos", ruta: otrosBonosPath }], [rating])).toEqual([
            { nombre: rating.nombre, ruta: otroBonoPath(rating.codigo) },
        ]);
    });
});
