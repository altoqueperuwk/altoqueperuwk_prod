interface DeleteContext {
    ruta: string;
    estado: string | null | undefined;
    idEstado?: number | null;
    isAdministrator: boolean;
    isJefeTienda: boolean;
    canManage: boolean;
}

export const canDeleteAssistedOperation = (context: DeleteContext) => {
    const state = String(context.estado ?? "").trim().toUpperCase();
    if (context.idEstado === 10 || state === "ELIMINADO") return false;
    if (context.ruta === "linkpago") return context.isAdministrator || context.isJefeTienda;
    const isPaid = context.idEstado === 4 || state === "PAGADO";
    if (context.ruta === "pos" && isPaid) return context.isAdministrator || context.isJefeTienda;
    return context.canManage && !isPaid;
};
