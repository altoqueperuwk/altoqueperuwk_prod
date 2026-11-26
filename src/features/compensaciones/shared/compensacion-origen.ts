/**
 * Opción de Compensaciones donde se ve cada Bono o Penalidad, para los perfiles Atención al cliente y Jefe de sede.
 * Incluye Facturación, Pagos y Marketing. Las rutas salen de `compensacion-destinos.ts`.
 */
export interface OrigenConcepto {
    modulo: string;
    href?: string;
    /** Regla del Esquema 12; se muestra como ayuda del concepto. */
    regla: string;
    /** Quién valida el registro, cuando es distinto del flujo habitual (p. ej. "Gerencia"). */
    valida?: string;
}

/** Ayuda del concepto: regla del Esquema 12 y, si existe, quién valida. */
export const ayudaDeConcepto = (origen: OrigenConcepto | null | undefined) =>
    origen ? (origen.valida ? `${origen.regla}. Valida: ${origen.valida}` : origen.regla) : undefined;

const root = "/compensaciones";
const otros = (codigo: string) => `${root}/otros-bonos/${codigo}`;
const atenciones = { modulo: "Registro Nuevo", href: `${root}/atenciones` };
const incidencias = { modulo: "Incidencias", href: `${root}/incidencias` };
const uniforme = { modulo: "Incidencias", href: `${root}/incidencias?concepto=uniforme` };
const indisciplina = { modulo: "Incidencias", href: `${root}/incidencias?concepto=indisciplina` };
const faltasMarketing = { modulo: "Indisciplina Colaborador", href: `${root}/indisciplina-colaborador` };
const cuadreCierre = { modulo: "Auditoría Cuadre y Cierre", href: `${root}/auditoria-cuadre-cierre` };
const auditoriaOperaciones = { modulo: "Auditoría Operaciones", href: `${root}/auditoria-operaciones` };
const safetypay = { modulo: "SafetyPay", href: otros("meta_sede_safetypay") };

export const origenPorConcepto: Readonly<Record<string, OrigenConcepto>> = {
    BONO_COLABORADOR_MES: {
        modulo: "Colaborador del Mes",
        href: otros("colaborador_mes_atenciones"),
        regla: "Mayor número de atenciones o calificaciones de 4 o 5 estrellas del mes",
    },
    BONO_INNOVACION: { modulo: "Propuesta de Innovación", href: otros("propuesta_innovacion"), regla: "Propuesta aprobada e implementada por Gerencia" },
    BONO_SEGURIDAD_TARJETA: {
        modulo: "Tarjetas Erróneas",
        href: `${root}/tarjetas-erroneas`,
        regla: "Detección de los 4 últimos dígitos de una tarjeta de tercero",
    },
    BONO_META_SEDE: { ...safetypay, regla: "La sede alcanza la meta del mes y el equipo cumple el candado de calidad y la cuota diaria" },
    BONO_META_AREA: { ...safetypay, regla: "El área alcanza el 80 % de la meta; el bono se reparte en toda la sede" },
    BONO_REGISTRO_PRESENCIAL: { ...atenciones, regla: "Atención o registro presencial hecho en el sistema y calificado" },
    COMISION_REGISTRO_EFECTIVIZACION: { ...atenciones, regla: "Cliente nuevo que opera dentro de los primeros 7 días" },
    COMISION_CALIFICACION_PRESENCIAL: { modulo: "Atención Calificada", href: `${root}/calificaciones`, regla: "Atención calificada con 4 o 5 estrellas" },
    COMISION_LLAMADA: { modulo: "Llamadas", href: `${root}/llamadas`, regla: "Llamada entrante contestada por Pancake" },
    COMISION_REFERIDO: { modulo: "Referidos", href: `${root}/referidos`, regla: "Efectivización del referido, sujeta al 1 % de efectivización" },
    COMISION_TIKTOK_LIVE: { modulo: "TikTok Live", href: otros("tiktok_live"), regla: "Cliente registrado en un Live que opera dentro de los primeros 7 días" },
    COMISION_AUDITORIA_ACTIVA: {
        modulo: "Auditoría de Pagos",
        href: `${root}/auditoria-activa`,
        regla: "Error de su equipo detectado, reportado y corregido antes de escalar",
    },
    ATC_ERROR_DATOS: { ...incidencias, regla: "Dato errado remanente en el formulario, detectado por Facturación o por el Jefe de Tienda" },
    ATC_ABANDONO_CHAT: { ...incidencias, regla: "Chat con más de 20 minutos sin respuesta o comprobante ignorado" },
    ATC_MAL_FLUJO: { ...incidencias, regla: "Se omitió el protocolo obligatorio de CMR o SafetyPay" },
    ATC_PROCESO_AIRE: { ...incidencias, regla: "Conversación dejada sin registrar los datos obligatorios" },
    ATC_ERROR_REGISTRO: { ...incidencias, regla: "DNI, nombre, celular, correo o código de comunidad mal ingresado" },
    ATC_UNIFORME: { ...uniforme, regla: "Día sin el polo o uniforme oficial, una vez perdido el bono de puntualidad" },
    ATC_INDISCIPLINA: { ...indisciplina, regla: "Incidencia en cámaras o auditoría" },
    JEFE_ERROR_SUPERVISION: { ...incidencias, regla: "Error de su personal que pasó su filtro y lo detecta recién Facturación" },
    JEFE_ABANDONO_SOLIDARIO: { ...incidencias, regla: "Su personal deja chats con más de 20 minutos sin responder" },
    JEFE_QUEJA_TARDIA: { ...incidencias, regla: "Gerencia recibe quejas antiguas que el Jefe no solucionó ni reportó" },
    JEFE_UNIFORME: { ...uniforme, regla: "Día del Jefe de Tienda sin el polo corporativo" },
    JEFE_INDISCIPLINA: { ...indisciplina, regla: "Incidencia en cámaras o auditoría" },
    // Facturación
    BONO_DETECCION_ERROR_PAGO: {
        modulo: "Auditoría de Pagos",
        href: `${root}/auditoria-activa`,
        regla: "Error de pago detectado y reportado con sustento",
        valida: "Gerencia",
    },
    BONO_OPERACION_EXTRA: {
        modulo: "Auditoría de Pagos",
        href: `${root}/auditoria-activa`,
        regla: "Operación real no registrada, reportada con sustento",
        valida: "Gerencia",
    },
    FAC_ERROR_SOLUCION: { ...incidencias, regla: "Error operativo omitido que tuvo solución", valida: "Gerencia" },
    FAC_ERROR_SIN_SOLUCION: { ...incidencias, regla: "Error crítico omitido que no tuvo solución", valida: "Gerencia" },
    FAC_UNIFORME: { ...incidencias, regla: "Día sin el polo o uniforme oficial, una vez perdido el bono de puntualidad", valida: "Gerencia" },
    FAC_INDISCIPLINA: { ...incidencias, regla: "Incidencia confirmada, una vez perdido el bono de puntualidad", valida: "Gerencia" },
    // Pagos: cuadre y cierres en Auditoría Cuadre y Cierre; vouchers y pagos críticos en Auditoría Operaciones.
    BONO_CUADRE_PERFECTO: { ...cuadreCierre, regla: "Mes terminado y sin Descuadre; lo registra Administración con evidencia" },
    PAG_CIERRE_INCOMPLETO: { ...cuadreCierre, regla: "Cierre diario sin completar dentro de las 48 horas desde el pago" },
    PAG_RETRASO_VOUCHER: { ...auditoriaOperaciones, regla: "Voucher fuera del plazo de 48 horas desde el pago" },
    PAG_DESCUADRE: { ...cuadreCierre, regla: "Diferencia de cuadre en el cierre diario" },
    PAG_ERROR_PAGO_CRITICO: { ...auditoriaOperaciones, regla: "Error de pago crítico: descuento del 100 % del monto (mínimo S/ 40)" },
    BONO_DETECCION_ERROR_MANUAL: {
        modulo: "Auditoría de Pagos",
        href: `${root}/auditoria-activa`,
        regla: "Error en datos manuales detectado y reportado antes de transferir",
    },
    BONO_REPORTE_ABANDONO: { modulo: "Abandono Comercial", href: otros("reporte_abandono"), regla: "Chat abandonado reportado con sustento" },
    PAG_UNIFORME: { ...incidencias, regla: "Día sin el polo o uniforme oficial, una vez perdido el bono de puntualidad" },
    PAG_INDISCIPLINA: { ...incidencias, regla: "Incidencia confirmada, una vez perdido el bono de puntualidad" },
    PAG_ERROR_CUADRO: { ...incidencias, regla: "Error en el cuadro de comisiones: descuento escalonado de 30 %, 60 % o 90 %" },
    // Marketing: Alerta Temprana vive en Auditoría Operaciones y las faltas en Indisciplina Colaborador.
    BONO_VIDEO_VIRAL: {
        modulo: "Video Viral",
        href: otros("video_viral"),
        regla: "Video publicado con 10,000 vistas, 500 reacciones y 5 comentarios reales en el mes",
    },
    BONO_RECUPERACION: {
        modulo: "Recuperación",
        href: otros("recuperacion_cliente"),
        regla: "Cliente inactivo por más de 60 días que vuelve a operar",
    },
    COMISION_ALERTA_TEMPRANA: {
        modulo: "Auditoría Operaciones",
        href: `${root}/auditoria-operaciones`,
        regla: "Alerta reportada a tiempo por un error de datos o un chat sin respuesta de más de 20 minutos; el monto se descuenta al asesor responsable",
        valida: "Jefe de Tienda y Administrador",
    },
    MKT_UNIFORME: { ...faltasMarketing, regla: "Día sin el polo o uniforme oficial; la primera falta del mes no descuenta" },
    MKT_INDISCIPLINA: { ...faltasMarketing, regla: "Incidencia confirmada; la primera falta del mes no descuenta" },
    // Sin opción de destino todavía: la acción vuelve al detalle interno.
    JEFE_ERROR_CUADRO: { modulo: "Cierres", regla: "Errores en sus reportes administrativos: descuento escalonado de 30 %, 60 % o 90 %" },
};

export const origenDeConcepto = (codigo: unknown): OrigenConcepto | null =>
    typeof codigo === "string" && Object.hasOwn(origenPorConcepto, codigo) ? origenPorConcepto[codigo] : null;
