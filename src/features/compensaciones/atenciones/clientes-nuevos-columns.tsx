import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { type ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { textosEstado } from "@/features/compensaciones/shared/compensacion-estados";
import { MontoCell, NombreCell, VenceCell } from "../shared/compensacion-cells";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { serviceLabel, titleCaseSiMayusculas as titleCase } from "../shared/compensacion-formato";

export const clientesNuevosColumns: ColumnDef[] = [
    { key: "documento", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value ?? "—")}</span> },
    { key: "nombre", header: "Cliente", render: (value) => <NombreCell value={value} /> },
    { key: "fecha_registro", header: "Fecha de registro", render: (value) => <CompensacionFechaCell value={value} /> },
    { key: "vence", header: "Vence", render: (value) => <VenceCell value={value} /> },
    {
        key: "canal",
        header: "Canal",
        render: (value) => (
            <StatusBadge>
                {value === "GENERAL"
                    ? "General"
                    : value === "TIKTOK_LIVE"
                      ? "TikTok LIVE"
                      : value === "REFERIDO"
                        ? "Referido"
                        : String(value || "No informado")}
            </StatusBadge>
        ),
    },
    {
        key: "operacion",
        header: "Operación",
        render: (value, row) =>
            value ? (
                <div>
                    <p>{String(value)}</p>
                    {row.servicio ? <StatusBadge>{serviceLabel(row.servicio)}</StatusBadge> : null}
                </div>
            ) : (
                <StatusBadge>Pendiente</StatusBadge>
            ),
    },
    {
        key: "monto",
        header: "Monto efectivizado",
        align: "right",
        render: (value) => <MontoCell value={value} className="font-semibold text-success-primary" />,
    },
    {
        key: "estado_operacion",
        header: "Estado de operación",
        render: (value) => {
            const text = String(value ?? "").trim();
            if (!text || text === "Sin operación") return null;
            return <CompensacionEstado dominio="operacion" valor={text} />;
        },
    },
    {
        key: "ganancia",
        header: "Monto",
        render: (value, row) =>
            row.estado === "EN_REVISION" || value == null || Number(value) <= 0 ? (
                <CompensacionEstado dominio="comision" valor={row.estado_aprobacion === "RECHAZADO" ? "NO_APLICA" : "PENDIENTE"} />
            ) : (
                <StatusBadge tone="success">{new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value))}</StatusBadge>
            ),
    },
];

/** Validación del Jefe Superior de Pagos (S/ 0.30), que aprueba Administración. */
const validacionPagos: Record<string, { tone: "success" | "error" | "warning"; label: string }> = {
    PENDIENTE: { tone: "warning", label: "Por aprobar" },
    APROBADO: { tone: "success", label: "Aprobada" },
    LIQUIDADO: { tone: "success", label: "Aprobada" },
    RECHAZADO: { tone: "error", label: "Rechazada" },
};
export const validacionPagosColumn: ColumnDef = {
    key: "validacion_pagos",
    header: "Validación Pagos",
    render: (value) => {
        const visual = validacionPagos[String(value ?? "")];
        return visual ? <StatusBadge tone={visual.tone}>{visual.label}</StatusBadge> : <span className="text-tertiary">Sin validar</span>;
    },
};
export const registradoPorColumn: ColumnDef = {
    key: "registrado_por",
    header: "Registrado por",
    render: (value: unknown) => (
        <span title={String(value ?? "")} className="font-medium text-primary">
            {value ? titleCase(value) : "Sin colaborador"}
        </span>
    ),
};

export const captacionApprovalColumn: ColumnDef = {
    key: "estado_aprobacion",
    header: "Estado",
    render: (value, row) => (
        <Tooltip title={String(row.motivo_revision || row.bloqueo_revision || row.motivo || "La elegibilidad automática requiere una decisión administrativa")}>
            <TooltipTrigger>
                <CompensacionEstado dominio="captacionAprobacion" valor={value} />
            </TooltipTrigger>
        </Tooltip>
    ),
};

export const captacionStateLabels = textosEstado("seguimiento", ["ESPERANDO_OPERACION", "OPERACION_PENDIENTE", "BONO_HABILITADO", "BLOQUEADO", "EN_REVISION"]);
