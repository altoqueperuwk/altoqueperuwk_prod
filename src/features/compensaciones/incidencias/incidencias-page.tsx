import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Coins01, Eye, File07, RefreshCw01, XClose } from "@untitledui/icons";
import { useSearchParams } from "react-router";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { AdminAuditoriaNavigation } from "../shared/admin-auditoria-navigation";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { estadoVisual } from "../shared/compensacion-estados";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionOptions } from "../shared/compensacion-options";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { incidenciaColumns, incidenciaRows } from "./incidencia-columns";
import { IncidenciaDetailModal } from "./incidencia-detail-modal";
import { type IncidenciaPersonalConcept, personalIncidenceConcept, personalIncidenceTitle } from "./incidencia-personal-policy";
import { IncidenciaPopup } from "./incidencia-popup";
import { IncidenciasEquipoPage } from "./incidencias-equipo-page";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaBandeja, IncidenciaCatalogo, IncidenciaEvento, IncidenciasResumen } from "./incidencias.types";

const emptyCatalog: IncidenciaCatalogo = { tipos: [], reportantes: [], responsables: [], penalidades: [] };
const emptySummary: IncidenciasResumen = {
    recibidosPendientes: 0,
    aprobados: 0,
    rechazados: 0,
    anulados: 0,
    totalDescuentosAprobados: 0,
    totalBonosReportantes: 0,
};
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const errorMessage = (error: unknown, fallback: string) => (error && typeof error === "object" && "message" in error ? String(error.message) : fallback);
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const monthRange = (period?: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const year = period ? Number(period.split("-")[0]) : Number(parts.find((part) => part.type === "year")?.value);
    const month = period ? Number(period.split("-")[1]) : Number(parts.find((part) => part.type === "month")?.value);
    return {
        from: `${year}-${String(month).padStart(2, "0")}-01`,
        to: `${year}-${String(month).padStart(2, "0")}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
    };
};

export const IncidenciasRoute = () => {
    const [search] = useSearchParams();
    const { isStoreManager } = useCompensacionPerfil();
    const concept = personalIncidenceConcept(search.get("concepto"));
    // Uniforme e Indisciplina del Jefe se registran desde el mismo formulario de Incidencias del equipo.
    return isStoreManager ? <IncidenciasEquipoPage /> : <IncidenciasPage concept={concept} />;
};
/** readOnly: consulta propia con descargo desde Acciones, sin formulario ni bandejas (ATC). header: selector de la opción que la contiene. */
export const IncidenciasPage = withAlertProvider<{
    auditoriaOnly?: boolean;
    concept?: IncidenciaPersonalConcept;
    readOnly?: boolean;
    excludeCodes?: readonly string[];
    title?: string;
    header?: ReactNode;
    filterLeading?: ReactNode;
    /** Reemplaza las opciones por concepto con un filtro «Todos los conceptos / Uniforme / Indisciplina» dentro de la tabla. */
    conceptFilter?: boolean;
    /** Lista fija de solo consulta (p. ej. Penalidad Escalonada Bonos de Pagos), sin selector de concepto. */
    fixedList?: "ESCALONADA";
}>(({ auditoriaOnly = false, concept, readOnly = false, excludeCodes, title, header, filterLeading, conceptFilter = false, fixedList } = {}) => {
    const { userId } = useCompensacionPerfil();
    return (
        <IncidenciasContent
            key={`${userId}:${auditoriaOnly}:${concept ?? "general"}:${readOnly}:${conceptFilter}:${fixedList ?? ""}`}
            fixedList={fixedList}
            conceptFilter={conceptFilter}
            auditoriaOnly={auditoriaOnly}
            concept={concept}
            readOnly={readOnly}
            excludeCodes={excludeCodes}
            title={title}
            header={header}
            filterLeading={filterLeading}
        />
    );
});

const IncidenciasContent = ({
    auditoriaOnly,
    concept,
    readOnly,
    excludeCodes,
    title,
    header,
    filterLeading,
    conceptFilter,
    fixedList,
}: {
    fixedList?: "ESCALONADA";
    auditoriaOnly: boolean;
    concept?: IncidenciaPersonalConcept;
    readOnly: boolean;
    excludeCodes?: readonly string[];
    title?: string;
    header?: ReactNode;
    filterLeading?: ReactNode;
    conceptFilter: boolean;
}) => {
    const { isAdvisor: isAtc, isFacturacion, isPagos, isMarketing, isStoreManager } = useCompensacionPerfil();
    const isAdvisor = isAtc || isFacturacion;
    // Facturación, Pagos y Marketing ven solo lo propio y sin formulario de registro.
    const soloLectura = isFacturacion || isPagos || isMarketing || readOnly;
    const notify = useAlert();
    const dates = useMemo(monthRange, []);
    const [catalog, setCatalog] = useState(emptyCatalog);
    const [items, setItems] = useState<IncidenciaEvento[]>([]);
    const [summary, setSummary] = useState(emptySummary);
    const [tray, setTray] = useState<IncidenciaBandeja>(concept || soloLectura ? "TODOS" : auditoriaOnly ? "ENVIADOS" : "RECIBIDOS");
    // El perfil puede resolverse después del primer render: solo lectura siempre consulta "Todos".
    useEffect(() => {
        if (soloLectura && !concept) setTray("TODOS");
    }, [soloLectura, concept]);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState(auditoriaOnly ? "AUDITORIA_PAGO" : "");
    const [status, setStatus] = useState("");
    const [conceptSel, setConceptSel] = useState<"TODOS" | IncidenciaPersonalConcept>("TODOS");
    const listConcept = fixedList ?? (conceptFilter ? conceptSel : concept);
    const [from, setFrom] = useState(dates.from);
    const [to, setTo] = useState(dates.to);
    const [filters, setFilters] = useState({ search: "", category: auditoriaOnly ? "AUDITORIA_PAGO" : "", status: "", from: dates.from, to: dates.to });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [formRevision, setFormRevision] = useState(0);
    const [selected, setSelected] = useState<IncidenciaEvento | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const requestId = useRef(0);
    const [loadError, setLoadError] = useState("");
    const [catalogError, setCatalogError] = useState("");
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogRefresh, setCatalogRefresh] = useState(0);

    useEffect(() => {
        let active = true;
        setCatalogLoading(true);
        setCatalogError("");
        incidenciasService
            .getCatalog()
            .then((result) => {
                if (active) setCatalog(result);
            })
            .catch((error) => {
                if (!active) return;
                setCatalog(emptyCatalog);
                setCatalogError(errorMessage(error, "No fue posible cargar el catálogo de incidencias"));
            })
            .finally(() => {
                if (active) setCatalogLoading(false);
            });
        return () => {
            active = false;
        };
    }, [refreshKey, catalogRefresh]);
    const loadData = useCallback(async () => {
        const request = ++requestId.current;
        setItems([]);
        setLoadError("");
        setIsLoading(true);
        try {
            const result = await incidenciasService.getList({
                tray,
                ...filters,
                penaltyId: 0,
                page,
                pageSize,
                ...(listConcept ? { concept: listConcept } : {}),
                ...(excludeCodes ? { excludeCodes } : {}),
            });
            if (request !== requestId.current) return;
            setItems(result.items);
            setSummary(result.resumen);
            setTotalPages(Math.max(1, result.totalPages));
        } catch (error) {
            if (request !== requestId.current) return;
            const message = errorMessage(error, "No fue posible cargar las incidencias");
            setLoadError(message);
            setItems([]);
            setSummary(emptySummary);
            setTotalPages(1);
            notify("error", message);
        } finally {
            if (request === requestId.current) setIsLoading(false);
        }
    }, [notify, filters, page, pageSize, refreshKey, tray, listConcept, excludeCodes]);
    useEffect(() => {
        void loadData();
        return () => {
            ++requestId.current;
        };
    }, [loadData]);
    useEffect(() => {
        if (from && to && to < from) return;
        if (search === filters.search && category === filters.category && status === filters.status && from === filters.from && to === filters.to) return;
        const timer = setTimeout(() => {
            setPage(1);
            setFilters({ search, category, status, from, to });
        }, 350);
        return () => clearTimeout(timer);
    }, [search, category, status, from, to, filters]);

    const clearFilters = () => {
        const current = monthRange();
        setSearch("");
        setStatus("");
        setFrom(current.from);
        setTo(current.to);
        setPage(1);
        setSelected(null);
        setFilters({ search: "", category: filters.category, status: "", ...current });
    };
    const changeTray = (value: IncidenciaBandeja) => {
        if (value === tray) {
            return;
        }
        ++requestId.current;
        setSelected(null);
        setTray(value);
        setPage(1);
    };

    const rows = useMemo(() => incidenciaRows(items), [items]);
    const columns = incidenciaColumns(filters.category)
        .filter((column) => !isStoreManager || !["descuento", "descuentoAprobado"].includes(column.key))
        .map((column) => (isStoreManager && column.key === "bono" ? { ...column, header: "Monto previsto" } : column));

    const formCatalog = useMemo(
        () => ({
            ...catalog,
            tipos: catalog.tipos
                .filter((item) => ["REPORTE_PENALIDAD", "AUDITORIA_ACTIVA"].includes(item.codigo))
                .filter((item) =>
                    concept
                        ? item.codigo === "REPORTE_PENALIDAD"
                        : auditoriaOnly
                          ? item.codigo === "AUDITORIA_ACTIVA" && item.categoria === "AUDITORIA_PAGO"
                          : !filters.category || item.categoria === filters.category,
                ),
        }),
        [catalog, filters.category, auditoriaOnly, concept],
    );
    const sectionTitle = concept
        ? personalIncidenceTitle(concept)
        : auditoriaOnly
          ? "Comisión de Auditoría Activa"
          : filters.category === "AUDITORIA_PAGO"
            ? "Auditoría de Pagos"
            : filters.category === "PENALIDAD"
              ? "Reportes de Penalidad"
              : "Reportes de Penalidad";
    const changeSection = (value: string) => {
        ++requestId.current;
        setSelected(null);
        setFormRevision((value) => value + 1);
        setCategory(value);
        setStatus("");
        setPage(1);
        setFilters((current) => ({ ...current, category: value, status: "" }));
    };
    const metrics = [
        {
            label: "Pendientes",
            value: summary.recibidosPendientes,
            helper: tray === "RECIBIDOS" ? "Esperando decisión de sede" : "En la bandeja actual",
            icon: File07,
            tone: "text-warning-primary",
        },
        { label: "Aprobadas", value: summary.aprobados, helper: `${summary.rechazados} rechazada(s)`, icon: CheckCircle, tone: "text-success-primary" },
        {
            label: "Descuentos Aprobados",
            value: money.format(summary.totalDescuentosAprobados),
            helper: "Aplicables a responsables",
            icon: AlertCircle,
            tone: "text-error-primary",
        },
        {
            label: auditoriaOnly ? "Comisión Aprobada" : "Bonos a Reportantes",
            value: money.format(summary.totalBonosReportantes),
            helper: `${summary.anulados} anulada(s)`,
            icon: Coins01,
            tone: "text-success-primary",
        },
    ]
        .filter((metric) => !isStoreManager || metric.label !== "Descuentos Aprobados")
        .filter((metric) => !soloLectura || metric.label !== "Bonos a Reportantes")
        .map((metric) =>
            soloLectura && metric.label === "Descuentos Aprobados" ? { ...metric, label: "Penalidades Aprobadas", helper: "Aplicadas a ti" } : metric,
        );
    const statusValues = soloLectura ? ["PENDIENTE", "APROBADO", "RECHAZADO"] : ["BORRADOR", "PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO", "LIQUIDADO"];

    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                    <CompensacionHeading
                        section="incidencias"
                        title={
                            title ??
                            (auditoriaOnly
                                ? isStoreManager
                                    ? "Auditoría Activa del Equipo"
                                    : "Auditoría de Pagos"
                                : soloLectura
                                  ? "Incidencias"
                                  : isAdvisor
                                    ? "Mis Incidencias"
                                    : sectionTitle)
                        }
                    />
                </div>
                {header}
                {auditoriaOnly && <AdminAuditoriaNavigation />}
                {!concept && !auditoriaOnly && !soloLectura && (
                    <CompensacionOptions
                        label="Opciones de incidencias"
                        selected={filters.category}
                        onChange={changeSection}
                        options={[
                            { id: "", label: "Todas las incidencias", description: "Consulta todos los reportes." },
                            { id: "PENALIDAD", label: "Reportes de penalidad", description: "Errores y descuentos entre sedes." },
                            { id: "AUDITORIA_PAGO", label: "Auditoría de pagos", description: "Errores reportados por el equipo de Pagos." },
                        ]}
                    />
                )}
                <div
                    className={`grid gap-3 ${isStoreManager || soloLectura ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"} [&>section]:flex [&>section]:flex-col [&>section>div:last-child]:flex-1`}
                >
                    {metrics.map((metric) => {
                        const Icon = metric.icon;
                        return (
                            <CompensacionPanel
                                key={metric.label}
                                title={metric.label}
                                trailing={<Icon aria-hidden="true" className={`size-5 shrink-0 ${metric.tone}`} />}
                            >
                                <p className={`text-display-xs font-semibold tabular-nums ${metric.tone}`}>{isLoading || loadError ? "—" : metric.value}</p>
                                <p className="mt-1 text-xs text-tertiary">{loadError ? "Resumen no disponible" : metric.helper}</p>
                            </CompensacionPanel>
                        );
                    })}
                </div>
                {catalogError && (
                    <div className="space-y-2">
                        <AlertMessage tone="error">{catalogError}</AlertMessage>
                        <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => setCatalogRefresh((value) => value + 1)}>
                            Reintentar catálogo
                        </Button>
                    </div>
                )}
                {!catalogLoading &&
                    !catalogError &&
                    formCatalog.tipos.length > 0 &&
                    catalog.reportantes.length > 0 &&
                    !(isStoreManager && auditoriaOnly) &&
                    !soloLectura && (
                        <IncidenciaPopup
                            key={formRevision}
                            inline
                            isOpen
                            onClose={() => {}}
                            onSave={() => {
                                setFormRevision((value) => value + 1);
                                setTray(concept ? "TODOS" : "ENVIADOS");
                                setPage(1);
                                setRefreshKey((value) => value + 1);
                            }}
                            catalog={formCatalog}
                            concept={concept}
                        />
                    )}
                {loadError && (
                    <div className="space-y-2">
                        <AlertMessage tone="error">{loadError}</AlertMessage>
                        <Button size="sm" color="secondary" iconLeading={RefreshCw01} onClick={() => setRefreshKey((value) => value + 1)}>
                            Reintentar consulta
                        </Button>
                    </div>
                )}
                {formCatalog.tipos.length === 0 && !catalogLoading && !catalogError && !soloLectura && (
                    <AlertMessage tone="notice">
                        {auditoriaOnly ? "No está habilitado el registro de Auditoría Activa" : "No hay reportes disponibles para registrar"}
                    </AlertMessage>
                )}
                <DataTable
                    density="compact"
                    wrapText
                    toolbar={
                        <CompensacionFiltros toolbar>
                            {/* Solo lectura: no recibe ni envía; ve todas sus incidencias sin bandejas. */}
                            <div className={soloLectura ? "hidden" : "mb-3 flex flex-wrap gap-2"} aria-label="Bandejas de incidencias">
                                {(["RECIBIDOS", "ENVIADOS", "HISTORIAL", "TODOS"] as IncidenciaBandeja[])
                                    .filter((value) => !soloLectura && (!isStoreManager || value !== "RECIBIDOS"))
                                    .map((value) => (
                                        <Button
                                            key={value}
                                            size="sm"
                                            color={tray === value ? "primary" : "secondary"}
                                            aria-pressed={tray === value}
                                            onClick={() => changeTray(value)}
                                        >
                                            {humanize(value)}
                                        </Button>
                                    ))}
                            </div>
                            <div className="flex flex-wrap items-end gap-2 [&_label]:whitespace-nowrap">
                                {filterLeading}
                                {conceptFilter && (
                                    <div className="w-full sm:w-56">
                                        <Select
                                            label=""
                                            aria-label="Filtrar por concepto"
                                            placeholder="Todos los conceptos"
                                            size="sm"
                                            selectedKey={conceptSel}
                                            items={[
                                                { id: "TODOS", label: "Todos los conceptos" },
                                                { id: "UNIFORME", label: personalIncidenceTitle("UNIFORME") },
                                                { id: "INDISCIPLINA", label: personalIncidenceTitle("INDISCIPLINA") },
                                            ]}
                                            onSelectionChange={(key) => {
                                                setConceptSel(key === "UNIFORME" || key === "INDISCIPLINA" ? key : "TODOS");
                                                setPage(1);
                                            }}
                                        >
                                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                        </Select>
                                    </div>
                                )}
                                <div className="w-full sm:w-56">
                                    <Input
                                        label=""
                                        aria-label="Nombre o DNI Colaborador"
                                        size="sm"
                                        placeholder="Nombre o DNI Colaborador"
                                        value={search}
                                        onChange={setSearch}
                                    />
                                </div>
                                <div className="w-full sm:w-44">
                                    <Select
                                        label=""
                                        aria-label="Estado"
                                        size="sm"
                                        selectedKey={status}
                                        items={[
                                            { id: "", label: "Todos los estados" },
                                            ...statusValues.map((value) => ({
                                                id: value,
                                                label: estadoVisual("registro", value).label,
                                            })),
                                        ]}
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
                                        const next = monthRange(value);
                                        setFrom(next.from);
                                        setTo(next.to);
                                    }}
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={clearFilters}>
                                        Limpiar
                                    </Button>
                                </div>
                            </div>
                        </CompensacionFiltros>
                    }
                    columns={columns}
                    data={isLoading || loadError ? [] : rows}
                    isLoading={isLoading}
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage={loadError ? "Consulta no disponible" : "No hay incidencias en esta bandeja"}
                    emptyDescription="Cambia el período, los filtros o selecciona otra bandeja."
                    renderActions={(row) => {
                        const item = items.find((entry) => entry.id === Number(row.id));
                        return item ? (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={Eye}
                                tooltip="Ver detalle de incidencia"
                                className={compensationTableActionClass}
                                onClick={() => setSelected(item)}
                            />
                        ) : null;
                    }}
                />
                <IncidenciaDetailModal
                    item={selected}
                    actorCollaboratorId={catalog.reportantes.length === 1 ? catalog.reportantes[0].id : undefined}
                    onClose={() => setSelected(null)}
                    onChanged={() => {
                        setSelected(null);
                        setRefreshKey((value) => value + 1);
                    }}
                />
            </div>
        </AppLayout>
    );
};
