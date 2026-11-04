import type { OperacionProceso } from "../../shared/types/operaciones.types";
import { formatMoney } from "../../shared/utils/money";

export const PosDeleteSummary = ({ operation }: { operation: OperacionProceso }) => (
    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-secondary bg-secondary p-3 text-sm">
        {[
            ["POS", operation.nombre_pos],
            ["Empresa", operation.nombre_empresa_pos],
            ["Cod. Operacion", operation.codigo_operacion_deposito_cliente],
            ["Entidad Tarjeta", operation.nombre_banco_cliente],
            ["DNI", operation.dni_cliente],
            ["Monto Deposito", formatMoney(operation.monto_deposito_cliente)],
        ].map(([label, value]) => (
            <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-tertiary">{label}</dt>
                <dd className="break-words font-medium text-primary">{value || "—"}</dd>
            </div>
        ))}
    </dl>
);
