import type { ComponentProps } from "react";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { NombreCell } from "./compensacion-cells";

const numericKey =
    /^(monto|importe|total|saldo|sueldo|tarifa|comision|ganancia|cantidad|minutos|dias|mensajes|respuestas|porcentaje|bono|penalidad|aporte|neto|descuentos|pagado|pendientes|paid|amount|bruto|tardanza|extras)(_|[A-Z]|$)/;
export const columnasCompensacion = (columns: ColumnDef[]): ColumnDef[] =>
    columns.map((column) => ({
        ...column,
        align: numericKey.test(column.key) ? "right" : (column.align ?? "left"),
        render:
            column.render ??
            (/^(nombre|cliente|colaborador|colaborador_nombre|asesor|reportante)$/.test(column.key)
                ? (value: unknown) => <NombreCell value={value} />
                : undefined),
    }));

/** Estándar opt-in de Compensaciones; no altera el comportamiento de Operaciones. */
export const CompensacionDataTable = (props: ComponentProps<typeof DataTable>) => (
    <DataTable
        density="compact"
        wrapText
        rowAccent={Boolean(props.renderActions)}
        minColumnWidth={140}
        {...props}
        columns={columnasCompensacion(props.columns)}
    />
);
