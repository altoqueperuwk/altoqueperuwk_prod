import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Edit03, Eye, File07, InfoCircle, Send01, Trash01, XClose } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { estadoVisual, opcionesEstado } from "@/features/compensaciones/shared/compensacion-estados";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { useAtkBrand } from "@/hooks/use-atk-brand";
import { ClientesNuevosPage } from "../atenciones/clientes-nuevos-page";
import type { Colaborador } from "../colaboradores/colaboradores.types";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { advisorCanRegisterBonus, useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { CalificacionesPage } from "./calificaciones-page";
import { evidenciaColumns, evidenciaRows } from "./evidencia-columns";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import { EvidenciaPopup } from "./evidencia-popup";
import { evidenciaScreens } from "./evidencias-navigation";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaCategoria, EvidenciaEvento, EvidenciaTipo, EvidenciasResumen, LlamadaContexto } from "./evidencias.types";
import { InnovacionInfoDialog } from "./innovacion-info-dialog";
import { type InnovacionPropuestaAction, InnovacionPropuestaDialog, InnovacionRevisionActions } from "./innovacion-propuesta-dialog";
import { LlamadaActions } from "./llamada-actions";
import { LlamadaForm } from "./llamada-form";
import { LlamadaInfoDialog } from "./llamada-info-dialog";
import { LlamadasFiltros, type LlamadasPeriodo, llamadasRango } from "./llamadas-filtros";
import { LlamadasPanel } from "./llamadas-panel";
import { ReferidosPage } from "./referidos-page";
import { TarjetaInfoDialog } from "./tarjeta-info-dialog";
import { TarjetaTerceroForm, fechaLima } from "./tarjeta-tercero-form";

const emptySummary: EvidenciasResumen = { borradores: 0, pendientes: 0, aprobados: 0, rechazados: 0, anulados: 0, importeAprobado: 0 };
const moneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const humanize = (value: string) => estadoVisual("registro", value).label;

const monthRange = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
    const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: `${year}-${String(month).padStart(2, "0")}-${lastDay}` };
};

interface EvidenciasPageProps {
    category?: EvidenciaCategoria | "";
    fixedType?: EvidenciaTipo;
    /** Selector de la opción contenedora (p. ej. Auditoría Operaciones). */
    header?: ReactNode;
    filterLeading?: ReactNode;
}

// Reinicia filtros, formularios y solicitudes al cambiar de tarea, incluso al volver atrás.
export const EvidenciasContent = ({ category = "", fixedType, header, filterLeading }: EvidenciasPageProps) => {
    const { isAdvisor: isAtc, isFacturacion, isPagos, isMarketing, isStoreManager, isAdministrator, userId } = useCompensacionPerfil();
    const isAdvisor = isAtc || isFacturacion || isPagos || isMarketing;
    const canCreateGeneric = !isAdvisor || advisorCanRegisterBonus(fixedType?.codigo);
    const notify = useAlert();
    const initialDates = useMemo(monthRange, []);
    const [types, setTypes] = useState<EvidenciaTipo[]>([]);
    const [collaborators, setCollaborators] = useState<(Pick<Colaborador, "id" | "nombreCompleto" | "numeroDocumento"> & { idUsuario?: number | null })[]>([]);
    const [items, setItems] = useState<EvidenciaEvento[]>([]);
    const [summary, setSummary] = useState<EvidenciasResumen>(emptySummary);
    const [search, setSearch] = useState("");
    const [documentoCliente, setDocumentoCliente] = useState("");
    const [nombreCliente, setNombreCliente] = useState("");
    const [colaboradorFiltro, setColaboradorFiltro] = useState("");
    const [status, setStatus] = useState("");
    const [typeId, setTypeId] = useState(fixedType?.id ?? 0);
    const [from, setFrom] = useState(initialDates.from);
    const [to, setTo] = useState(initialDates.to);
    const [callMonth, setCallMonth] = useState(initialDates.from.slice(0, 7));
    const [callPeriod, setCallPeriod] = useState<LlamadasPeriodo>("ALL");
    const [filters, setFilters] = useState({
        documentoCliente: "",
        nombreCliente: "",
        colaborador: "",
        search: "",
        category,
        status: "",
        typeId: fixedType?.id ?? 0,
        from: initialDates.from,
        to: initialDates.to,
    });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [formRevision, setFormRevision] = useState(0);
    const [selected, setSelected] = useState<EvidenciaEvento | null>(null);
    const [showInfo, setShowInfo] = useState(false);
    const [proposalAction, setProposalAction] = useState<InnovacionPropuestaAction | "REVISION">("DETALLE");
    const [refreshKey, setRefreshKey] = useState(0);
    const requestId = useRef(0);
    const [loadError, setLoadError] = useState("");
    const [callContext, setCallContext] = useState<LlamadaContexto | null>(null);
    const [callContextError, setCallContextError] = useState("");
    const isCall = category === "LLAMADA";
    const isCard = category === "TARJETA_TERCERO";
    const isSimple = isCall || isCard;
    const isInnovation = fixedType?.codigo === "PROPUESTA_INNOVACION";
    const isTiktok = fixedType?.codigo === "TIKTOK_LIVE";
    const isInnovationRoute = fixedType?.codigo === "PROPUESTA_INNOVACION";
    const isSafetyPay = fixedType?.codigo === "META_SEDE_SAFETYPAY";
    const layered = isSimple || isTiktok || isInnovationRoute;

    useEffect(() => {
        if (!isCall) return;
        const range = llamadasRango(callMonth, callPeriod);
        setFrom(range.from);
        setTo(range.to);
    }, [isCall, callMonth, callPeriod]);

    useEffect(() => {
        let cancelled = false;
        if (isSimple) {
            setCallContext(null);
            setCallContextError("");
            (isCall ? evidenciasService.getCallsContext() : evidenciasService.getCardContext())
                .then((context) => {
                    if (!cancelled) setCallContext(context);
                })
                .catch((cause) => {
                    if (!cancelled)
                        setCallContextError(
                            cause && typeof cause === "object" && "message" in cause
                                ? String(cause.message)
                                : "No se pudieron verificar los permisos. Actualiza la página o contacta al administrador.",
                        );
                });
            return () => {
                cancelled = true;
            };
        }
        Promise.all([evidenciasService.getTypes(), evidenciasService.getCollaboratorOptions()])
            .then(([typeRows, collaboratorRows]) => {
                if (cancelled) return;
                setTypes(typeRows.filter((item) => item.estadoNombre.toLocaleUpperCase("es-PE") === "ACTIVO"));
                setCollaborators(collaboratorRows);
            })
            .catch((error) => {
                if (!cancelled) notify("error", error instanceof Error ? error.message : "No fue posible cargar los catálogos");
            });
        return () => {
            cancelled = true;
        };
    }, [notify, isSimple, isCall, refreshKey]);

    const loadData = useCallback(async () => {
        const request = ++requestId.current;
        setItems([]);
        setLoadError("");
        setIsLoading(true);
        try {
            const result = await evidenciasService.getList({ ...filters, typeId: fixedType?.id ?? filters.typeId, page, pageSize });
            if (request !== requestId.current) return;
            setItems(result.items);
            setSummary(result.resumen);
            setTotalPages(Math.max(1, result.totalPages));
        } catch (error) {
            if (request !== requestId.current) return;
            setLoadError(error instanceof Error ? error.message : "No fue posible cargar las evidencias");
            setItems([]);
            setSummary(emptySummary);
            setTotalPages(1);
            notify("error", error instanceof Error ? error.message : "No fue posible cargar las evidencias");
        } finally {
            if (request === requestId.current) setIsLoading(false);
        }
    }, [notify, filters, page, pageSize, refreshKey, fixedType?.id]);

    useEffect(() => {
        void loadData();
        return () => {
            ++requestId.current;
        };
    }, [loadData]);

    // Llamadas conserva filtros directos como el legacy, sin botones adicionales.
    useEffect(() => {
        if (!isSimple) return;
        if (from && to && to < from) return;
        const timer = setTimeout(() => {
            setPage(1);
            setFilters((current) =>
                current.documentoCliente === documentoCliente &&
                current.nombreCliente === nombreCliente &&
                current.colaborador === colaboradorFiltro &&
                current.search === search &&
                current.category === category &&
                current.status === status &&
                current.from === from &&
                current.to === to
                    ? current
                    : { documentoCliente, nombreCliente, colaborador: colaboradorFiltro, search, category, status, typeId: 0, from, to },
            );
        }, 250);
        return () => clearTimeout(timer);
    }, [isSimple, isCall, search, category, status, from, to, documentoCliente, nombreCliente, colaboradorFiltro]);

    useEffect(() => {
        if (isSimple || isSafetyPay) return;
        if (from && to && to < from) return;
        const nextTypeId = isInnovationRoute ? (fixedType?.id ?? 0) : typeId;
        const timer = setTimeout(() => {
            setPage(1);
            setFilters((current) =>
                current.search === search &&
                current.category === category &&
                current.status === status &&
                current.typeId === nextTypeId &&
                current.from === from &&
                current.to === to
                    ? current
                    : {
                          documentoCliente: "",
                          nombreCliente: "",
                          colaborador: "",
                          search,
                          category,
                          status,
                          typeId: nextTypeId,
                          from,
                          to,
                      },
            );
        }, 250);
        return () => clearTimeout(timer);
    }, [isSimple, isSafetyPay, isInnovationRoute, search, category, status, typeId, from, to, fixedType?.id]);

    useEffect(() => {
        if (!isSafetyPay) return;
        if (from && to && to < from) return;
        const timer = setTimeout(() => {
            setPage(1);
            setFilters((current) => {
                const next = {
                    documentoCliente,
                    nombreCliente,
                    colaborador: colaboradorFiltro,
                    search: "",
                    category,
                    status,
                    typeId: fixedType?.id ?? 0,
                    from,
                    to,
                };
                return Object.keys(next).every((key) => next[key as keyof typeof next] === current[key as keyof typeof current]) ? current : next;
            });
        }, 250);
        return () => clearTimeout(timer);
    }, [category, colaboradorFiltro, documentoCliente, fixedType?.id, from, isSafetyPay, nombreCliente, status, to]);

    const applyFilters = () => {
        if (from && to && to < from) return notify("validation", "La fecha hasta no puede ser anterior a la fecha desde.");
        setPage(1);
        setFilters({ documentoCliente, nombreCliente, colaborador: colaboradorFiltro, search, category, status, typeId, from, to });
    };

    const clearFilters = () => {
        const dates = monthRange();
        setSearch("");
        setDocumentoCliente("");
        setNombreCliente("");
        setColaboradorFiltro("");
        setStatus("");
        setTypeId(fixedType?.id ?? 0);
        setFrom(dates.from);
        setTo(dates.to);
        setPage(1);
        setFilters({
            documentoCliente: "",
            nombreCliente: "",
            colaborador: "",
            search: "",
            category: filters.category,
            status: "",
            typeId: fixedType?.id ?? 0,
            from: dates.from,
            to: dates.to,
        });
    };

    const rows = useMemo(
        () => evidenciaRows(items).map((row, index) => (isInnovation ? { ...row, propuesta: items[index].titulo ?? "Sin título" } : row)),
        [items, isInnovation],
    );
    const columns = evidenciaColumns(filters.category);
    if (isTiktok) {
        const activityIndex = columns.findIndex((column) => column.key === "tipo");
        if (activityIndex >= 0) columns.splice(activityIndex, 1);
        columns.unshift(
            { key: "clienteDni", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value || "—")}</span> },
            { key: "cliente", header: "Cliente", render: (value) => <p className="font-medium break-words text-primary">{String(value || "—")}</p> },
        );
        for (const column of columns) {
            if (column.key === "fecha")
                column.render = (value) => (
                    <div className="whitespace-nowrap">
                        <CompensacionFechaCell value={value} />
                    </div>
                );
            if (column.key === "importe") {
                const render = column.render;
                column.render = (value, row) => <span className="whitespace-nowrap tabular-nums">{render?.(value, row)}</span>;
            }
        }
    }
    if (!isCard && !isCall) {
        for (const column of columns) {
            if (column.key === "colaborador")
                column.render = (value, row) => (
                    <div className="min-w-0 text-xs">
                        <NombreCell value={value} />
                        <p className="whitespace-nowrap text-tertiary tabular-nums">{String(row.documento ?? "")}</p>
                        {row.sede ? <p className="text-tertiary">{String(row.sede)}</p> : null}
                    </div>
                );
            if (column.key === "registradoPor") column.render = (value) => <NombreCell value={value} />;
            if (column.key === "importe") column.align = "right";
        }
    }
    if (isCard) {
        for (const column of columns) {
            if (column.key === "clienteDni") column.render = (value) => <span className="whitespace-nowrap tabular-nums">{String(value ?? "—")}</span>;
            if (column.key === "importe") {
                column.render = (value, row) => (
                    <div className="text-left">
                        {value != null && Number(value) > 0 && ["APROBADO", "LIQUIDADO"].includes(String(row.estado)) ? (
                            <StatusBadge tone="success">{moneyFormatter.format(Number(value))}</StatusBadge>
                        ) : (
                            <CompensacionEstado dominio="comision" valor={row.estado === "RECHAZADO" ? "NO_APLICA" : "PENDIENTE"} />
                        )}
                    </div>
                );
            }
            if (column.key === "fecha") column.render = (value) => <CompensacionFechaCell value={value} includeTime={false} />;
            if (column.key === "cliente") column.render = (value) => <NombreCell value={value} />;
            if (column.key === "notas")
                column.render = (value) => <p className="text-xs [overflow-wrap:anywhere] whitespace-pre-wrap text-secondary">{String(value ?? "—")}</p>;
            if (column.key === "registradoPor")
                column.render = (value, row) => (
                    <div>
                        <NombreCell value={value} />
                        <p className="text-xs text-tertiary">{String(row.sede ?? "")}</p>
                    </div>
                );
        }
    }
    if (isCall) {
        const dniColumn = columns.find((column) => column.key === "clienteDni")!;
        dniColumn.render = (value) => <span className="whitespace-nowrap tabular-nums">{String(value ?? "—")}</span>;
        columns.splice(columns.indexOf(dniColumn), 1);
        columns.unshift(dniColumn);
        for (const column of columns) {
            if (column.key === "importe") {
                column.render = (value, row) => (
                    <div className="text-left">
                        {value != null && Number(value) > 0 && ["APROBADO", "LIQUIDADO"].includes(String(row.estado)) ? (
                            <StatusBadge tone="success">{moneyFormatter.format(Number(value))}</StatusBadge>
                        ) : (
                            <CompensacionEstado dominio="comision" valor={row.estado === "RECHAZADO" ? "NO_APLICA" : "PENDIENTE"} />
                        )}
                    </div>
                );
            }
            if (column.key === "cliente") column.render = (value) => <NombreCell value={value} />;
            if (column.key === "registradoPor")
                column.render = (value, row) => (
                    <div>
                        <NombreCell value={value} />
                        <p className="text-xs text-tertiary">{String(row.sede ?? "")}</p>
                    </div>
                );
        }
    }
    if (isInnovation) {
        const dateColumn = columns.find((column) => column.key === "fecha");
        const statusColumn = columns.find((column) => column.key === "estado")!;
        const amountColumn = columns.find((column) => column.key === "importe")!;
        columns.splice(
            0,
            columns.length,
            dateColumn!,
            ...(isAdministrator ? [{ key: "colaborador", header: "Colaborador", render: (value: unknown) => <NombreCell value={value} /> }] : []),
            { key: "propuesta", header: "Propuesta", render: (value) => <p className="font-medium text-primary">{String(value)}</p> },
            {
                key: "notas",
                header: "Detalle",
                render: (value) => <p className="text-xs [overflow-wrap:anywhere] whitespace-pre-wrap text-tertiary">{String(value ?? "—")}</p>,
            },
            statusColumn,
            {
                ...amountColumn,
                header: "Monto",
                align: "right",
                render: (value, row) => (
                    <span className="whitespace-nowrap tabular-nums">
                        {Number(value) > 0 && ["APROBADO", "LIQUIDADO"].includes(String(row.estado)) ? moneyFormatter.format(Number(value)) : "Pendiente"}
                    </span>
                ),
            },
        );
    }

    const metrics = [
        { label: "Borradores", value: summary.borradores, helper: "Pendientes de envío", icon: File07, tone: "text-brand-secondary" },
        { label: "Pendientes", value: summary.pendientes, helper: "Esperando revisión", icon: Clock, tone: "text-warning-primary" },
        {
            label: "Aprobadas",
            value: summary.aprobados,
            helper: moneyFormatter.format(summary.importeAprobado),
            icon: CheckCircle,
            tone: "text-success-primary",
        },
        {
            label: "Rechazadas",
            value: summary.rechazados,
            helper: isSimple ? "No aprobadas" : `${summary.anulados} anulada(s)`,
            icon: AlertCircle,
            tone: "text-error-primary",
        },
    ];
    const creatableTypes = useMemo(
        () =>
            types.filter(
                (item) =>
                    item.categoria !== "REFERIDO" &&
                    item.codigo !== "META_AREA" &&
                    item.codigo !== "TIKTOK_LIVE" &&
                    (!filters.category || item.categoria === filters.category) &&
                    (!fixedType || item.id === fixedType.id),
            ),
        [types, filters.category, fixedType],
    );
    const section = evidenciaScreens.find((item) => item.category === category)!;
    const sectionTitle = isTiktok
        ? "Registro y Operación desde TikTok Live"
        : isInnovationRoute
          ? "Propuesta de Innovación"
          : isCard
            ? "Auditoría Operaciones"
            : (fixedType?.nombre ?? section.label);
    const formTitle = isTiktok
        ? "Registrar TikTok Live"
        : isInnovationRoute
          ? "Registrar Propuesta de Innovación"
          : filters.category === "LLAMADA"
            ? "Registrar Llamada"
            : filters.category === "TARJETA_TERCERO"
              ? "Registrar Auditoria"
              : filters.category === "CALIFICACION"
                ? "Registrar calificación"
                : fixedType
                  ? `Registrar ${fixedType.nombre.toLowerCase()}`
                  : "Registrar evidencia";
    // Administración no registra bonos desde estas bandejas: sus registros son penalidades y el Cuadre Perfecto (opciones de Control).
    const registrationForm =
        !isSimple && canCreateGeneric && !isAdministrator ? (
            <EvidenciaPopup
                heading={formTitle}
                key={formRevision}
                inline
                isOpen={creatableTypes.length > 0}
                onClose={() => {
                    if (isInnovationRoute) setFormRevision((value) => value + 1);
                }}
                onSave={() => {
                    setFormRevision((value) => value + 1);
                    setPage(1);
                    setRefreshKey((value) => value + 1);
                }}
                types={creatableTypes}
                collaborators={collaborators}
            />
        ) : null;
    const innovationToolbar =
        isInnovationRoute || isTiktok ? (
            <div className="flex flex-wrap items-end gap-2">
                <div className="w-full sm:w-56">
                    <Input
                        aria-label={isInnovationRoute ? "Filtrar por propuesta" : "Filtrar por cliente o DNI"}
                        size="sm"
                        placeholder={isTiktok ? "Cliente, DNI o descripción" : "Título o descripción"}
                        value={search}
                        onChange={setSearch}
                    />
                </div>
                <div className="w-full sm:w-44">
                    <Select
                        {...(isInnovationRoute ? { "aria-label": "Filtrar por estado" } : { label: "Estado" })}
                        size="sm"
                        selectedKey={status}
                        items={[
                            { id: "", label: "Todos los estados" },
                            ...opcionesEstado("registro", ["BORRADOR", "PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"]),
                        ]}
                        onSelectionChange={(key) => setStatus(String(key ?? ""))}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                </div>
                <div className="w-full sm:w-44">
                    <CompensacionDatePicker hideLabel label="Desde" value={from} onChange={setFrom} />
                </div>
                <div className="w-full sm:w-44">
                    <CompensacionDatePicker hideLabel label="Hasta" value={to} onChange={setTo} />
                </div>
                {isInnovationRoute && (
                    <MonthPicker
                        hideLabel
                        label="Periodo"
                        value={from.slice(0, 7)}
                        allowAllMonths={false}
                        onChange={(value) => {
                            if (!/^\d{4}-\d{2}$/.test(value)) return;
                            const [year, month] = value.split("-").map(Number);
                            setFrom(`${value}-01`);
                            setTo(`${value}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`);
                        }}
                    />
                )}
                <Button size="sm" color={isInnovationRoute ? "secondary" : "primary"} iconLeading={XClose} onClick={clearFilters}>
                    Limpiar
                </Button>
            </div>
        ) : undefined;
    const cardToolbar = isCard ? (
        <LlamadasFiltros
            leading={filterLeading}
            documento={documentoCliente}
            nombre={nombreCliente}
            colaborador={colaboradorFiltro}
            onDocumento={setDocumentoCliente}
            onNombre={setNombreCliente}
            onColaborador={setColaboradorFiltro}
            status={status}
            onStatus={setStatus}
            month={from.slice(0, 7)}
            from={from}
            to={to}
            onFrom={setFrom}
            onTo={setTo}
            onMonth={(value) => {
                const range = llamadasRango(value, "ALL");
                setFrom(range.from);
                setTo(range.to);
            }}
            onClear={clearFilters}
        />
    ) : undefined;

    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                    <div className={isSimple ? "flex min-w-0 flex-1 items-center justify-between gap-3" : "flex min-w-0 items-center gap-2"}>
                        <CompensacionHeading section="evidencias" title={sectionTitle} />
                        {(isInnovationRoute || isCall || isCard) && (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={InfoCircle}
                                tooltip={`Información de ${isInnovationRoute ? "Propuesta de Innovación" : isCall ? "Llamadas" : "Auditoría Operaciones"}`}
                                className={compensationTableActionClass}
                                onClick={() => setShowInfo(true)}
                            />
                        )}
                    </div>
                </div>
                {header}

                <div
                    aria-label={isInnovation ? "Resumen de propuestas" : isCard ? "Resumen de tarjetas" : undefined}
                    className={isSimple ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}
                >
                    {(isSimple
                        ? [
                              ...metrics.slice(1),
                              {
                                  label: "Comisión",
                                  value: moneyFormatter.format(summary.importeAprobado),
                                  helper: "Comisiones aprobadas de la consulta seleccionada",
                                  icon: CheckCircle,
                                  tone: "text-success-primary",
                              },
                          ]
                        : isSimple
                          ? metrics.slice(1)
                          : metrics
                    ).map((metric, index) => {
                        const Icon = metric.icon;
                        const MetricPanel = isSimple ? LlamadasPanel : CompensacionPanel;
                        const useMetricPanel = isSimple || isSafetyPay;
                        return (
                            <motion.article
                                key={metric.label}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: index * 0.035 }}
                                className={layered || useMetricPanel ? "min-w-0" : "rounded-xl border border-secondary bg-primary p-4 shadow-xs"}
                            >
                                {layered || useMetricPanel ? (
                                    <MetricPanel title={metric.label} trailing={<Icon aria-hidden="true" className={`size-5 shrink-0 ${metric.tone}`} />}>
                                        <p className={`text-display-xs font-semibold tabular-nums ${metric.tone}`}>
                                            {isLoading || loadError ? "—" : metric.value}
                                        </p>
                                        <p className="mt-1 text-xs text-tertiary">{loadError ? "Resumen no disponible" : metric.helper}</p>
                                    </MetricPanel>
                                ) : (
                                    <>
                                        <div className="flex items-start justify-between">
                                            <p className="text-xs font-medium text-tertiary">{metric.label}</p>
                                            <Icon className={`size-5 ${metric.tone}`} />
                                        </div>
                                        <p className={`mt-3 text-display-xs font-semibold tabular-nums ${metric.tone}`}>
                                            {isLoading || loadError ? "—" : metric.value}
                                        </p>
                                        <p className="mt-1 text-xs text-tertiary">{loadError ? "Resumen no disponible" : metric.helper}</p>
                                    </>
                                )}
                            </motion.article>
                        );
                    })}
                </div>
                {registrationForm}
                {isCard && !isAdministrator && (!isStoreManager || callContext?.puedeRegistrar) && (
                    <LlamadasPanel title={formTitle}>
                        <TarjetaTerceroForm
                            key={formRevision}
                            compact
                            contexto={callContext}
                            error={callContextError}
                            onSave={() => {
                                setFormRevision((value) => value + 1);
                                setPage(1);
                                setRefreshKey((value) => value + 1);
                            }}
                        />
                    </LlamadasPanel>
                )}

                {isCall && !isAdministrator && (
                    <LlamadaForm
                        contexto={callContext}
                        error={callContextError}
                        onSave={() => {
                            setPage(1);
                            setRefreshKey((value) => value + 1);
                        }}
                    />
                )}

                {!isSimple &&
                    !isAdministrator &&
                    types.length === 0 &&
                    !isLoading &&
                    (isInnovationRoute ? (
                        <AlertMessage tone="notice">No hay bonos disponibles; solicita al administrador que revise los bonos habilitados.</AlertMessage>
                    ) : (
                        <div className="border-warning rounded-xl border bg-warning-secondary p-4">
                            <p className="text-sm font-semibold text-warning-primary">No hay bonos disponibles para registrar</p>
                            <p className="mt-1 text-sm text-tertiary">Solicita al administrador que revise los bonos habilitados.</p>
                        </div>
                    ))}

                {layered && loadError ? (
                    <AlertMessage tone="error">{loadError}</AlertMessage>
                ) : (
                    loadError && <AlertMessage tone="error">{loadError}</AlertMessage>
                )}
                <section
                    aria-label={
                        isInnovation ? "Propuestas registradas" : isCard ? "Tarjetas reportadas" : isCall ? "Llamadas registradas" : "Registros de evidencias"
                    }
                    className={isTiktok ? "min-w-0 [&_table]:min-w-[75rem]" : "min-w-0"}
                >
                    {!layered && (
                        <h2
                            className={
                                isSafetyPay
                                    ? "rounded-t-2xl border border-b-0 border-secondary bg-secondary px-4 py-3 text-xs font-medium text-tertiary"
                                    : "mb-4 text-sm font-semibold text-primary"
                            }
                        >
                            {isInnovation
                                ? "Propuestas registradas"
                                : filters.category === "LLAMADA"
                                  ? "Llamadas registradas"
                                  : filters.category === "TARJETA_TERCERO"
                                    ? "Tarjetas reportadas"
                                    : sectionTitle}
                        </h2>
                    )}
                    <div className={layered || isSafetyPay ? undefined : "mt-4"}>
                        <DataTable
                            toolbar={
                                isCard ? (
                                    cardToolbar
                                ) : isTiktok || isInnovationRoute ? (
                                    <CompensacionFiltros toolbar>{innovationToolbar}</CompensacionFiltros>
                                ) : isCall ? (
                                    <LlamadasFiltros
                                        documento={documentoCliente}
                                        nombre={nombreCliente}
                                        colaborador={colaboradorFiltro}
                                        onDocumento={setDocumentoCliente}
                                        onNombre={setNombreCliente}
                                        onColaborador={setColaboradorFiltro}
                                        search={search}
                                        status={status}
                                        month={callMonth}
                                        period={callPeriod}
                                        from={from}
                                        to={to}
                                        onFrom={setFrom}
                                        onTo={setTo}
                                        isLoading={isLoading}
                                        onClear={() => {
                                            setCallMonth(monthRange().from.slice(0, 7));
                                            setCallPeriod("ALL");
                                            clearFilters();
                                        }}
                                        onRefresh={() => {
                                            if (from && to && to < from) {
                                                notify("validation", "La fecha hasta no puede ser anterior a la fecha desde.");
                                                return;
                                            }
                                            applyFilters();
                                            setRefreshKey((value) => value + 1);
                                        }}
                                        onSearch={setSearch}
                                        onStatus={setStatus}
                                        onMonth={(value) => {
                                            setCallMonth(value);
                                            setCallPeriod("ALL");
                                            const range = llamadasRango(value, "ALL");
                                            setFrom(range.from);
                                            setTo(range.to);
                                        }}
                                        onPeriod={(value) => {
                                            const nextMonth = value === "ALL" ? callMonth : fechaLima().slice(0, 7);
                                            setCallMonth(nextMonth);
                                            setCallPeriod(value);
                                            const range = llamadasRango(nextMonth, value);
                                            setFrom(range.from);
                                            setTo(range.to);
                                        }}
                                    />
                                ) : isSafetyPay ? (
                                    <CompensacionFiltros toolbar>
                                        <div className="flex flex-wrap items-end gap-3">
                                            <Input
                                                aria-label="Filtrar por DNI"
                                                className="w-full sm:w-32"
                                                inputMode="numeric"
                                                maxLength={9}
                                                placeholder="DNI"
                                                size="sm"
                                                value={documentoCliente}
                                                onChange={(value) => setDocumentoCliente(value.replace(/\D/g, "").slice(0, 9))}
                                            />
                                            <Input
                                                aria-label="Filtrar por cliente"
                                                className="w-full sm:w-56"
                                                maxLength={200}
                                                placeholder="Nombre Cliente"
                                                size="sm"
                                                value={nombreCliente}
                                                onChange={setNombreCliente}
                                            />
                                            <Input
                                                aria-label="Filtrar por colaborador"
                                                className="w-full sm:w-56"
                                                maxLength={200}
                                                placeholder="Nombre o DNI Colaborador"
                                                size="sm"
                                                value={colaboradorFiltro}
                                                onChange={setColaboradorFiltro}
                                            />
                                            <div className="w-full sm:w-44">
                                                <Select
                                                    aria-label="Filtrar por estado"
                                                    size="sm"
                                                    items={[
                                                        { id: "", label: "Todos los estados" },
                                                        ...opcionesEstado("registro", [
                                                            "BORRADOR",
                                                            "PENDIENTE",
                                                            "APROBADO",
                                                            "RECHAZADO",
                                                            "ANULADO",
                                                            "LIQUIDADO",
                                                        ]),
                                                    ]}
                                                    selectedKey={status}
                                                    onSelectionChange={(key) => setStatus(key !== null ? String(key) : "")}
                                                >
                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                </Select>
                                            </div>
                                            <div className="w-full sm:w-44">
                                                <CompensacionDatePicker hideLabel label="Desde" value={from} onChange={setFrom} />
                                            </div>
                                            <div className="w-full sm:w-44">
                                                <CompensacionDatePicker hideLabel label="Hasta" value={to} onChange={setTo} />
                                            </div>
                                            <MonthPicker
                                                hideLabel
                                                label="Periodo"
                                                allowAllMonths={false}
                                                value={from.slice(0, 7)}
                                                onChange={(value) => {
                                                    if (!value) return;
                                                    const [year, month] = value.split("-").map(Number);
                                                    setFrom(`${value}-01`);
                                                    setTo(`${value}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`);
                                                }}
                                            />
                                            <Button size="sm" color="secondary" iconLeading={XClose} onClick={clearFilters}>
                                                Limpiar
                                            </Button>
                                        </div>
                                    </CompensacionFiltros>
                                ) : (
                                    <CompensacionFiltros toolbar>
                                        <div className="flex flex-wrap items-end gap-3">
                                            <div className="w-full sm:w-56">
                                                <Input
                                                    aria-label="Filtrar por nombre o DNI"
                                                    size="sm"
                                                    placeholder="Nombre o DNI"
                                                    value={search}
                                                    onChange={setSearch}
                                                />
                                            </div>
                                            {!fixedType && types.filter((item) => !category || item.categoria === category).length > 1 && (
                                                <div className="w-full sm:w-52">
                                                    <Select
                                                        label="Tipo"
                                                        size="sm"
                                                        items={[
                                                            { id: 0, label: "Todos" },
                                                            ...types
                                                                .filter((item) => !category || item.categoria === category)
                                                                .map((item) => ({ id: item.id, label: item.nombre })),
                                                        ]}
                                                        selectedKey={typeId}
                                                        onSelectionChange={(key) => setTypeId(key !== null ? Number(key) : 0)}
                                                    >
                                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                    </Select>
                                                </div>
                                            )}
                                            <div className="w-full sm:w-44">
                                                <Select
                                                    label="Estado"
                                                    size="sm"
                                                    items={[
                                                        { id: "", label: "Todos los estados" },
                                                        ...opcionesEstado(
                                                            "registro",
                                                            isSimple
                                                                ? ["PENDIENTE", "APROBADO", "RECHAZADO"]
                                                                : ["BORRADOR", "PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"],
                                                        ),
                                                    ]}
                                                    selectedKey={status}
                                                    onSelectionChange={(key) => setStatus(key !== null ? String(key) : "")}
                                                >
                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                </Select>
                                            </div>
                                            {isSimple ? (
                                                <div className="w-44">
                                                    <MonthPicker
                                                        hideLabel
                                                        label="Periodo"
                                                        allowAllMonths={false}
                                                        value={from.slice(0, 7)}
                                                        onChange={(value) => {
                                                            if (!value) {
                                                                setFrom("");
                                                                setTo("");
                                                                return;
                                                            }
                                                            if (!/^\d{4}-\d{2}$/.test(value)) return;
                                                            const [year, month] = value.split("-").map(Number);
                                                            const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
                                                            setFrom(`${value}-01`);
                                                            setTo(`${value}-${lastDay}`);
                                                        }}
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="w-full sm:w-44">
                                                        <CompensacionDatePicker hideLabel label="Desde" value={from} onChange={setFrom} />
                                                    </div>
                                                    <div className="w-full sm:w-44">
                                                        <CompensacionDatePicker hideLabel label="Hasta" value={to} onChange={setTo} />
                                                    </div>
                                                    <MonthPicker
                                                        hideLabel
                                                        label="Periodo"
                                                        allowAllMonths={false}
                                                        value={from.slice(0, 7)}
                                                        onChange={(value) => {
                                                            if (!value) return;
                                                            const [year, month] = value.split("-").map(Number);
                                                            setFrom(`${value}-01`);
                                                            setTo(`${value}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`);
                                                        }}
                                                    />
                                                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={clearFilters}>
                                                        Limpiar
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </CompensacionFiltros>
                                )
                            }
                            density="compact"
                            wrapText
                            columns={columns}
                            data={rows}
                            isLoading={isLoading}
                            page={page}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            onPageChange={setPage}
                            onPageSizeChange={(size) => {
                                setPageSize(size);
                                setPage(1);
                            }}
                            emptyMessage={
                                loadError
                                    ? "Consulta no disponible"
                                    : isCard
                                      ? "Sin tarjetas con estos filtros"
                                      : isCall
                                        ? "Sin llamadas con estos filtros"
                                        : "No hay evidencias en el período"
                            }
                            emptyDescription={
                                isCard || isCall || isAdministrator
                                    ? "Revisa el mes y los filtros seleccionados."
                                    : "Cambia los filtros o registra una nueva evidencia."
                            }
                            renderActions={(row) => {
                                const item = items.find((entry) => entry.id === Number(row.id));
                                if (item && isInnovationRoute) {
                                    const own = item.usuarioRegistraId === userId && canCreateGeneric;
                                    const draft = item.estado === "BORRADOR" && own;
                                    const manageOwn = own && ["BORRADOR", "PENDIENTE"].includes(item.estado);
                                    const openProposal = (action: InnovacionPropuestaAction | "REVISION") => {
                                        setProposalAction(action);
                                        setSelected(item);
                                    };
                                    return (
                                        <div className="flex items-center gap-1">
                                            <ButtonUtility
                                                size="xs"
                                                color="tertiary"
                                                icon={Eye}
                                                tooltip="Ver detalle de la propuesta"
                                                className={compensationTableActionClass}
                                                onClick={() => openProposal("DETALLE")}
                                            />
                                            {draft && (
                                                <ButtonUtility
                                                    size="xs"
                                                    color="tertiary"
                                                    icon={Send01}
                                                    tooltip="Enviar propuesta"
                                                    className={compensationTableActionClass}
                                                    onClick={() => openProposal("ENVIAR")}
                                                />
                                            )}
                                            {manageOwn && (
                                                <>
                                                    <ButtonUtility
                                                        size="xs"
                                                        color="tertiary"
                                                        icon={Edit03}
                                                        tooltip="Editar propuesta"
                                                        className={compensationTableActionClass}
                                                        onClick={() => openProposal("EDITAR")}
                                                    />
                                                    <ButtonUtility
                                                        size="xs"
                                                        color="tertiary"
                                                        icon={Trash01}
                                                        tooltip="Eliminar propuesta"
                                                        className={compensationTableActionClass}
                                                        onClick={() => openProposal("ELIMINAR")}
                                                    />
                                                </>
                                            )}
                                            {isAdministrator && (
                                                <InnovacionRevisionActions
                                                    key={`${item.id}:${item.fechaActualizacion}`}
                                                    item={item}
                                                    userId={userId}
                                                    onChanged={() => setRefreshKey((value) => value + 1)}
                                                />
                                            )}
                                            {isAdministrator && item.estado === "APROBADO" && item.usuarioRegistraId !== userId && (
                                                <ButtonUtility
                                                    size="xs"
                                                    color="tertiary"
                                                    icon={CheckCircle}
                                                    tooltip="Comprobar implementación"
                                                    className={compensationTableActionClass}
                                                    onClick={() => openProposal("REVISION")}
                                                />
                                            )}
                                        </div>
                                    );
                                }
                                if (item && isSimple)
                                    return (
                                        <LlamadaActions
                                            compact
                                            iconOnly
                                            key={item.id}
                                            item={item}
                                            contexto={callContext}
                                            onChanged={() => setRefreshKey((value) => value + 1)}
                                            onDetail={() => setSelected(item)}
                                        />
                                    );
                                return item ? (
                                    <ButtonUtility
                                        size="xs"
                                        color="tertiary"
                                        icon={Eye}
                                        tooltip={
                                            isInnovation
                                                ? "Ver detalle de la propuesta"
                                                : !isAdvisor && item.estado === "PENDIENTE"
                                                  ? "Revisar evidencia"
                                                  : "Ver detalle de evidencia"
                                        }
                                        className={compensationTableActionClass}
                                        onClick={() => setSelected(item)}
                                    />
                                ) : null;
                            }}
                        />
                    </div>
                </section>
                {isInnovationRoute && proposalAction !== "REVISION" ? (
                    selected && (
                        <InnovacionPropuestaDialog
                            key={`${selected.id}:${proposalAction}`}
                            item={selected}
                            action={proposalAction}
                            onClose={() => setSelected(null)}
                            onChanged={() => {
                                setSelected(null);
                                setRefreshKey((value) => value + 1);
                            }}
                        />
                    )
                ) : (
                    <EvidenciaDetailModal
                        readOnly={
                            isAdvisor ||
                            (isStoreManager &&
                                (!selected?.idColaboradorBeneficiario ||
                                    selected.usuarioRegistraId === userId ||
                                    [selected.idColaboradorBeneficiario, selected.idColaboradorResponsable].includes(
                                        callContext?.idColaborador ?? collaborators.find((person) => person.idUsuario === userId)?.id,
                                    )))
                        }
                        allowOwnDraft={isAdvisor && canCreateGeneric && selected?.usuarioRegistraId === userId}
                        item={selected}
                        llamadaContexto={isSimple ? callContext : undefined}
                        onClose={() => setSelected(null)}
                        onChanged={() => {
                            setSelected(null);
                            setRefreshKey((value) => value + 1);
                        }}
                    />
                )}
                {showInfo &&
                    (isInnovationRoute ? (
                        <InnovacionInfoDialog onClose={() => setShowInfo(false)} />
                    ) : isCall ? (
                        <LlamadaInfoDialog onClose={() => setShowInfo(false)} />
                    ) : isCard ? (
                        <TarjetaInfoDialog onClose={() => setShowInfo(false)} />
                    ) : null)}
            </div>
        </AppLayout>
    );
};
