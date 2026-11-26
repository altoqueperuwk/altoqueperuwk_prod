import { describe, expect, it } from "vitest";
import { compensacionEstados, estadoVisual, grupoDeEstado, opcionesEstado, textosEstado } from "./compensacion-estados";

// Contrato visual aprobado, independiente de los diccionarios que utiliza la interfaz.
const approved: Record<string, [string, string]> = {};
const group = (codes: string, label: string, tone: string) => {
    for (const code of codes.split(" ")) approved[code] = [label, tone];
};
// Acciones de aprobación: solo Pendiente, Aprobado y Rechazado (homologado con el legacy).
group(
    "BORRADOR PENDIENTE PENDIENTE_APROBACION EN_REVISION REQUIERE_REVISION OBSERVADO OBSERVADA OPERACION_PENDIENTE POR_EVALUAR META_PENDIENTE FUENTE_PENDIENTE SIN_DATOS SIN_TARIFA SIN_META SIN_PERIODO ASISTENCIA_PENDIENTE ENCONTRADO AMBIGUO REQUIERE_DATOS PENDIENTE_REVISION_CHATS REVISAR EMPATE DESEMPATE_ADMINISTRATIVO POR_REVISAR CALCULADA",
    "Pendiente",
    "warning",
);
group("DATOS_INCONSISTENTES", "En revisión", "warning");
group("APROBADO APROBADA VALIDADO", "Aprobado", "success");
group("RECHAZADO RECHAZADA ANULADO ANULADA", "Rechazado", "error");
group("LIQUIDADO", "Liquidado", "success");
group("APLICADO", "Aplicado", "success");
group("ESPERANDO_OPERACION ESPERANDO", "Sin operación", "warning");
group("VENCIDO", "Plazo vencido", "error");
group("ELEGIBLE HABILITADO BONO_HABILITADO", "Cumple", "success");
group("NO_ELEGIBLE BLOQUEADO PERDIDO", "No cumple", "error");
group("PROVISIONAL", "Provisional", "warning");
group("EN_IMPLEMENTACION", "En implementación", "warning");
group("NO_APLICA", "No aplica", "gray");
group("CONSERVA", "Conserva", "success");
group("SIN_ASIGNACION SIN_JEFE", "Sin asignación", "warning");
group("PRESELECCION PRESELECCION_VALIDABLE", "Preselección", "warning");
group("SIN_CANDIDATOS", "Sin candidatos", "gray");
group("SIN_FUENTE", "Sin fuente", "gray");
group("FUENTE_INVALIDA", "Fuente inválida", "warning");
group("SIN_ENTREGA", "Sin entregar", "gray");
group("LISTO", "Listo para adjudicar", "success");
group("PAGADO PAGADA", "Pagado", "success");
group("REGISTRADO", "Registrado", "gray");
group("PAGO_PARCIAL", "Pago parcial", "warning");
group("CORREGIDO", "Corregido", "success");
group("A_TIEMPO", "A tiempo", "success");
group("COMPLETO", "Completo", "success");
group("TARDE", "Tarde", "error");
group("ANTICIPADA", "Salida anticipada", "error");
group("AUSENTE", "Ausente", "error");
group("SIN_MARCACION", "Sin marcación", "warning");
group("SIN_ENTRADA", "Sin entrada", "warning");
group("SIN_SALIDA", "Sin salida", "warning");
group("FALTA_ENTRADA", "Falta entrada", "warning");
group("FALTA_SALIDA", "Falta salida", "warning");
group("SIN_HORARIO", "Sin horario", "warning");
group("JUSTIFICADO", "Justificado", "gray");
group("VACACIONES", "Vacaciones", "gray");
group("LICENCIA", "Licencia", "gray");
group("DESCANSO", "Descanso", "gray");
group("VALIDA", "Válida", "success");
group("INVALIDA", "Inválida", "error");
group("DUPLICADA", "Duplicada", "gray");
group("ABIERTO", "Abierto", "gray");
group("REABIERTO", "Reabierto", "warning");
group("EN_CALCULO", "En cálculo", "warning");
group("CERRADO", "Cerrado", "success");
group("REEMPLAZADA", "Reemplazada", "gray");
group("NO_PAGABLE", "No pagable", "gray");
group("VIGENTE", "Vigente", "success");
group("REVERTIDO", "Revertido", "gray");
group("PUBLICADA", "Publicada", "success");
group("RETIRADA", "Retirada", "gray");
group("CARGADA", "Cargada", "gray");
group("VALIDADA", "Por confirmar", "warning");
group("CONFIRMADA", "Confirmada", "success");
group("ERROR", "Error", "error");
group("GENERADA", "Generado", "success");
group("ACTIVO", "Activo", "gray");
group("INACTIVO", "Inactivo", "gray");
group("LIBERADA", "Liberada", "gray");

const domains = Object.keys(compensacionEstados) as (keyof typeof compensacionEstados)[];
const cases = domains.flatMap((domain) => Object.keys(compensacionEstados[domain]).map((code) => ({ domain, code })));

describe("diccionario aprobado de Compensaciones", () => {
    it.each(cases)("$domain / $code respeta texto y tono aprobados", ({ domain, code }) => {
        let expected = approved[code];
        if (code === "PENDIENTE" && domain === "pago") expected = ["Pago pendiente", "warning"];
        if (code === "PENDIENTE" && domain === "comision") expected = ["Pendiente", "gray"];
        if (domain === "periodo" && code === "EN_REVISION") expected = ["En revisión", "warning"];
        if (domain === "periodo" && code === "OBSERVADO") expected = ["Observado", "warning"];
        if (domain === "configuracion" && code === "BORRADOR") expected = ["Borrador", "gray"];
        if (["exportacion"].includes(domain) && code === "ANULADA") expected = ["Anulado", "gray"];
        if (domain === "importacion" && code === "ANULADA") expected = ["Anulada", "gray"];
        expect(expected, `Código sin aprobación visual: ${domain}/${code}`).toBeDefined();
        expect(estadoVisual(domain, code)).toEqual({ label: expected[0], tone: expected[1] });
    });

    it.each(domains)("%s trata valores desconocidos como pendientes, sin inventar aprobación ni pago", (domain) => {
        for (const raw of ["ESTADO_FUTURO", "constructor", "__proto__", null, undefined, {}, 42]) {
            expect(estadoVisual(domain, raw)).toEqual({ label: "Pendiente", tone: "warning" });
        }
    });

    it("conserva la excepción de aprobación de Registro Nuevo", () => {
        for (const code of ["NO_ELEGIBLE", "REQUIERE_REVISION", null])
            expect(estadoVisual("captacionAprobacion", code)).toEqual({ label: "Pendiente", tone: "warning" });
        expect(estadoVisual("elegibilidad", "NO_ELEGIBLE")).toEqual({ label: "No cumple", tone: "error" });
    });

    it("separa corregir, aprobar, liquidar y pagar", () => {
        expect(estadoVisual("correccion", "CORREGIDO").label).toBe("Corregido");
        expect(estadoVisual("registro", "APROBADO").label).toBe("Aprobado");
        expect(estadoVisual("registro", "LIQUIDADO").label).toBe("Liquidado");
        expect(estadoVisual("liquidacion", "PAGO_PARCIAL")).toEqual({ label: "Pago parcial", tone: "warning" });
        expect(estadoVisual("pago", "PAGADA")).toEqual({ label: "Pagado", tone: "success" });
    });

    it("normaliza espacios, mayúsculas y tildes solo al mostrar y devuelve copias", () => {
        const raw = "  en revisión  ";
        const value = estadoVisual("aprobacion", raw);
        expect(value).toEqual({ label: "Pendiente", tone: "warning" });
        value.label = "Cambio local";
        expect(estadoVisual("aprobacion", "EN_REVISION").label).toBe("Pendiente");
        expect(raw).toBe("  en revisión  ");
    });

    it("traduce filtros sin cambiar sus claves de RPC", () => {
        expect(textosEstado("aprobacion", ["PENDIENTE", "APROBADO", "RECHAZADO"])).toEqual({
            PENDIENTE: "Pendiente",
            APROBADO: "Aprobado",
            RECHAZADO: "Rechazado",
        });
    });
});

describe("opcionesEstado", () => {
    it("no repite etiquetas y conserva la primera clave del servidor", () => {
        expect(opcionesEstado("referido", ["PENDIENTE", "VALIDADO", "RECHAZADO", "ANULADO"])).toEqual([
            { id: "PENDIENTE", label: "Pendiente" },
            { id: "VALIDADO", label: "Aprobado" },
            { id: "RECHAZADO", label: "Rechazado" },
        ]);
        const registro = opcionesEstado("registro", ["BORRADOR", "PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"]).map((item) => item.label);
        expect(registro).toEqual(["Pendiente", "Aprobado", "Rechazado", "Liquidado"]);
        expect(opcionesEstado("elegibilidad", ["CONSERVA", "PERDIDO", "SIN_DATOS", "REVISAR", "SIN_TARIFA", "NO_APLICA"]).map((item) => item.label)).toEqual([
            "Conserva",
            "No cumple",
            "Pendiente",
            "No aplica",
        ]);
    });
});

describe("Dashboard: tres grupos de estado", () => {
    it("agrupa por significado, igual que SQL 139", () => {
        for (const code of ["PAGADA", "PAGO_PARCIAL", "HABILITADO", "APROBADA", "ELEGIBLE"]) expect(grupoDeEstado(code)).toBe("APROBADO");
        for (const code of ["ESPERANDO_OPERACION", "EN_REVISION", "OPERACION_PENDIENTE", "PROVISIONAL", "EN_IMPLEMENTACION", "PENDIENTE", "algo_nuevo"])
            expect(grupoDeEstado(code)).toBe("PENDIENTE");
        for (const code of ["RECHAZADO", "ANULADO", "NO_ELEGIBLE", "PERDIDO"]) expect(grupoDeEstado(code)).toBe("RECHAZADO");
        expect(grupoDeEstado("PROVISIONAL", false)).toBe("APROBADO");
        expect(grupoDeEstado("PROVISIONAL", true)).toBe("PENDIENTE");
        expect(grupoDeEstado("PROVISIONAL")).toBe("PENDIENTE");
        expect(estadoVisual("dashboard", "PAGADA")).toEqual({ label: "Aprobado", tone: "success" });
        expect(estadoVisual("dashboard", "ESPERANDO_OPERACION").label).toBe("Pendiente");
        expect(estadoVisual("dashboard", "NO_ELEGIBLE").label).toBe("Rechazado");
    });
});
