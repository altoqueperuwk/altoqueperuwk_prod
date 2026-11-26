import { useEffect, useRef, useState } from "react";
import { CheckCircle, Eye, XCircle, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { compensationMoney } from "../shared/compensacion-cells";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import type { LlamadaContexto } from "./evidencias.types";
import { ReferidoTrazabilidad } from "./referido-trazabilidad";
import { type ReferidoEfectivizacion, type ReferidoHistorial, referidoError, referidosService } from "./referidos.service";

export const ReferidoEfectivizacionActions = ({
    item,
    context,
    onChanged,
    resolveOperation = referidosService.resolveOperation,
}: {
    item: ReferidoEfectivizacion;
    context: LlamadaContexto | null;
    onChanged: () => void;
    resolveOperation?: typeof referidosService.resolveOperation;
}) => {
    const [reason, setReason] = useState("");
    const [rejecting, setRejecting] = useState(false);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const notify = useAlert();
    const canReview =
        item.estado_evento === "PENDIENTE" &&
        context &&
        context.puedeAgregarEfectivizacion === true &&
        (context.puedeAprobar || context.puedeRevisar) &&
        Number(item.id_usuario_registra) !== context.idUsuario;
    const resolve = async (decision: "APROBADO" | "RECHAZADO") => {
        if (!canReview || lock.current || (decision === "APROBADO" ? !context.puedeAprobar : !context.puedeRevisar)) return;
        if (decision === "RECHAZADO" && !reason.trim()) return notify("validation", "Ingresa el motivo del rechazo.");
        lock.current = true;
        setBusy(true);
        try {
            await resolveOperation(item.id, decision, reason);
            notify("success", decision === "APROBADO" ? "Efectivización validada" : "Efectivización rechazada");
            onChanged();
        } catch (cause) {
            notify("error", referidoError(cause));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    if (!canReview) return <span className="text-xs text-tertiary">{item.estado_evento === "PENDIENTE" ? "Esperando revisión" : "Sin acciones"}</span>;
    return (
        <div className="flex min-w-40 flex-wrap items-end gap-2">
            {!rejecting && context.puedeAprobar && (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={CheckCircle}
                    tooltip="Validar"
                    className={compensationTableActionClass}
                    isDisabled={busy}
                    onClick={() => void resolve("APROBADO")}
                />
            )}
            {context.puedeRevisar &&
                (rejecting ? (
                    <>
                        <Input label="Motivo del rechazo" size="sm" value={reason} maxLength={2000} isDisabled={busy} onChange={setReason} />
                        <Button size="xs" color="primary-destructive" isLoading={busy} onClick={() => void resolve("RECHAZADO")}>
                            Confirmar rechazo
                        </Button>
                        <Button size="xs" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={() => setRejecting(false)}>
                            Cancelar
                        </Button>
                    </>
                ) : (
                    <ButtonUtility
                        size="xs"
                        color="tertiary"
                        icon={XCircle}
                        tooltip="Rechazar"
                        className={compensationTableActionClass}
                        isDisabled={busy}
                        onClick={() => setRejecting(true)}
                    />
                ))}
        </div>
    );
};
export const referidoHistorialColumns: ColumnDef[] = [
    { key: "fecha_evento", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
    { key: "banco", header: "Banco", render: (value) => String(value ?? "Pendiente") },
    { key: "monto", header: "Monto efectivizado", render: (value) => (value == null ? "—" : compensationMoney.format(Number(value))) },
    { key: "periodo_imputacion", header: "Periodo", render: (value) => String(value).slice(0, 7) },
    {
        key: "importe_aprobado",
        header: "Monto",
        render: (value, row) =>
            row.estado_evento === "PENDIENTE" && (value == null || Number(value) === 0)
                ? "Pendiente"
                : value != null
                  ? compensationMoney.format(Number(value))
                  : ["RECHAZADO", "ANULADO"].includes(String(row.estado_evento))
                    ? "—"
                    : "Pendiente",
    },
    { key: "estado_evento", header: "Estado", render: (value) => <CompensacionEstado dominio="registro" valor={value} /> },
];
export const ReferidoHistorialTable = ({
    id,
    originalEvent,
    context,
    onChanged,
}: {
    id: number;
    originalEvent: number;
    context: LlamadaContexto | null;
    onChanged: () => void;
}) => {
    const [page, setPage] = useState(1);
    const [traceId, setTraceId] = useState<number | null>(null);
    const [pageSize, setPageSize] = useState(20);
    const [data, setData] = useState<ReferidoHistorial | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        referidosService
            .history(id, page, pageSize)
            .then((value) => {
                if (!cancelled) setData(value);
            })
            .catch((cause) => {
                if (!cancelled) {
                    setError(referidoError(cause));
                    setData(null);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id, page, pageSize]);
    return (
        <div className="mt-6 min-w-0 border-t border-secondary pt-4">
            <h3 className="mb-3 text-sm font-semibold text-primary">Efectivizaciones ({loading ? "…" : (data?.total ?? "—")})</h3>
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <DataTable
                density="compact"
                columns={referidoHistorialColumns}
                data={loading || error ? [] : (data?.items ?? []).map((item) => ({ ...item }))}
                isLoading={loading}
                page={page}
                totalPages={Math.max(1, data?.total_paginas ?? 1)}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
                emptyMessage={error ? "Historial no disponible" : "Sin efectivizaciones"}
                emptyDescription="Las operaciones vinculadas aparecerán aquí."
                renderActions={(row) => {
                    const item = data?.items.find((item) => item.id === row.id);
                    return item && item.id !== originalEvent ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={Eye}
                                tooltip="Ver trazabilidad de la efectivización"
                                className={compensationTableActionClass}
                                onClick={() => setTraceId(item.id)}
                            />
                            <ReferidoEfectivizacionActions key={item.id} item={item} context={context} onChanged={onChanged} />
                        </div>
                    ) : (
                        <span className="text-xs text-tertiary">Registro inicial</span>
                    );
                }}
            />
            {traceId !== null && <ReferidoTrazabilidad key={traceId} eventId={traceId} onChanged={onChanged} />}
        </div>
    );
};
