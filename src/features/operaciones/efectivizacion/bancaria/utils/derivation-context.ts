import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

type DerivationContext = Pick<OperacionProceso, "flag_derivado" | "ruta_origen" | "ruta_destino" | "id_empresa_salida" | "id_empresa_cuenta_salida" | "id_empresa_salida_origen" | "id_empresa_cuenta_salida_origen">;

// Legacy self-derivations are still payable at their only destination account.
// Never infer equality from missing account metadata.
export const isSelfDerivedOperation = (row: DerivationContext) => row.flag_derivado === true
    && row.id_empresa_salida != null && row.id_empresa_salida_origen != null
    && row.id_empresa_cuenta_salida != null && row.id_empresa_cuenta_salida_origen != null
    && Number(row.id_empresa_salida) === Number(row.id_empresa_salida_origen)
    && Number(row.id_empresa_cuenta_salida) === Number(row.id_empresa_cuenta_salida_origen)
    && Boolean(row.ruta_origen?.trim()) && Boolean(row.ruta_destino?.trim())
    && row.ruta_origen?.trim().toLowerCase() === row.ruta_destino?.trim().toLowerCase();

export const isDerivedOriginForContext = (row: DerivationContext, companyId: number | null, accountId: number | null) => {
    if (!row.flag_derivado || isSelfDerivedOperation(row) || companyId == null || row.id_empresa_salida_origen == null) return false;
    if (Number(row.id_empresa_salida_origen) !== Number(companyId)) return false;
    return accountId == null || row.id_empresa_cuenta_salida_origen == null || Number(row.id_empresa_cuenta_salida_origen) === Number(accountId);
};

export const isDerivedReceiverOperation = (row: DerivationContext, companyId: number | null, accountId: number | null) => {
    if (row.flag_derivado !== true || companyId == null || row.id_empresa_salida == null || Number(row.id_empresa_salida) !== Number(companyId)) return false;
    if (accountId != null && row.id_empresa_cuenta_salida != null && Number(row.id_empresa_cuenta_salida) !== Number(accountId)) return false;
    if (isSelfDerivedOperation(row)) return true;
    const matchesOrigin = Number(row.id_empresa_salida_origen) === Number(companyId)
        && (accountId != null ? row.id_empresa_cuenta_salida_origen == null || Number(row.id_empresa_cuenta_salida_origen) === Number(accountId)
            : Number(row.id_empresa_cuenta_salida) === Number(row.id_empresa_cuenta_salida_origen));
    return !matchesOrigin;
};
