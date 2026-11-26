import { useEffect, useRef, useState } from "react";
import { CheckCircle, Coins01, InfoCircle, Users03, XCircle } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { useAtkBrand } from "@/hooks/use-atk-brand";
import { MontoCell, NombreCell, NotasCell, compensationMoney } from "../shared/compensacion-cells";
import { CompensacionDeleteDialog } from "../shared/compensacion-delete-dialog";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import type { LlamadaContexto } from "./evidencias.types";
import { ReferidoEditDialog } from "./referido-edit-dialog";
import { type ReferidoFiltros, ReferidoFiltrosBar, referidoPeriodo } from "./referido-filtros";
import { ReferidoForm } from "./referido-form";
import { ReferidoInfoDialog } from "./referido-info-dialog";
import { ReferidoPanel as CompensacionPanel } from "./referido-panel";
import { isOtherReferral } from "./referido-permissions";
import { ReferidoReview, type ReferidoReviewMode } from "./referido-review";
import { ReferidoRowActions } from "./referido-row-actions";
import { type Referido, type ReferidosResult, referidoError, referidosService } from "./referidos.service";
import { fechaLima } from "./tarjeta-tercero-form";

const columns: ColumnDef[] = [
    { key: "documento_referido_snapshot", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value || "—")}</span> },
    {
        key: "nombre_referido_snapshot",
        header: "Cliente",
        render: (value) => <NombreCell value={value} />,
    },
    {
        key: "operaciones",
        header: "Efectivizaciones",
        render: (_, row) => (
            <div className="space-y-1">
                <p className="text-xs text-secondary">
                    Historial: {(row.operaciones as Referido["operaciones"]).length} efectivizaciones · {Number(row.efectivizaciones_pendientes ?? 0)}{" "}
                    pendientes
                </p>
            </div>
        ),
    },
    {
        key: "referente_nombre",
        header: "Registrado por",
        render: (value, row) => (
            <div>
                <NombreCell value={value} />
                <p className="mt-1 text-xs text-tertiary">{String(row.sucursal_nombre ?? "")}</p>
            </div>
        ),
    },
    { key: "banco", header: "Banco" },
    {
        key: "monto",
        header: "Monto efectivizado",
        render: (value) => (value == null ? <span className="text-tertiary">Pendiente</span> : <MontoCell value={value} />),
    },
    {
        key: "importe_aprobado",
        header: "Monto",
        render: (value, row) => (
            <div className="text-left">
                {row.estado_referido === "RECHAZADO" && (value == null || Number(value) <= 0) ? (
                    <CompensacionEstado dominio="comision" valor="NO_APLICA" />
                ) : row.estado_referido === "PENDIENTE" && (value == null || Number(value) === 0) ? (
                    <CompensacionEstado dominio="comision" valor="PENDIENTE" />
                ) : value == null ? (
                    <CompensacionEstado dominio="comision" valor={row.estado_referido === "RECHAZADO" ? "NO_APLICA" : "PENDIENTE"} />
                ) : (
                    <StatusBadge tone="success">{compensationMoney.format(Number(value))}</StatusBadge>
                )}
            </div>
        ),
    },
    {
        key: "estado_referido",
        header: "Estado",
        width: "16%",
        render: (value, row) => (
            <CompensacionEstado
                dominio="referido"
                valor={
                    value === "PENDIENTE" && (row.coincidencia as Referido["coincidencia"])?.estado
                        ? (row.coincidencia as NonNullable<Referido["coincidencia"]>).estado
                        : row.estado_evento === "BORRADOR"
                          ? "BORRADOR"
                          : value
                }
            />
        ),
    },
    {
        key: "fecha_referencia",
        header: "Fecha de registro",
        render: (value) => (
            <div className="whitespace-nowrap">
                <CompensacionFechaCell value={value} />
            </div>
        ),
    },
    {
        key: "observacion",
        header: "Notas",
        render: (value) => <NotasCell value={value} />,
    },
];

export const ReferidosPage = withAlertProvider(() => {
    useAtkBrand();
    const profile = useCompensacionPerfil();
    if (profile.isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso a Referidos…</p>
            </AppLayout>
        );
    return (
        <ReferidosContent
            key={`${profile.userId}:${profile.isAdvisor}:${profile.isFacturacion}:${profile.isPagos}:${profile.isMarketing}:${profile.isStoreManager}:${profile.isAdministrator}`}
        />
    );
});

const ReferidosContent = () => {
    const notify = useAlert();
    const { isAdvisor: isAtc, isFacturacion, isPagos, isMarketing, isStoreManager, isAdministrator } = useCompensacionPerfil();
    const isAdvisor = isAtc || isFacturacion || isPagos || isMarketing || isStoreManager;
    const beginRequest = useCompensacionRequestScope();
    const decisionLock = useRef(false);
    const [decisionBusy, setDecisionBusy] = useState<number | null>(null);
    const [context, setContext] = useState<LlamadaContexto | null>(null);
    const [contextError, setContextError] = useState("");
    const [contextRevision, setContextRevision] = useState(0);
    const initialFilters = (): ReferidoFiltros => {
        const month = fechaLima().slice(0, 7);
        return { documento: "", nombre: "", colaborador: "", status: "", month, ...referidoPeriodo(month) };
    };
    const [filters, setFilters] = useState(initialFilters);
    const [query, setQuery] = useState(filters);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [refresh, setRefresh] = useState(0);
    const [editing, setEditing] = useState<Referido | null>(null);
    const [deleting, setDeleting] = useState<Referido | null>(null);
    const [data, setData] = useState<ReferidosResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<Referido | null>(null);
    const [showInfo, setShowInfo] = useState(false);
    const [reviewMode, setReviewMode] = useState<ReferidoReviewMode>("HISTORIAL");
    const request = useRef(0);
    useEffect(() => {
        const refreshVisible = () => {
            if (!document.hidden) setRefresh((value) => value + 1);
        };
        const timer = window.setInterval(refreshVisible, 60000);
        window.addEventListener("focus", refreshVisible);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refreshVisible);
        };
    }, []);
    useEffect(() => {
        let cancelled = false;
        setContextError("");
        referidosService
            .context()
            .then((value) => {
                if (!cancelled) setContext(value);
            })
            .catch((cause) => {
                if (!cancelled) setContextError(referidoError(cause));
            });
        return () => {
            cancelled = true;
        };
    }, [contextRevision]);
    useEffect(() => {
        const next = filters;
        if (JSON.stringify(next) === JSON.stringify(query)) return;
        const timer = setTimeout(() => {
            setPage(1);
            setSelected(null);
            setQuery(next);
        }, 250);
        return () => clearTimeout(timer);
    }, [filters, query]);
    useEffect(() => {
        const id = ++request.current;
        setLoading(true);
        setError("");
        referidosService
            .list({ ...query, page, pageSize })
            .then((value) => {
                if (id === request.current) setData(value);
            })
            .catch((cause) => {
                if (id === request.current) {
                    setError(referidoError(cause));
                    setData(null);
                }
            })
            .finally(() => {
                if (id === request.current) setLoading(false);
            });
        return () => {
            ++request.current;
        };
    }, [query, page, pageSize, refresh]);
    const changed = () => {
        setSelected(null);
        setRefresh((value) => value + 1);
    };
    const open = (id: number, mode: ReferidoReviewMode) => {
        if (decisionLock.current) return;
        const item = data?.items.find((item) => item.id === id);
        if (item && (mode === "VALIDAR" || mode === "RECHAZAR")) {
            void resolve(item, mode === "VALIDAR" ? "APROBADO" : "RECHAZADO");
            return;
        }
        setReviewMode(mode);
        setSelected(data?.items.find((item) => item.id === id) ?? null);
    };
    const resolve = async (item: Referido, decision: "APROBADO" | "RECHAZADO") => {
        if (
            decisionLock.current ||
            item.estado_referido !== "PENDIENTE" ||
            item.estado_evento !== "PENDIENTE" ||
            !isOtherReferral(item, context) ||
            !(decision === "APROBADO" ? context?.puedeAprobar : context?.puedeRevisar)
        )
            return;
        decisionLock.current = true;
        setDecisionBusy(item.id);
        const isCurrent = beginRequest();
        try {
            const operation = decision === "APROBADO" ? await referidosService.operation(item.id) : null;
            if (!isCurrent()) return;
            if (decision === "APROBADO" && (!operation || !Number.isFinite(Number(operation.monto)) || Number(operation.monto) <= 0)) {
                throw new Error("No hay una efectivización elegible para aprobar este referido");
            }
            await referidosService.resolve(item.id, decision, operation?.id ?? null, "");
            if (!isCurrent()) return;
            notify("success", decision === "APROBADO" ? "Referido validado" : "Referido rechazado");
            changed();
        } catch (cause) {
            if (!isCurrent()) return;
            notify("error", referidoError(cause));
            setRefresh((value) => value + 1);
        } finally {
            decisionLock.current = false;
            if (isCurrent()) setDecisionBusy(null);
        }
    };
    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <CompensacionHeading section="evidencias" title="Referidos" />
                        <ButtonUtility
                            size="xs"
                            color="tertiary"
                            icon={InfoCircle}
                            aria-label="Ver información de Referidos"
                            tooltip="Ver cómo se calcula la comisión de Referidos"
                            className={compensationTableActionClass}
                            onClick={() => setShowInfo(true)}
                        />
                    </div>
                    {decisionBusy !== null && (
                        <p role="status" className="text-xs text-tertiary">
                            Guardando revisión…
                        </p>
                    )}
                </div>
                {showInfo && <ReferidoInfoDialog onClose={() => setShowInfo(false)} />}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>section]:flex [&>section]:flex-col [&>section>div:last-child]:flex-1">
                    <CompensacionPanel title="Pendientes" trailing={<Users03 aria-hidden="true" className="size-5 text-warning-primary" />}>
                        <p className="text-display-xs font-semibold text-warning-primary tabular-nums">
                            {loading || error ? "—" : (data?.resumen.pendientes ?? "—")}
                        </p>
                        <p className="mt-2 text-xs text-tertiary">Referidos visibles: {loading || error ? "—" : (data?.total ?? "—")}</p>
                        <p className="mt-1 text-xs text-tertiary">
                            {loading || error ? "—" : (data?.resumen.efectivizaciones_pendientes ?? 0)} efectivizaciones pendientes
                        </p>
                    </CompensacionPanel>
                    <CompensacionPanel title="Aprobados" trailing={<CheckCircle aria-hidden="true" className="size-5 text-success-primary" />}>
                        <p className="text-display-xs font-semibold text-success-primary tabular-nums">
                            {loading || error ? "—" : (data?.resumen.validados ?? "—")}
                        </p>
                        <p className="mt-2 text-xs text-tertiary">Referidos validados por un revisor autorizado.</p>
                    </CompensacionPanel>
                    <CompensacionPanel title="Rechazados" trailing={<XCircle aria-hidden="true" className="size-5 text-error-primary" />}>
                        <p className="text-display-xs font-semibold text-error-primary tabular-nums">
                            {loading || error ? "—" : (data?.resumen.rechazados ?? "—")}
                        </p>
                        <p className="mt-2 text-xs text-tertiary">Referidos rechazados en la consulta.</p>
                    </CompensacionPanel>
                    <CompensacionPanel title="Monto validado" trailing={<Coins01 aria-hidden="true" className="size-5 text-success-primary" />}>
                        <p className="text-display-xs font-semibold text-success-primary tabular-nums">
                            {loading || error ? "—" : compensationMoney.format(Number(data?.resumen.importe_validado ?? 0))}
                        </p>
                        <p className="mt-2 text-xs text-tertiary">Acumulada de las operaciones validadas.</p>
                    </CompensacionPanel>
                </div>
                {!isAdministrator && ((context?.puedeRegistrar && context.idColaborador) || contextError) && (
                    <section aria-label="Registrar referido" className="min-w-0">
                        <CompensacionPanel title="Registrar Referido">
                            <ReferidoForm compact context={context} error={contextError} onSave={changed} />
                        </CompensacionPanel>
                    </section>
                )}
                {selected && (
                    <ReferidoReview
                        key={`${selected.id}:${reviewMode}`}
                        mode={reviewMode}
                        item={selected}
                        context={context}
                        onClose={() => setSelected(null)}
                        onChanged={changed}
                    />
                )}
                {editing && (
                    <ReferidoEditDialog
                        item={editing}
                        onClose={() => setEditing(null)}
                        onSaved={() => {
                            setEditing(null);
                            notify("success", "Referido actualizado.");
                            setRefresh((value) => value + 1);
                        }}
                    />
                )}
                {deleting && (
                    <CompensacionDeleteDialog
                        title="Eliminar referido"
                        message="Se anulará tu referido y dejará de contar. Esta acción queda auditada."
                        requireReason
                        onClose={() => setDeleting(null)}
                        onConfirm={async (reason) => {
                            await referidosService.annul(deleting.id, reason);
                            setDeleting(null);
                            notify("success", "Referido eliminado.");
                            setRefresh((value) => value + 1);
                        }}
                    />
                )}
                <section aria-label="Listado de referidos" className="min-w-0 space-y-4 [&_table]:min-w-[88rem]">
                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                    <DataTable
                        density="compact"
                        wrapText
                        toolbar={
                            <ReferidoFiltrosBar
                                value={filters}
                                onChange={setFilters}
                                onClear={() => {
                                    const cleared = initialFilters();
                                    setFilters(cleared);
                                    setQuery(cleared);
                                    setPage(1);
                                    setSelected(null);
                                    if (contextError) setContextRevision((value) => value + 1);
                                    setRefresh((value) => value + 1);
                                }}
                            />
                        }
                        columns={columns}
                        data={
                            loading || error
                                ? []
                                : (data?.items ?? []).map((item) => ({
                                      ...item,
                                      banco:
                                          new Set(item.operaciones.map((op) => op.banco_snapshot)).size > 1
                                              ? "Varios"
                                              : (item.operaciones[0]?.banco_snapshot ??
                                                item.coincidencia?.operacion?.banco ??
                                                item.banco_declarado ??
                                                "Pendiente"),
                                      monto: item.operaciones.length
                                          ? item.operaciones.reduce((sum, op) => sum + Number(op.monto_operacion_snapshot), 0)
                                          : (item.coincidencia?.operacion?.monto ?? null),
                                  }))
                        }
                        isLoading={loading}
                        page={page}
                        totalPages={Math.max(1, data?.total_paginas ?? 1)}
                        pageSize={pageSize}
                        onPageChange={(value) => {
                            setSelected(null);
                            setPage(value);
                        }}
                        onPageSizeChange={(value) => {
                            setSelected(null);
                            setPageSize(value);
                            setPage(1);
                        }}
                        emptyMessage={error ? "Consulta no disponible" : "Sin referidos con estos filtros"}
                        emptyDescription="Revisa el mes y los filtros."
                        renderActions={(row) => {
                            const item = data?.items.find((item) => item.id === row.id);
                            if (!item) return null;
                            return (
                                <ReferidoRowActions
                                    item={item}
                                    context={context}
                                    busy={decisionBusy !== null}
                                    onOpen={(mode) => open(item.id, mode)}
                                    onEdit={isAdvisor ? () => setEditing(item) : undefined}
                                    onDelete={isAdvisor ? () => setDeleting(item) : undefined}
                                />
                            );
                        }}
                    />
                </section>
            </div>
        </AppLayout>
    );
};
