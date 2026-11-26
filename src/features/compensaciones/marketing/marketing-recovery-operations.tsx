import { Check } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { formatoMonto } from "../shared/compensacion-formato";
import type { MarketingOperacion } from "./marketing.service";

/** Operaciones pagadas del DNI con sus días sin actividad; solo se elige la que cumple la inactividad que exige el servidor. */
export const MarketingRecoveryOperations = ({
    operations,
    selected,
    onSelect,
}: {
    operations: MarketingOperacion[];
    selected: string;
    onSelect: (id: number) => void;
}) => (
    <div className="w-full overflow-x-auto rounded-lg border border-secondary">
        <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary text-xs text-tertiary">
                <tr>
                    {["Fecha Pago", "Operación", "Cliente", "Servicio", "Monto", "Días sin Actividad", ""].map((header, index) => (
                        <th key={index} className="px-3 py-2 font-medium">
                            {header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="text-secondary">
                {operations.map((operation) => (
                    <tr key={operation.id} className="border-t border-secondary">
                        <td className="px-3 py-2">
                            <CompensacionFechaCell value={operation.fecha_pago} />
                        </td>
                        <td className="px-3 py-2">{operation.codigo || operation.id}</td>
                        <td className="px-3 py-2">{operation.cliente}</td>
                        <td className="px-3 py-2">{operation.servicio}</td>
                        <td className="px-3 py-2 tabular-nums">{formatoMonto(operation.monto)}</td>
                        <td className="px-3 py-2 tabular-nums">{operation.dias_inactivo ?? "Sin historial"}</td>
                        <td className="px-3 py-2 text-right">
                            {operation.recuperable ? (
                                <Button
                                    size="xs"
                                    color={selected === String(operation.id) ? "primary" : "secondary"}
                                    iconLeading={selected === String(operation.id) ? Check : undefined}
                                    aria-label={`Elegir operación ${operation.codigo || operation.id}`}
                                    onClick={() => onSelect(operation.id)}
                                >
                                    {selected === String(operation.id) ? "Elegida" : "Elegir"}
                                </Button>
                            ) : (
                                <span className="text-xs text-tertiary">No cumple</span>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
