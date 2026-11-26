import type { StatusTone } from "@/components/shared/status-badge";

export interface EstadoVisual {
    label: string;
    tone: StatusTone;
}

type Diccionario = Readonly<Record<string, EstadoVisual>>;
const estado = (label: string, tone: StatusTone): EstadoVisual => ({ label, tone });
const pendiente = estado("Pendiente", "warning");
const aprobado = estado("Aprobado", "success");
const rechazado = estado("Rechazado", "error");
/** Toda acción de aprobación de Compensaciones usa solo Pendiente, Aprobado o Rechazado (igual que el legacy). */
const aprobacion = {
    BORRADOR: pendiente,
    PENDIENTE: pendiente,
    PENDIENTE_APROBACION: pendiente,
    EN_REVISION: pendiente,
    REQUIERE_REVISION: pendiente,
    OBSERVADO: pendiente,
    OBSERVADA: pendiente,
    APROBADO: aprobado,
    APROBADA: aprobado,
    VALIDADO: aprobado,
    RECHAZADO: rechazado,
    RECHAZADA: rechazado,
    ANULADO: rechazado,
    ANULADA: rechazado,
    LIQUIDADO: estado("Liquidado", "success"),
    APLICADO: estado("Aplicado", "success"),
} satisfies Diccionario;

const elegibilidad = {
    PENDIENTE: pendiente,
    ESPERANDO_OPERACION: estado("Sin operación", "warning"),
    ESPERANDO: estado("Sin operación", "warning"),
    OPERACION_PENDIENTE: pendiente,
    ENCONTRADO: pendiente,
    AMBIGUO: pendiente,
    REQUIERE_DATOS: pendiente,
    VENCIDO: estado("Plazo vencido", "error"),
    ELEGIBLE: estado("Cumple", "success"),
    HABILITADO: estado("Cumple", "success"),
    BONO_HABILITADO: estado("Cumple", "success"),
    NO_ELEGIBLE: estado("No cumple", "error"),
    BLOQUEADO: estado("No cumple", "error"),
    PERDIDO: estado("No cumple", "error"),
    PROVISIONAL: estado("Provisional", "warning"),
    EN_IMPLEMENTACION: estado("En implementación", "warning"),
    PENDIENTE_REVISION_CHATS: pendiente,
    POR_EVALUAR: pendiente,
    META_PENDIENTE: pendiente,
    FUENTE_PENDIENTE: pendiente,
    FUENTE_INVALIDA: estado("Fuente inválida", "warning"),
    SIN_DATOS: pendiente,
    SIN_TARIFA: pendiente,
    SIN_META: pendiente,
    SIN_PERIODO: pendiente,
    ASISTENCIA_PENDIENTE: pendiente,
    NO_APLICA: estado("No aplica", "gray"),
    CONSERVA: estado("Conserva", "success"),
    REVISAR: pendiente,
    SIN_ASIGNACION: estado("Sin asignación", "warning"),
    SIN_JEFE: estado("Sin asignación", "warning"),
    PRESELECCION: estado("Preselección", "warning"),
    PRESELECCION_VALIDABLE: estado("Preselección", "warning"),
    EMPATE: pendiente,
    DESEMPATE_ADMINISTRATIVO: pendiente,
    SIN_CANDIDATOS: estado("Sin candidatos", "gray"),
} satisfies Diccionario;

export const compensacionEstados = {
    aprobacion,
    registro: aprobacion,
    comprobante: {
        ...aprobacion,
        SIN_ENTREGA: estado("Sin entregar", "gray"),
        POR_REVISAR: pendiente,
    },
    operacion: {
        REGISTRADO: estado("Registrado", "gray"),
        PAGADO: estado("Pagado", "success"),
        PAGADA: estado("Pagado", "success"),
        PENDIENTE: pendiente,
        OPERACION_PENDIENTE: pendiente,
    },
    captacionAprobacion: {
        APROBADO: aprobado,
        RECHAZADO: rechazado,
    },
    comision: {
        PENDIENTE: estado("Pendiente", "gray"),
        NO_APLICA: estado("No aplica", "gray"),
    },
    elegibilidad,
    rankingMensual: {
        SIN_FUENTE: estado("Sin fuente", "gray"),
        EN_REVISION: pendiente,
        SIN_CANDIDATOS: estado("Sin candidatos", "gray"),
        LISTO: estado("Listo para adjudicar", "success"),
    },
    seguimiento: { ...aprobacion, ...elegibilidad, PAGADA: estado("Pagado", "success"), PAGO_PARCIAL: estado("Pago parcial", "warning") },
    referido: { ...aprobacion, ...elegibilidad, PENDIENTE: aprobacion.PENDIENTE },
    correccion: { PENDIENTE: pendiente, CORREGIDO: estado("Corregido", "success") },
    periodo: {
        ABIERTO: estado("Abierto", "gray"),
        REABIERTO: estado("Reabierto", "warning"),
        EN_CALCULO: estado("En cálculo", "warning"),
        EN_REVISION: estado("En revisión", "warning"),
        OBSERVADO: estado("Observado", "warning"),
        APROBADO: aprobado,
        CERRADO: estado("Cerrado", "success"),
    },
    liquidacion: {
        ...aprobacion,
        PENDIENTE: pendiente,
        CALCULADA: pendiente,
        PAGO_PARCIAL: estado("Pago parcial", "warning"),
        PAGADA: estado("Pagado", "success"),
        REEMPLAZADA: estado("Reemplazada", "gray"),
    },
    pago: {
        PENDIENTE: estado("Pago pendiente", "warning"),
        PAGO_PARCIAL: estado("Pago parcial", "warning"),
        PAGADA: estado("Pagado", "success"),
        NO_PAGABLE: estado("No pagable", "gray"),
    },
    cierre: { VIGENTE: estado("Vigente", "success"), REVERTIDO: estado("Revertido", "gray"), CERRADO: estado("Cerrado", "success") },
    configuracion: { BORRADOR: estado("Borrador", "gray"), PUBLICADA: estado("Publicada", "success"), RETIRADA: estado("Retirada", "gray") },
    importacion: {
        CARGADA: estado("Cargada", "gray"),
        VALIDADA: estado("Por confirmar", "warning"),
        CONFIRMADA: estado("Confirmada", "success"),
        RECHAZADA: rechazado,
        ANULADA: estado("Anulada", "gray"),
        ERROR: estado("Error", "error"),
    },
    exportacion: { GENERADA: estado("Generado", "success"), ERROR: estado("Error", "error"), ANULADA: estado("Anulado", "gray") },
    personal: { ACTIVO: estado("Activo", "gray"), INACTIVO: estado("Inactivo", "gray") },
    atribucion: {
        VALIDA: estado("Válida", "success"),
        LIBERADA: estado("Liberada", "gray"),
        PENDIENTE: pendiente,
    },
} satisfies Record<string, Diccionario>;

export type GrupoEstado = "PENDIENTE" | "APROBADO" | "RECHAZADO";
const grupoAprobado = new Set([
    "HABILITADO",
    "APROBADA",
    "APROBADO",
    "PAGO_PARCIAL",
    "PAGADA",
    "ELEGIBLE",
    "BONO_HABILITADO",
    "LIQUIDADO",
    "VALIDADO",
    "APLICADO",
    "CONSERVA",
]);
const grupoRechazado = new Set(["RECHAZADO", "RECHAZADA", "ANULADO", "ANULADA", "NO_ELEGIBLE", "BLOQUEADO", "PERDIDO"]);
/** Agrupa por significado; debe coincidir con f_private_compensacion_estado_grupo (SQL 139). */
export const grupoDeEstado = (valorCrudo: unknown, pendiente?: boolean | null): GrupoEstado => {
    const key = typeof valorCrudo === "string" ? valorCrudo.trim().toUpperCase().replace(/\s+/g, "_") : "";
    if ((key === "PROVISIONAL" || key === "EN_IMPLEMENTACION") && pendiente === false) return "APROBADO";
    return grupoAprobado.has(key) ? "APROBADO" : grupoRechazado.has(key) ? "RECHAZADO" : "PENDIENTE";
};

export type EstadoDominio = keyof typeof compensacionEstados | "dashboard";

/** Solo normaliza la presentación; nunca escribe ni altera los estados del servidor. */
export const estadoVisual = (dominio: EstadoDominio, valorCrudo: unknown): EstadoVisual => {
    if (dominio === "dashboard") return { ...{ PENDIENTE: pendiente, APROBADO: aprobado, RECHAZADO: rechazado }[grupoDeEstado(valorCrudo)] };
    const key =
        typeof valorCrudo === "string"
            ? valorCrudo
                  .trim()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toUpperCase()
                  .replace(/\s+/g, "_")
            : "";
    const mapa: Diccionario = compensacionEstados[dominio as keyof typeof compensacionEstados];
    return { ...(Object.hasOwn(mapa, key) ? mapa[key] : dominio === "captacionAprobacion" ? aprobacion.PENDIENTE : pendiente) };
};

/** Conserva las claves de filtros/RPC; únicamente traduce la etiqueta visible. */
export const textosEstado = (dominio: EstadoDominio, claves: readonly string[]): Record<string, string> =>
    Object.fromEntries(claves.map((key) => [key, estadoVisual(dominio, key).label]));

/**
 * Opciones de un filtro de estado sin etiquetas repetidas: varias claves del servidor pueden mostrarse igual
 * (p. ej. BORRADOR y PENDIENTE son "Pendiente"). Conserva la primera clave de cada etiqueta.
 */
export const opcionesEstado = (dominio: EstadoDominio, claves: readonly string[]): { id: string; label: string }[] => {
    const vistos = new Set<string>();
    return claves.flatMap((id) => {
        const { label } = estadoVisual(dominio, id);
        if (vistos.has(label)) return [];
        vistos.add(label);
        return [{ id, label }];
    });
};

/** Filtro del Dashboard: tres grupos; el servidor los reconoce como GRUPO_*. */
export const opcionesGrupoEstado = [
    { id: "GRUPO_PENDIENTE", label: "Pendiente" },
    { id: "GRUPO_APROBADO", label: "Aprobado" },
    { id: "GRUPO_RECHAZADO", label: "Rechazado" },
];
