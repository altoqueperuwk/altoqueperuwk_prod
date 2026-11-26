import { describe, expect, it } from "vitest";
import { ayudaDeConcepto, origenDeConcepto, origenPorConcepto } from "./compensacion-origen";

describe("origenDeConcepto", () => {
    it("lleva cada concepto de Atención al cliente y Jefe de sede a su opción", () => {
        expect(origenDeConcepto("COMISION_LLAMADA")).toMatchObject({ modulo: "Llamadas", href: "/compensaciones/llamadas" });
        expect(origenDeConcepto("ATC_UNIFORME")?.href).toBe("/compensaciones/incidencias?concepto=uniforme");
        expect(origenDeConcepto("JEFE_INDISCIPLINA")?.href).toBe("/compensaciones/incidencias?concepto=indisciplina");
    });

    it("lleva cada concepto de Facturación a su opción y muestra quién valida", () => {
        expect(origenDeConcepto("BONO_DETECCION_ERROR_PAGO")).toMatchObject({ href: "/compensaciones/auditoria-activa", valida: "Gerencia" });
        expect(origenDeConcepto("BONO_OPERACION_EXTRA")?.href).toBe("/compensaciones/auditoria-activa");
        expect(origenDeConcepto("FAC_ERROR_SOLUCION")?.href).toBe("/compensaciones/incidencias");
        expect(origenDeConcepto("FAC_UNIFORME")?.href).toBe("/compensaciones/incidencias");
        expect(origenDeConcepto("FAC_INDISCIPLINA")?.href).toBe("/compensaciones/incidencias");
        expect(origenDeConcepto("FAC_UNIFORME")?.valida).toBe("Gerencia");
        expect(origenDeConcepto("FAC_INDISCIPLINA")?.valida).toBe("Gerencia");
        expect(ayudaDeConcepto(origenDeConcepto("FAC_ERROR_SIN_SOLUCION"))).toMatch(/Valida: Gerencia$/);
        expect(ayudaDeConcepto(origenDeConcepto("COMISION_LLAMADA"))).not.toMatch(/Valida/);
        expect(ayudaDeConcepto(null)).toBeUndefined();
    });

    it("no inventa destino para conceptos de otros perfiles", () => {
        for (const codigo of ["MKT_INEXISTENTE", "BONO_INEXISTENTE"]) expect(origenDeConcepto(codigo)).toBeNull();
        expect(origenPorConcepto.JEFE_ERROR_CUADRO.href).toBeUndefined();
    });
});

describe("Origen de los conceptos de Pagos", () => {
    it.each([
        "BONO_CUADRE_PERFECTO",
        "BONO_DETECCION_ERROR_MANUAL",
        "BONO_INNOVACION",
        "BONO_REGISTRO_PRESENCIAL",
        "BONO_REPORTE_ABANDONO",
        "COMISION_REFERIDO",
        "COMISION_REGISTRO_EFECTIVIZACION",
        "COMISION_TIKTOK_LIVE",
        "PAG_CIERRE_INCOMPLETO",
        "PAG_DESCUADRE",
        "PAG_ERROR_CUADRO",
        "PAG_ERROR_PAGO_CRITICO",
        "PAG_INDISCIPLINA",
        "PAG_RETRASO_VOUCHER",
        "PAG_UNIFORME",
    ])("%s tiene Origen con ruta", (codigo) => expect(origenDeConcepto(codigo)?.href).toMatch(/^\/compensaciones\//));
});

describe("Origen de los conceptos de Marketing", () => {
    it.each([
        "BONO_VIDEO_VIRAL",
        "BONO_INNOVACION",
        "BONO_RECUPERACION",
        "COMISION_ALERTA_TEMPRANA",
        "COMISION_REFERIDO",
        "COMISION_TIKTOK_LIVE",
        "MKT_UNIFORME",
        "MKT_INDISCIPLINA",
    ])("%s tiene Origen con ruta", (codigo) => expect(origenDeConcepto(codigo)?.href).toMatch(/^\/compensaciones\//));
    it("Video Viral y Recuperación son opciones distintas", () => {
        expect(origenDeConcepto("BONO_VIDEO_VIRAL")?.href).not.toBe(origenDeConcepto("BONO_RECUPERACION")?.href);
        expect(origenDeConcepto("BONO_RECUPERACION")?.valida).toBeUndefined();
        expect(origenDeConcepto("COMISION_ALERTA_TEMPRANA")?.href).toBe("/compensaciones/auditoria-operaciones");
        expect(origenDeConcepto("MKT_UNIFORME")?.href).toBe("/compensaciones/indisciplina-colaborador");
    });
});
