import type { ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export const mixColumns: ColumnDef[] = [
    {
        key: "tipo",
        header: "Tipo",
        render: (value) => <StatusBadge tone={value === "BONO" ? "success" : "error"}>{value === "BONO" ? "Bono" : "Penalidad"}</StatusBadge>,
    },
    {
        key: "detalle",
        header: "Detalle",
        render: (value, row) => (
            <div className="max-w-72 min-w-0 text-xs">
                <p className="font-medium break-words text-primary">{String(value ?? "—")}</p>
                {row.detalle2 ? <p className="break-words text-tertiary">{String(row.detalle2)}</p> : null}
            </div>
        ),
    },
    { key: "registradoPor", header: "Registrado por", render: (value) => <NombreCell value={value} /> },
    { key: "fecha", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
    {
        key: "monto",
        header: "Monto",
        align: "right",
        render: (value, row) =>
            value === null || value === undefined ? (
                <span className="text-tertiary">—</span>
            ) : (
                <span className={`whitespace-nowrap tabular-nums ${row.tipo === "PENALIDAD" ? "text-error-primary" : "text-success-primary"}`}>
                    {money.format(Number(value))}
                </span>
            ),
    },
    { key: "estado", header: "Estado", render: (value) => <CompensacionEstado dominio="registro" valor={value} /> },
];
