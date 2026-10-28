import { CompactBadgeLine } from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";

export const PagoDeudaDevolucion = ({ row }: { row: Pick<OperacionProceso, "pd_retorno_monto_devolucion" | "monto_devuelto" | "pd_match_multiple"> }) => (
    <div className="flex flex-col items-start gap-1 tabular-nums">
        <span>{formatMoney(row.pd_retorno_monto_devolucion ?? row.monto_devuelto ?? 0)}</span>
        {row.pd_match_multiple && (
            <span title="Devolución compartida: este monto corresponde únicamente a esta operación.">
                <CompactBadgeLine color="success">Conciliado</CompactBadgeLine>
            </span>
        )}
    </div>
);
