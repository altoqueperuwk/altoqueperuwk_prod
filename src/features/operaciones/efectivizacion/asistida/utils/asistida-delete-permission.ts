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
    return context.canManage && state !== "PAGADO";
};
