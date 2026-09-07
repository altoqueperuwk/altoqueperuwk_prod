const MOVEMENT_ORIGIN_LABELS: Record<string, string> = {
    PAGO_DEUDA_COMISION: "Pago Deuda Comision",
    PAGO_DEUDA_DEVOLUCION: "Pago Deuda Devolucion",
    PAGO_DEUDA: "Pago Deuda Transferido",
    DIRECTO_CAJA: "Directo",
    EFECTIVIZACION: "Efectivización",
    OTROS: "Otros",
    "TRANSFERENCIA INTERNA": "Movimiento Saldo",
    "EDICION SALDO INICIAL CAJA": "Edicion de Saldo Inicial Caja",
    "GASTO OPERACIONAL CIERRE": "Gasto Operacional Cierre",
};

export const formatMovimientoOrigen = (value: string | null | undefined) => {
    const normalized = (value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    return MOVEMENT_ORIGIN_LABELS[normalized] ?? value ?? "-";
};

export const formatMovimientoTipo = (value: string | null | undefined) => {
    const normalized = (value ?? "").trim().toUpperCase();
    if (normalized === "INGRESO") return "Ingreso";
    if (normalized === "SALIDA") return "Salida";
    return value ?? "-";
};
