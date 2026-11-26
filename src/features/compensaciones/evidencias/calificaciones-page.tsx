import { useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, Coins01, Eye, InfoCircle, Plus, Star01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { StatusBadge } from "@/components/shared/status-badge";
import { MiEnlaceQrAcciones } from "@/features/atencion/mi-enlace-qr/mi-enlace-qr-acciones";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { CompensacionInfoDialog } from "@/features/compensaciones/shared/compensacion-info-dialog";
import { useAtkBrand } from "@/hooks/use-atk-brand";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { CalificacionActions } from "./calificacion-actions";
import { calificacionListService } from "./calificacion-list.service";
import { CalificacionOperacionesModal } from "./calificacion-operaciones-modal";
import { CalificacionesChart } from "./calificaciones-chart";
import { CalificacionesFiltros, type CalificacionesFiltrosValue } from "./calificaciones-filtros";
import { evidenciaColumns, evidenciaRows } from "./evidencia-columns";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import { evidenciasService } from "./evidencias.service";
import type { CalificacionesResult, EvidenciaEvento, LlamadaContexto } from "./evidencias.types";
import { canReviewEvidence, isEvidenceBeneficiary } from "./llamada-actions";
import { fechaLima } from "./tarjeta-tercero-form";

const monthDates = (month: string) => {
    const [year, m] = month.split("-").map(Number);
    return { from: month ? `${month}-01` : "", to: month ? `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}` : "" };
};

const initialFilters = (): CalificacionesFiltrosValue => {
    const periodo = fechaLima().slice(0, 7);
    const { from, to } = monthDates(periodo);
    return { documento: "", nombreCliente: "", colaborador: "", comentario: "", estrellas: 0, estado: "", desde: from, hasta: to, periodo };
};

export const CalificacionesPage = withAlertProvider(() => {
    useAtkBrand();
    const profile = useCompensacionPerfil();
    if (profile.isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso a Atención Calificada…</p>
            </AppLayout>
        );
    return <CalificacionesContent key={`${profile.userId}:${profile.isAdvisor}:${profile.isStoreManager}`} />;
});

const CalificacionesContent = () => {
    const { isAdvisor: isAtc, isPagos, isStoreManager, isResolving } = useCompensacionPerfil();
    const isAdvisor = isAtc || isPagos;
    const [view, setView] = useState<"own" | "store">("own");
    const ownView = isAdvisor || (isStoreManager && view === "own");
    const [filters, setFilters] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [refresh, setRefresh] = useState(0);
    const [data, setData] = useState<CalificacionesResult | null>(null);
    const [context, setContext] = useState<LlamadaContexto | null>(null);
    const [contextBusy, setContextBusy] = useState(true);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<EvidenciaEvento | null>(null);
    const [operationsItem, setOperationsItem] = useState<EvidenciaEvento | null>(null);
    const [showInfo, setShowInfo] = useState(false);
    const requestId = useRef(0);
    const [query, setQuery] = useState(filters);
    const ratingAdvisor = isStoreManager && ownView ? context?.idColaborador : 0;
    const waitingForProfile = isResolving || (isStoreManager && ownView && contextBusy);
    useEffect(() => {
        if (JSON.stringify(filters) === JSON.stringify(query)) return;
        const timer = setTimeout(() => {
            setPage(1);
            setQuery(filters);
        }, 250);
        return () => clearTimeout(timer);
    }, [filters, query]);
    useEffect(() => {
        let cancelled = false;
        evidenciasService
            .getCallContext()
            .then((value) => {
                if (!cancelled) setContext(value);
            })
            .catch(() => {
                if (!cancelled) setContext(null);
            })
            .finally(() => {
                if (!cancelled) setContextBusy(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        const id = ++requestId.current;
        setBusy(true);
        setError("");
        if (waitingForProfile) return;
        if (isStoreManager && ownView && !ratingAdvisor) {
            setData(null);
            setError("No se pudo verificar tu ficha de colaborador para consultar tus calificaciones.");
            setBusy(false);
            return;
        }
        if (query.desde && query.hasta && query.hasta < query.desde) {
            setData(null);
            setError("La fecha hasta no puede ser anterior a la fecha desde.");
            setBusy(false);
            return;
        }
        calificacionListService
            .getRatings({
                documento: query.documento,
                nombreCliente: query.nombreCliente,
                colaborador: query.colaborador,
                comentario: query.comentario,
                asesor: ratingAdvisor ?? 0,
                estrellas: query.estrellas,
                estado: query.estado,
                desde: query.desde,
                hasta: query.hasta,
                pagina: page,
                tamanoPagina: pageSize,
            })
            .then((result) => {
                if (id === requestId.current) setData(result);
            })
            .catch((cause) => {
                if (id === requestId.current) {
                    setData(null);
                    setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron cargar las calificaciones");
                }
            })
            .finally(() => {
                if (id === requestId.current) setBusy(false);
            });
        return () => {
            ++requestId.current;
        };
    }, [query, page, pageSize, refresh, waitingForProfile, isStoreManager, ownView, ratingAdvisor]);
    const changeView = (next: typeof view) => {
        if (next === view) return;
        ++requestId.current;
        setView(next);
        setPage(1);
        setData(null);
        setBusy(true);
        setSelected(null);
        setOperationsItem(null);
    };
    const changed = () => {
        setSelected(null);
        setRefresh((value) => value + 1);
    };
    const clearFilters = () => {
        const next = initialFilters();
        setFilters(next);
        setPage(1);
        setQuery(next);
    };
    const money = (value: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
    const columns = evidenciaColumns("CALIFICACION");
    const clientColumn = columns.splice(
        columns.findIndex((column) => column.key === "cliente"),
        1,
    )[0];
    clientColumn.render = (value) => <span className="break-words text-primary">{String(value || "—")}</span>;
    columns.splice(2, 0, { key: "sede", header: "Sede" });
    columns.unshift(
        { key: "clienteDni", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value || "—")}</span> },
        clientColumn,
    );
    const stateColumn = columns.find((column) => column.key === "estado");
    const dateColumn = columns.find((column) => column.key === "fecha");
    if (dateColumn)
        dateColumn.render = (value) => {
            const date = new Date(String(value));
            if (Number.isNaN(date.getTime())) return "—";
            return (
                <div className="whitespace-nowrap">
                    <CompensacionFechaCell value={value} />
                </div>
            );
        };
    if (isAdvisor || isStoreManager)
        columns.push({
            key: "operaciones",
            header: "Operaciones",
            render: (_value, row) => {
                const item = data?.items.find((event) => event.id === Number(row.id));
                if (!item) return null;
                const saved = item.referencias.some((ref) => ref.tipoReferencia === "OPERACION");
                const consult = saved || item.estado !== "PENDIENTE" || (isStoreManager && !isEvidenceBeneficiary(item, context));
                return (
                    <Button
                        size="xs"
                        color="secondary"
                        iconLeading={consult ? Eye : Plus}
                        className="h-6 gap-1 rounded-md px-2 py-0 text-xs font-medium before:rounded-[5px] *:data-icon:size-3.5"
                        onClick={() => setOperationsItem(item)}
                    >
                        {consult ? "Visualizar" : "Agregar"}
                    </Button>
                );
            },
        });
    columns.push({
        key: "acciones",
        header: "Acciones",
        render: (_value, row) => {
            const item = data?.items.find((e) => e.id === Number(row.id));
            if (!item) return null;
            return ownView || isResolving ? (
                <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={Eye}
                    tooltip={isStoreManager ? "Registro propio: solo consulta, sin aprobar ni rechazar" : "Consultar calificación y revisión"}
                    className={compensationTableActionClass}
                    onClick={() => setSelected(item)}
                />
            ) : (
                <CalificacionActions
                    key={`${item.id}-${item.fechaActualizacion}`}
                    item={item}
                    contexto={context}
                    admin={data?.puedeAdministrar === true}
                    onChanged={changed}
                    onDetail={() => setSelected(item)}
                />
            );
        },
    });
    const personColumn = columns.find((column) => column.key === "colaborador");
    if (personColumn)
        personColumn.render = (value, row) => (
            <div className="min-w-0">
                <p className="font-medium break-words text-primary">{String(value)}</p>
                <p className="text-xs whitespace-nowrap text-tertiary tabular-nums">{String(row.documento ?? "")}</p>
            </div>
        );
    const commentColumn = columns.find((column) => column.key === "notas");
    const amountColumn = columns.find((column) => column.key === "importe");
    if (amountColumn) {
        amountColumn.header = "Comisión";
        amountColumn.render = (value, row) =>
            Number(value) > 0 && ["APROBADO", "LIQUIDADO"].includes(String(row.estado)) ? (
                <span className="inline-flex max-w-full">
                    <StatusBadge tone="success">{money(Number(value))}</StatusBadge>
                </span>
            ) : (
                <CompensacionEstado dominio="comision" valor={row.estado === "RECHAZADO" ? "NO_APLICA" : "PENDIENTE"} />
            );
    }
    if (commentColumn)
        commentColumn.render = (value) => <p className="text-xs [overflow-wrap:anywhere] whitespace-pre-wrap text-tertiary">{String(value ?? "—")}</p>;
    if (stateColumn)
        stateColumn.render = (value, row) => {
            return (
                <div className="flex flex-wrap items-center gap-2">
                    <CompensacionEstado dominio="registro" valor={value} />
                    {row.calificacionValida === false && <CompensacionEstado dominio="elegibilidad" valor="NO_ELEGIBLE" />}
                </div>
            );
        };
    const ranking = (data?.ranking ?? []).map((r) => ({ key: String(r.id), name: r.nombre, value: r.cantidad, unit: "calif." }));
    const others = (data?.aprobados ?? 0) - ranking.reduce((sum, r) => sum + r.value, 0);
    if (others > 0) ranking.push({ key: "otros", name: "Otros asesores", value: others, unit: "calif." });
    const rankingChart = (
        <CalificacionesChart title="Ranking de Aprobadas" slices={ranking} busy={busy} error={Boolean(error)} empty="Sin calificaciones aprobadas." />
    );
    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <CompensacionHeading section="evidencias" title="Atención Calificada" />
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        {(isAdvisor || isStoreManager) && <MiEnlaceQrAcciones />}
                        <ButtonUtility
                            size="sm"
                            color="tertiary"
                            icon={InfoCircle}
                            tooltip="Información de Atención Calificada"
                            className={compensationTableActionClass}
                            onClick={() => setShowInfo(true)}
                        />
                    </div>
                </div>
                {isStoreManager && (
                    <div role="group" aria-label="Vista de calificaciones" className="flex flex-wrap gap-2">
                        <Button size="sm" color={ownView ? "primary" : "secondary"} aria-pressed={ownView} onClick={() => changeView("own")}>
                            Mi Atención Calificada
                        </Button>
                        <Button size="sm" color={!ownView ? "primary" : "secondary"} aria-pressed={!ownView} onClick={() => changeView("store")}>
                            Atención Calificada de Mi Sede
                        </Button>
                    </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>section]:flex [&>section]:flex-col [&>section>div:last-child]:flex-1">
                    {[
                        { label: "Calificaciones Visibles", value: data?.total, icon: Star01, tone: "text-brand-secondary" },
                        { label: "Pendientes", value: data?.pendientes, icon: Clock, tone: "text-warning-primary" },
                        { label: "Aprobadas", value: data?.aprobados, icon: CheckCircle, tone: "text-success-primary" },
                        { label: "Comisión Aprobada", value: data ? money(data.importeAprobado) : undefined, icon: Coins01, tone: "text-success-primary" },
                    ].map(({ label, value, icon: Icon, tone }) => (
                        <CompensacionPanel key={label} title={label} trailing={<Icon aria-hidden="true" className={`size-5 shrink-0 ${tone}`} />}>
                            <p className={`text-display-xs font-semibold tabular-nums ${tone}`}>{busy || error ? "—" : value}</p>
                        </CompensacionPanel>
                    ))}
                </div>
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                {!ownView && <div className="min-w-0">{rankingChart}</div>}
                <section aria-label="Registros de calificaciones" className="min-w-0 [&_table]:min-w-[70rem] [&_td]:text-xs [&_td_[role=img]]:text-sm">
                    <DataTable
                        density="compact"
                        wrapText
                        columns={columns}
                        data={busy || error ? [] : evidenciaRows(data?.items ?? [])}
                        isLoading={busy}
                        page={page}
                        totalPages={Math.max(1, data?.totalPages ?? 1)}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={(size) => {
                            setPageSize(size);
                            setPage(1);
                        }}
                        emptyMessage={error ? "Consulta no disponible" : "Sin calificaciones con estos filtros"}
                        emptyDescription="Revisa el mes y los filtros."
                        toolbar={<CalificacionesFiltros value={filters} onChange={setFilters} onClear={clearFilters} />}
                    />
                </section>
                <EvidenciaDetailModal
                    item={selected}
                    onClose={() => setSelected(null)}
                    onChanged={changed}
                    llamadaContexto={context}
                    readOnly={ownView || isResolving || !selected || !canReviewEvidence(selected, context)}
                />
                {operationsItem && (
                    <CalificacionOperacionesModal
                        key={operationsItem.id}
                        item={operationsItem}
                        onClose={() => setOperationsItem(null)}
                        onSaved={() => {
                            setOperationsItem(null);
                            changed();
                        }}
                    />
                )}
                {showInfo && (
                    <CompensacionInfoDialog
                        title="Información de Atención Calificada"
                        resumen={[
                            {
                                concepto: "Atención Presencial Calificada",
                                tipo: { label: "Bono (+)", tone: "success" },
                                observacion:
                                    "Aplica a calificaciones de 4 o 5 estrellas vinculadas a efectivizaciones elegibles bajo Comisión General o pagos de deuda. No aplica a tasas preferenciales ni comunidades.",
                            },
                        ]}
                        pasos={[
                            "El cliente califica la atención y el registro queda disponible para revisión.",
                            "Vincula las operaciones elegibles del mismo DNI cuando corresponda.",
                            "Administración revisa y resuelve; el importe depende de la configuración vigente del servidor.",
                        ]}
                        nota="La calificación por sí sola no confirma una comisión ni un pago."
                        onClose={() => setShowInfo(false)}
                    />
                )}
            </div>
        </AppLayout>
    );
};
