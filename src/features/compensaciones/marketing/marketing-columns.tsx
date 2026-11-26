import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { MontoCell, NombreCell, NotasCell } from "../shared/compensacion-cells";
import { estadoVisual } from "../shared/compensacion-estados";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { redesSociales } from "./marketing-capture-form";
import type { MarketingTipo } from "./marketing.service";

type Row = Record<string, unknown>;
const capture = (r: Row) => r.captura as Record<string, string>;

export const marketingColumns = (type: Exclude<MarketingTipo, "ALERTA_TEMPRANA">, conColaborador = false): ColumnDef[] => [
    // Administración revisa registros de varias personas: necesita saber de quién es cada uno.
    ...(conColaborador ? [{ key: "usuario", header: "Colaborador", minWidth: 150, render: (value: unknown) => <NombreCell value={value} /> }] : []),
    ...(type === "RECUPERACION_CLIENTE"
        ? [
              {
                  key: "dni",
                  header: "DNI",
                  minWidth: 100,
                  render: (_: unknown, r: Row) => <span className="whitespace-nowrap tabular-nums">{capture(r).dni}</span>,
              },
              {
                  key: "cliente",
                  header: "Cliente",
                  minWidth: 140,
                  render: (_: unknown, r: Row) => <NombreCell value={capture(r).cliente_nombre || "Ver operación vinculada"} />,
              },
          ]
        : []),
    ...(type === "RECUPERACION_CLIENTE"
        ? [
              { key: "operacion", header: "Operación", minWidth: 100, render: (value: unknown) => (value ? String(value) : "—") },
              { key: "dias_inactivo", header: "Días sin Actividad", minWidth: 100, render: (value: unknown) => (value == null ? "—" : String(value)) },
          ]
        : []),
    { key: "fecha", header: "Fecha", minWidth: 110, render: (value) => <CompensacionFechaCell value={String(value)} /> },
    { key: "titulo", header: "Título", minWidth: 120 },
    { key: "descripcion", header: "Detalle", minWidth: 150, render: (value) => <NotasCell value={value} /> },
    ...(type === "VIDEO_VIRAL"
        ? [
              {
                  key: "red_social",
                  header: "Red Social",
                  minWidth: 100,
                  render: (_: unknown, r: Row) => redesSociales.find((red) => red.id === capture(r).red_social)?.label ?? "—",
              },
              {
                  key: "publicacion",
                  header: "Publicación",
                  minWidth: 100,
                  render: (_: unknown, r: Row) =>
                      capture(r).publicacion ? (
                          <a href={capture(r).publicacion} target="_blank" rel="noopener noreferrer" className="text-brand-secondary underline">
                              Ver video
                          </a>
                      ) : (
                          "—"
                      ),
              },
              {
                  key: "metricas",
                  header: "Métricas",
                  minWidth: 170,
                  render: (_: unknown, r: Row) => {
                      const v = capture(r);
                      return (
                          <span>
                              {v.vistas} vistas · {v.likes} reacciones · {v.comentarios} comentarios
                          </span>
                      );
                  },
              },
          ]
        : []),
    {
        key: "estado",
        header: "Estado",
        minWidth: 110,
        // Un solo estado de acción: lo ya liquidado se lee como Aprobado.
        render: (value) => <CompensacionEstado dominio="registro" valor={value === "LIQUIDADO" ? "APROBADO" : value} />,
    },
    {
        key: "estado_calculo",
        header: "Verificación",
        minWidth: 160,
        render: (value: unknown, row: Row) => (
            <div className="max-w-64 space-y-1 text-xs whitespace-normal">
                {value !== "PENDIENTE" && value !== "EN_REVISION" && <p className="text-primary">{estadoVisual("elegibilidad", value).label}</p>}
                {Boolean(row.motivo_calculo) && <p className="text-tertiary">{String(row.motivo_calculo)}</p>}
                {Boolean(row.aviso_fecha) && (
                    <div className="text-tertiary">
                        <p>Aviso interno registrado</p>
                        <CompensacionFechaCell value={String(row.aviso_fecha)} />
                    </div>
                )}
            </div>
        ),
    },
    {
        key: "importe",
        header: "Monto",
        align: "right",
        minWidth: 100,
        render: (value, row) =>
            value == null || /PENDIENTE|EN_REVISION|INVALID|BLOQUE|SIN_FUENTE/i.test(String(row.estado_calculo ?? "")) ? "—" : <MontoCell value={value} />,
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
