import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { MontoCell, NombreCell, NotasCell } from "../shared/compensacion-cells";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import type { EvidenciaEvento } from "./evidencias.types";
import type { PagosDeteccionTipo } from "./pagos-detecciones.service";

type Registro = Record<string, unknown>;
const texto = (value: unknown) => (typeof value === "string" && value.trim() ? value : "—");

/** Filas de la tabla: la operación y la captura salen del snapshot guardado en el reporte. */
export const pagosDeteccionesFilas = (items: EvidenciaEvento[]): Registro[] =>
    items.map((item) => {
        const source = (item.datos.operacion ?? {}) as Registro;
        const captura = (item.datos.captura ?? {}) as Registro;
        return {
            id: item.id,
            dni: source.dni ?? "—",
            cliente: source.cliente ?? "—",
            codigo: source.codigo ?? "—",
            fecha: item.fechaEvento,
            conversacion: texto(captura.chat),
            detalle: item.descripcion,
            estado: item.estado,
            montoOperacion: typeof source.monto === "number" ? source.monto : null,
            monto: item.importeAprobado,
        };
    });

/** Orden del glosario: DNI, Cliente, Operación, Fecha, Detalle, Estado, Monto efectivizado, Monto. */
export const pagosDeteccionesColumnas = (tipo: PagosDeteccionTipo): ColumnDef[] => [
    { key: "dni", header: "DNI", render: (v) => <span className="whitespace-nowrap tabular-nums">{String(v)}</span> },
    { key: "cliente", header: "Cliente", render: (value) => <NombreCell value={value} /> },
    { key: "codigo", header: "Operación" },
    { key: "fecha", header: "Fecha de registro", render: (v) => <CompensacionFechaCell value={String(v)} /> },
    ...(tipo === "REPORTE_ABANDONO" ? [{ key: "conversacion", header: "Conversación", render: (value: unknown) => <NotasCell value={value} /> }] : []),
    { key: "detalle", header: "Detalle", render: (value) => <NotasCell value={value} /> },
    { key: "estado", header: "Estado", minWidth: 110, render: (v) => <CompensacionEstado dominio="registro" valor={v} /> },
    ...(tipo === "DETECCION_ERROR_MANUAL"
        ? [
              {
                  key: "montoOperacion",
                  header: "Monto efectivizado",
                  align: "right" as const,
                  render: (v: unknown) => (v == null ? <span className="text-xs text-tertiary">—</span> : <MontoCell value={Number(v)} />),
              },
          ]
        : []),
    {
        key: "monto",
        header: "Monto",
        align: "right",
        render: (v) => (v == null ? <span className="text-tertiary">Pendiente</span> : <MontoCell value={v} />),
    },
];
