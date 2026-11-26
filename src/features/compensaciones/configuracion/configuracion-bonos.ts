import type { Regla } from "./configuracion.types";

export interface BonoDefinicion {
    code: string;
    label: string;
}

/** Bonos que normalmente tienen un solo importe para todos los cargos que lo cobran. */
export const bonosGenerales: BonoDefinicion[] = [
    { code: "COMISION_CALIFICACION_PRESENCIAL", label: "Atención Calificada" },
    { code: "COMISION_LLAMADA", label: "Llamadas" },
    { code: "COMISION_REFERIDO", label: "Referidos" },
    { code: "BONO_INNOVACION", label: "Propuesta de Innovación" },
    { code: "BONO_VIDEO_VIRAL", label: "Video Viral" },
    { code: "BONO_RECUPERACION", label: "Recuperación" },
];

export const bonosAuditoria: BonoDefinicion[] = [
    { code: "BONO_SEGURIDAD_TARJETA", label: "Seguridad Tarjeta" },
    { code: "COMISION_AUDITORIA_ACTIVA", label: "Auditoría Activa" },
    { code: "BONO_DETECCION_ERROR_PAGO", label: "Detección de Error de Pago" },
    { code: "BONO_OPERACION_EXTRA", label: "Operación Extra" },
    { code: "BONO_DETECCION_ERROR_MANUAL", label: "Detección de Error Manual" },
    { code: "BONO_REPORTE_ABANDONO", label: "Reporte de Abandono Comercial" },
    { code: "COMISION_ALERTA_TEMPRANA", label: "Alerta Temprana" },
];

/** Bonos cuyo importe depende del cargo: siempre van en la tabla. */
export const bonosPorCargo: BonoDefinicion[] = [
    { code: "COMISION_REGISTRO_EFECTIVIZACION", label: "Registro Nuevo" },
    { code: "COMISION_AUDITAR_NUEVOS", label: "Validación de Registro Nuevo" },
    { code: "COMISION_TIKTOK_LIVE", label: "TikTok Live" },
    { code: "BONO_CUADRE_PERFECTO", label: "Cuadre Perfecto" },
];

export interface BonoComun extends BonoDefinicion {
    reglas: Regla[];
}

const esCalculada = (rule: Regla) => rule.tipoCalculo === "FORMULA" || rule.configuracion.metodo_extra === "RECARGO_TRAMOS";
const importe = (rule: Regla) => (rule.tipoCalculo === "PORCENTAJE" ? rule.porcentaje : rule.monto);
const cabeEnTabla = (rules: Regla[]) =>
    rules.every((rule) => rule.idCargo !== null && rule.idSucursal === null) && new Set(rules.map((rule) => rule.idCargo)).size === rules.length;
const importeComun = (rules: Regla[]) =>
    rules.every((rule) => !esCalculada(rule) && rule.idSucursal === null && rule.tipoCalculo === rules[0].tipoCalculo && importe(rule) === importe(rules[0]));

/**
 * Reparte los bonos vigentes entre las tarjetas. Cada regla aparece una sola vez: un campo común si su importe coincide,
 * la tabla por cargo si difiere, y «otros» si no cabe en ninguna (así nada queda oculto).
 */
export const repartirBonos = (rules: Regla[], codeOf: (rule: Regla) => string) => {
    const pendientes = new Map<string, Regla[]>();
    rules.forEach((rule) => pendientes.set(codeOf(rule), [...(pendientes.get(codeOf(rule)) ?? []), rule]));
    const columnas: BonoComun[] = [];
    const tomarTabla = (definition: BonoDefinicion) => {
        const reglas = pendientes.get(definition.code);
        if (!reglas || !cabeEnTabla(reglas)) return;
        columnas.push({ ...definition, reglas });
        pendientes.delete(definition.code);
    };
    bonosPorCargo.forEach(tomarTabla);
    const comunes = (definitions: BonoDefinicion[]) =>
        definitions.flatMap((definition) => {
            const reglas = pendientes.get(definition.code);
            if (!reglas) return [];
            if (!importeComun(reglas)) {
                tomarTabla(definition);
                return [];
            }
            pendientes.delete(definition.code);
            return [{ ...definition, reglas }];
        });
    const generales = comunes(bonosGenerales);
    const auditoria = comunes(bonosAuditoria);
    return { generales, auditoria, columnas, otros: [...pendientes.values()].flat() };
};
