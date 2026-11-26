import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { MontoCell, NombreCell, NotasCell } from "../shared/compensacion-cells";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { formatoMonto } from "../shared/compensacion-formato";
import { alertaContrapartida } from "./alerta-temprana-contrapartida";

type Row = Record<string, unknown>;

/** Alerta Temprana: un solo estado (Pendiente, Aprobado, Rechazado) y la contrapartida visible en la fila aprobada. */
export const alertaTempranaColumns = (): ColumnDef[] => [
    { key: "fecha", header: "Fecha", minWidth: 110, render: (value) => <CompensacionFechaCell value={String(value)} /> },
    { key: "titulo", header: "Título", minWidth: 120 },
    { key: "descripcion", header: "Detalle", minWidth: 150, render: (value) => <NotasCell value={value} /> },
    { key: "responsable", header: "Colaborador", minWidth: 140, render: (value) => <NombreCell value={value} /> },
    { key: "operacion", header: "Operación", minWidth: 100, render: (value) => (value ? String(value) : "—") },
    {
        key: "validacion",
        header: "Validación Jefe",
        minWidth: 120,
        render: (value: unknown, row: Row) =>
            value === "APROBADO" ? "Validado" : value === "RECHAZADO" ? "Rechazado" : row.estado === "PENDIENTE" ? "Por validar" : "—",
    },
    {
        key: "estado",
        header: "Estado",
        minWidth: 110,
        render: (value) => <CompensacionEstado dominio="registro" valor={value === "LIQUIDADO" ? "APROBADO" : value} />,
    },
    {
        key: "contrapartida",
        header: "Contrapartida",
        minWidth: 190,
        render: (_: unknown, row: Row) => {
            const link = alertaContrapartida(row);
            if (!link) return "—";
            return (
                <div className="max-w-64 space-y-1 text-xs whitespace-normal">
                    {link.bono != null && <p className="text-primary">Bono Marketing {formatoMonto(link.bono)}</p>}
                    {link.cubierta ? (
                        <p className="text-tertiary">Descuento cubierto por otra penalidad del asesor</p>
                    ) : (
                        link.penalidadCodigo && (
                            <p className="text-tertiary">
                                Penalidad del asesor {link.penalidadNombre || link.penalidadCodigo}
                                {link.penalidadMonto != null ? ` · ${formatoMonto(link.penalidadMonto)}` : ""}
                            </p>
                        )
                    )}
                </div>
            );
        },
    },
    {
        key: "importe",
        header: "Monto",
        align: "right",
        minWidth: 100,
        render: (value, row) => (value == null || row.estado !== "APROBADO" ? "—" : <MontoCell value={value} />),
    },
    {
        key: "evidencia",
        header: "Evidencia",
        minWidth: 90,
        render: (value) =>
            value ? (
                <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                    Abrir
                </a>
            ) : (
                "—"
            ),
    },
    { key: "resultado", header: "Respuesta", minWidth: 120 },
];
