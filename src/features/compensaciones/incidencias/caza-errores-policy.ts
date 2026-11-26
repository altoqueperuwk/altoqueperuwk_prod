export type CazaErroresOption = "MAL_FLUJO_SAFETYPAY" | "CONVERSACION_PROCESO" | "ERROR_REGISTRO";
export type CazaErroresCode = "ATC_ERROR_DATOS" | "ATC_ERROR_REGISTRO" | "ATC_MAL_FLUJO" | "ATC_PROCESO_AIRE" | "ATC_ABANDONO_CHAT";

export const cazaErroresLegacyRoutes: Record<string, string> = {
    "/compensaciones/auditoria-activa/mal-flujo-safetypay": "/compensaciones/incidencias",
    "/compensaciones/auditoria-activa/conversacion-proceso": "/compensaciones/incidencias",
    "/compensaciones/auditoria-activa/error-registro": "/compensaciones/incidencias",
    "/compensaciones/mal-flujo-safetypay": "/compensaciones/incidencias",
    "/compensaciones/conversacion-al-aire": "/compensaciones/incidencias",
    "/compensaciones/error-registro-codigo": "/compensaciones/incidencias",
};

export const cazaErroresConceptChoices: Record<CazaErroresOption, readonly { id: string; label: string; code: CazaErroresCode }[]> = {
    MAL_FLUJO_SAFETYPAY: [],
    CONVERSACION_PROCESO: [
        { id: "CHAT", label: "Abandono de chat", code: "ATC_ABANDONO_CHAT" },
        { id: "PROCESO", label: "Proceso al aire", code: "ATC_PROCESO_AIRE" },
    ],
    ERROR_REGISTRO: [
        { id: "DATOS", label: "Error de datos", code: "ATC_ERROR_DATOS" },
        { id: "MANUAL", label: "Error Registro Manual", code: "ATC_ERROR_REGISTRO" },
        { id: "CODIGO", label: "Error de Códigos", code: "ATC_ERROR_REGISTRO" },
    ],
};

export const cazaErroresOptions: Record<CazaErroresOption, { route: string; title: string; codes: readonly CazaErroresCode[] }> = {
    MAL_FLUJO_SAFETYPAY: {
        route: "/compensaciones/mal-flujo-safetypay",
        title: "Mal Flujo SafetyPay",
        codes: ["ATC_MAL_FLUJO"],
    },
    CONVERSACION_PROCESO: {
        route: "/compensaciones/conversacion-al-aire",
        title: "Conversación al Aire",
        codes: ["ATC_ABANDONO_CHAT", "ATC_PROCESO_AIRE"],
    },
    ERROR_REGISTRO: {
        route: "/compensaciones/error-registro-codigo",
        title: "Error en Registro o Código",
        codes: ["ATC_ERROR_DATOS", "ATC_ERROR_REGISTRO"],
    },
};

export const cazaErroresDetailOptions: Record<CazaErroresCode, readonly string[]> = {
    ATC_MAL_FLUJO: ["Monto vacío/erróneo", "Código vacío"],
    ATC_ABANDONO_CHAT: ["Demora (+20 min)", "Chat desatendido", "Voucher ignorado"],
    ATC_PROCESO_AIRE: ["Cuenta incompleta", "Tarjeta incompleta"],
    ATC_ERROR_DATOS: [
        "DNI incorrecto",
        "Nombre incorrecto",
        "Celular incorrecto",
        "Correo incorrecto",
        "Código de comunidad incorrecto",
        "Otro dato incorrecto",
    ],
    ATC_ERROR_REGISTRO: [
        "DNI incorrecto",
        "Nombre incorrecto",
        "Celular incorrecto",
        "Correo incorrecto",
        "Código de comunidad incorrecto",
        "Otro dato incorrecto",
    ],
};

export const cazaErroresLabel: Record<CazaErroresCode, string> = {
    ATC_MAL_FLUJO: "Mal Flujo SafetyPay",
    ATC_ABANDONO_CHAT: "Abandono Chat",
    ATC_PROCESO_AIRE: "Dejar Conversación al Aire",
    ATC_ERROR_DATOS: "Error de Datos",
    ATC_ERROR_REGISTRO: "Error en Registro o Código",
};

export const cazaErroresCodeFromPath = (pathname: string): CazaErroresOption | undefined =>
    (Object.entries(cazaErroresOptions) as [CazaErroresOption, (typeof cazaErroresOptions)[CazaErroresOption]][]).find(
        ([, value]) => value.route === pathname,
    )?.[0];
