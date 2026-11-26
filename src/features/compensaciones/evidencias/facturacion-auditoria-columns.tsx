import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { MontoCell, NombreCell } from "../shared/compensacion-cells";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { money, tipos } from "./facturacion-auditoria-constantes";
import { type FacturacionReporte, facturacionEstadoVisible, facturacionLiquidado } from "./facturacion-auditoria.service";

const operacionDe = (row: FacturacionReporte) => ("operacion_actual" in row ? row.operacion_actual : row.datos.operacion);

/** Orden del glosario: DNI, Cliente, Reporte, Fecha, Estado, Liquidación, Operación, Monto efectivizado, Monto. La operación vinculada es solo dato, no estado. */
export const facturacionColumnas = (esAdmin: boolean): ColumnDef[] => [
    {
        key: "dni",
        header: "DNI",
        render: (_, r) => <span className="text-xs whitespace-nowrap tabular-nums">{(r as FacturacionReporte).datos.cliente_documento}</span>,
    },
    { key: "cliente", header: "Cliente", render: (value) => <NombreCell value={value} /> },
    ...(esAdmin ? [{ key: "beneficiario", header: "Registrado por", render: (value: unknown) => <NombreCell value={value} /> }] : []),
    {
        key: "tipo",
        header: "Reporte",
        render: (_, r) => (
            <div className="text-xs">
                {tipos.find((t) => t.id === r.tipo)?.label}
                <p className="mt-1 text-tertiary">{String((r as FacturacionReporte).datos.momento_reporte ?? "Antes del Registro").replaceAll("_", " ")}</p>
            </div>
        ),
    },
    {
        key: "fecha_evento",
        header: "Fecha",
        render: (value) => (
            <div className="text-xs">
                <CompensacionFechaCell value={value} />
            </div>
        ),
    },
    {
        key: "estado_evento",
        header: "Estado",
        minWidth: 110,
        render: (_, row) => <CompensacionEstado dominio="registro" valor={facturacionEstadoVisible(row as FacturacionReporte)} />,
    },
    {
        key: "liquidacion",
        header: "Liquidación",
        minWidth: 100,
        render: (_, row) => <span className="text-xs">{facturacionLiquidado(row as FacturacionReporte) ? "Sí" : "No"}</span>,
    },
    {
        key: "codigo_operacion",
        header: "Operación",
        render: (_, r) => {
            const row = r as FacturacionReporte;
            const op = operacionDe(row);
            return op ? (
                <div className="space-y-1 text-xs">
                    <span className="text-primary">{op.codigo ?? "Sin código"}</span>
                    <p className="text-tertiary">{op.servicio}</p>
                </div>
            ) : (
                <span className="text-xs text-tertiary">{row.datos.operacion ? "Fuente no disponible" : "Sin vincular"}</span>
            );
        },
    },
    {
        key: "monto_operacion",
        header: "Monto efectivizado",
        align: "right",
        render: (_, r) => {
            const op = operacionDe(r as FacturacionReporte);
            return op ? <MontoCell value={op.monto} /> : <span className="text-xs text-tertiary">—</span>;
        },
    },
    {
        key: "importe_aprobado",
        header: "Monto",
        align: "right",
        render: (value, row) => (
            <span className="text-xs whitespace-nowrap tabular-nums">{row.requiere_revision || value == null ? money(null) : money(Number(value))}</span>
        ),
    },
];
