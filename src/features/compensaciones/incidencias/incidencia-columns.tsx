import type { ColumnDef } from "@/components/shared/data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { MontoCell, NotasCell, PersonaCell, missingAmountLabel } from "../shared/compensacion-cells";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import type { IncidenciaEvento } from "./incidencias.types";

export const incidenciaRows = (items: IncidenciaEvento[]): Record<string, unknown>[] =>
    items.map((item) => ({
        id: item.id,
        tipo: item.penalidadNombre,
        motivo: item.motivo,
        reportante: item.reportanteNombre,
        sedeOrigen: item.sucursalOrigenNombre,
        responsable: item.responsableNombre,
        documento: item.responsableDocumento,
        sedeResponsable: item.sucursalResponsableNombre,
        fecha: item.fechaEvento,
        descuento: item.montoReferencia,
        descuentoAprobado: item.importeAprobado,
        bono: item.montoBonoReportante,
        estado: item.estado,
    }));

export const incidenciaColumns = (category: string): ColumnDef[] => [
    {
        key: "responsable",
        header: "Colaborador",
        render: (value, row) => <PersonaCell name={String(value ?? "—")} detail={[row.documento, row.sedeResponsable].filter(Boolean).join(" · ")} />,
    },
    { key: "tipo", header: category === "AUDITORIA_PAGO" ? "Error reportado" : "Penalidad", render: (value) => <NotasCell value={value} /> },
    { key: "motivo", header: "Motivo", render: (value) => <NotasCell value={value} /> },
    { key: "reportante", header: "Registrado por", render: (value, row) => <PersonaCell name={String(value ?? "—")} detail={String(row.sedeOrigen ?? "")} /> },
    {
        key: "descuento",
        header: "Tarifa",
        align: "right",
        render: (value) => <MontoCell value={Number(value)} />,
    },
    {
        key: "descuentoAprobado",
        header: "Monto",
        align: "right",
        render: (value, row) =>
            value === null || value === undefined ? (
                <span className="text-tertiary">{missingAmountLabel(row.estado)}</span>
            ) : (
                <MontoCell value={Number(value)} />
            ),
    },
    ...(category === "AUDITORIA_PAGO"
        ? [
              {
                  key: "bono",
                  header: "Monto previsto",
                  align: "right" as const,
                  render: (value: unknown) => (value === null || value === undefined ? "—" : <MontoCell value={Number(value)} />),
              },
          ]
        : []),
    {
        key: "estado",
        header: "Estado",
        render: (value) => <CompensacionEstado dominio="registro" valor={value} />,
    },
    { key: "fecha", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
];
