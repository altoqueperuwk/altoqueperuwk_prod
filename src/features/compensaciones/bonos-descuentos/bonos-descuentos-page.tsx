import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Clock, Coins01, Eye, RefreshCw01, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Select } from "@/components/base/select/select";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { compensationMoney } from "@/features/compensaciones/shared/compensacion-cells";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { estadoVisual, grupoDeEstado, opcionesEstado, opcionesGrupoEstado } from "@/features/compensaciones/shared/compensacion-estados";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { HallazgoExpedienteDialog } from "../incidencias/hallazgo-expediente-dialog";
import { PancakeFuenteEstado } from "../pancake-adjudicacion/pancake-fuente-estado";
import { NombreCell, NotasCell } from "../shared/compensacion-cells";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { ayudaDeConcepto, origenDeConcepto } from "../shared/compensacion-origen";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { type CompensacionTipo, compensacionTipo, compensacionTipoLabel, compensacionTipoOptions, compensacionTipoServidor } from "../shared/compensacion-tipo";
import { expedienteIdFromKey, seguimientoJefaturaService } from "../shared/seguimiento-jefatura.service";
import { bonosDescuentosService } from "./bonos-descuentos.service";
import type {
    BonoDescuentoConcepto,
    BonosDescuentosFiltros,
    BonosDescuentosRegistros,
    BonosDescuentosResultado,
    BonosDescuentosTipo,
    BonosDescuentosVista,
} from "./bonos-descuentos.types";
import { dashboardConcepto, dashboardConceptoNotice, dashboardCriterio } from "./dashboard-concepto";
import { dashboardLimites, dashboardMes } from "./dashboard-filtros";
import { RegistroFormularioDialog } from "./registro-formulario-dialog";
import { useDashboardConsulta } from "./use-dashboard-consulta";
import { ayudaConMonto, useMontosReferencia } from "./use-montos-referencia";

type DashboardData = BonosDescuentosResultado & { registros?: BonosDescuentosRegistros };

const money = (value: unknown) => (value == null ? "Pendiente" : compensationMoney.format(Number(value)));
const initialFilters = (): BonosDescuentosFiltros => ({
    mes: dashboardMes(),
    ...dashboardLimites(dashboardMes()),
    estado: "",
    criterio: "",
    vista: "SEGUIMIENTO",
    tipo: "",
    concepto: "",
    pagina: 1,
    tamano: 20,
});

// These are economic/operational states specific to RPC59, not generic event states.
const detailStates = Object.fromEntries(
    ["HABILITADO", "APROBADA", "PAGO_PARCIAL", "PAGADA", "ESPERANDO_OPERACION", "OPERACION_PENDIENTE", "PROVISIONAL", "EN_IMPLEMENTACION", "EN_REVISION"].map(
        (key) => [key, estadoVisual("seguimiento", key)],
    ),
);

const Dropdown = ({
    label,
    value,
    items,
    onChange,
    wide = false,
    hideLabel = false,
}: {
    label: string;
    value: string;
    items: { id: string; label: string }[];
    onChange: (value: string) => void;
    wide?: boolean;
    hideLabel?: boolean;
}) => (
    <div className={wide ? "w-full min-w-0 sm:w-64" : /Estado/i.test(label) ? "w-full min-w-0 sm:w-48" : "w-full min-w-0 sm:w-40"}>
        <Select
            {...(hideLabel ? { "aria-label": label } : { label })}
            size="sm"
            selectedKey={value}
            items={/Estado/i.test(label) ? items.map((item) => (item.id === "" ? { ...item, label: "Todos los estados" } : item)) : items}
            onSelectionChange={(key) => onChange(String(key ?? ""))}
        >
            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
        </Select>
    </div>
);

const detailColumns: ColumnDef[] = [
    {
        key: "concepto_origen",
        header: "Concepto",
        render: (value) => (value === "BONO_COLABORADOR_ATENCIONES" ? "Atenciones" : value === "BONO_COLABORADOR_CALIFICACIONES" ? "Calificaciones" : "—"),
    },
    { key: "documento", header: "DNI", render: (value) => <span className="whitespace-nowrap tabular-nums">{String(value ?? "—")}</span> },
    { key: "cliente", header: "Cliente", render: (value) => <NombreCell value={value} /> },
    { key: "fecha", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
    { key: "descripcion", header: "Detalle", render: (value) => <NotasCell value={value} /> },
    { key: "operacion", header: "Operación", render: (value) => String(value ?? "—") },
    {
        key: "estado",
        header: "Estado",
        render: (value) => <CompensacionEstado dominio="seguimiento" valor={value} />,
    },
    {
        key: "importe",
        header: "Monto",
        align: "right",
        render: (value) => <span className="whitespace-nowrap text-secondary tabular-nums">{money(value)}</span>,
    },
];

/** Hallazgos propios del Jefe: se muestran como filas de la misma tabla (Bono si es comisión, Penalidad si es penalidad). */
const destinoAuditoria = { modulo: "Auditoría de Pagos", href: "/compensaciones/auditoria-activa" };
const destinoIncidencias = { modulo: "Incidencias", href: "/compensaciones/incidencias" };
const destinoDeFila = (row: Record<string, unknown>): { modulo: string; href?: string } | null =>
    (row.destino as { modulo: string; href?: string } | undefined) ?? origenDeConcepto(row.concepto_codigo);

const useObservaciones = (enabled: boolean, mes: string) => {
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!enabled) {
            setRows([]);
            setBusy(false);
            return;
        }
        let active = true;
        setBusy(true);
        void seguimientoJefaturaService
            .misExpedientes(mes, "", 1, 100)
            .then((value) => {
                if (active) setRows(value.items);
            })
            .catch(() => {
                if (active) setRows([]);
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
    }, [enabled, mes]);
    return { rows, busy };
};

type DetailProps = { concept: BonoDescuentoConcepto; filters: BonosDescuentosFiltros; onClose: () => void };
const ConceptDetail = (props: DetailProps) => <GenericConceptDetail {...props} />;
const GenericConceptDetail = ({ concept, filters, onClose }: DetailProps) => {
    const [expediente, setExpediente] = useState<number | null>(null);
    const [page, setPage] = useState(1),
        [size, setSize] = useState(20);
    const [refresh, setRefresh] = useState(0);
    const { data, busy, error } = useDashboardConsulta(
        () => bonosDescuentosService.detail({ ...filters, concepto: concept.codigo, pagina: page, tamano: size }),
        [concept.codigo, filters.mes, filters.vista, filters.estado, filters.desde, filters.hasta, filters.criterio, page, size],
        refresh,
    );
    return (
        <CompensacionSurface title={`Detalle: ${concept.concepto}`} onClose={onClose}>
            <div className="flex flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title={<>{concept.concepto}</>} onClose={onClose}>
                    <div>
                        <p className="mt-1 text-xs text-tertiary">
                            {filters.mes} · {filters.vista === "LIQUIDADO" ? "Liquidado" : "Seguimiento"}
                        </p>
                    </div>
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                    <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => setRefresh((value) => value + 1)}>
                        Actualizar Detalle
                    </Button>
                    {busy && data && (
                        <p role="status" className="mt-2 text-xs text-tertiary">
                            Actualizando detalle…
                        </p>
                    )}
                    <div className="mt-3 min-w-0 [&_table]:min-w-[780px] [&_td]:text-xs">
                        <DataTable
                            density="compact"
                            wrapText
                            columns={
                                concept.codigo === "BONO_COLABORADOR_MES" ? detailColumns : detailColumns.filter((column) => column.key !== "concepto_origen")
                            }
                            data={data?.items ?? []}
                            isLoading={busy && !data}
                            page={page}
                            pageSize={size}
                            totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / size))}
                            onPageChange={setPage}
                            onPageSizeChange={(value) => {
                                setSize(value);
                                setPage(1);
                            }}
                            emptyMessage={error ? "Detalle no disponible" : "Sin registros de este concepto"}
                            renderActions={(row) => {
                                const id = concept.tipo === "DESCUENTO" || concept.codigo === "COMISION_AUDITORIA_ACTIVA" ? expedienteIdFromKey(row.id) : null;
                                return id ? (
                                    <ButtonUtility
                                        icon={Eye}
                                        size="xs"
                                        color="tertiary"
                                        tooltip="Ver expediente y descargo"
                                        className={compensationTableActionClass}
                                        onClick={() => setExpediente(id)}
                                    />
                                ) : null;
                            }}
                        />
                    </div>

                    {expediente && (
                        <HallazgoExpedienteDialog id={expediente} onClose={() => setExpediente(null)} onChanged={() => setRefresh((value) => value + 1)} />
                    )}
                </div>
            </div>
        </CompensacionSurface>
    );
};

export const BonosDescuentosContent = ({
    dashboard = false,
    conceptoUrl = "",
    headingActions,
}: {
    dashboard?: boolean;
    conceptoUrl?: string;
    headingActions?: ReactNode;
}) => {
    const { isStoreManager, isPagos } = useCompensacionPerfil();
    const montos = useMontosReferencia(isPagos);
    const [filters, setFilters] = useState<BonosDescuentosFiltros>(() => ({
        ...initialFilters(),
        concepto: dashboardConcepto(conceptoUrl),
        criterio: dashboardCriterio(conceptoUrl),
    }));
    const [refresh, setRefresh] = useState(0);
    const [detail, setDetail] = useState<BonoDescuentoConcepto | null>(null);
    const [tipoUi, setTipoUi] = useState<CompensacionTipo | "">("");
    useEffect(() => {
        setDetail(null);
        setTipoUi("");
        setFilters((old) => ({ ...old, concepto: dashboardConcepto(conceptoUrl), criterio: dashboardCriterio(conceptoUrl), tipo: "", pagina: 1 }));
    }, [conceptoUrl]);
    const [recordPage, setRecordPage] = useState(1);
    const [ficha, setFicha] = useState<Record<string, unknown> | null>(null);
    useEffect(() => {
        setRecordPage(1);
    }, [tipoUi, filters.mes, filters.vista, filters.estado, filters.desde, filters.hasta, filters.criterio, filters.concepto, filters.tamano]);
    const { data, busy, error } = useDashboardConsulta(
        () =>
            dashboard
                ? // Dashboard: totales, avisos y registros salen de UNA consulta (SQL138) con un único cálculo del motor.
                  bonosDescuentosService
                      .dashboard({ ...filters, pagina: recordPage }, tipoUi)
                      .then(({ items, total, total_paginas, ...summary }): DashboardData => ({
                          ...summary,
                          items: [],
                          total: 0,
                          registros: { items, total, total_paginas, disponible: summary.disponible },
                      }))
                : bonosDescuentosService.list(filters),
        [
            dashboard,
            tipoUi,
            recordPage,
            filters.mes,
            filters.vista,
            filters.tipo,
            filters.concepto,
            filters.estado,
            filters.desde,
            filters.hasta,
            filters.criterio,
            filters.pagina,
            filters.tamano,
        ],
        refresh,
    );
    const change = (patch: Partial<BonosDescuentosFiltros>) => {
        setDetail(null);
        setFilters((old) => ({ ...old, ...patch, pagina: 1 }));
    };
    const valid = data?.disponible === true;
    // El Dashboard es una sola lista de registros (Bono / Penalidad); la vista de conceptos agrupados queda para Mis Bonos.
    const breakdownMode = dashboard;
    const flat = useMemo(
        () => ({
            rows: ((data as DashboardData | null)?.registros?.items ?? []).map((item): Record<string, unknown> => ({
                ...item,
                id_origen: item.id,
                estado_dominio: "seguimiento",
            })),
            totalPages: Math.max(1, Number((data as DashboardData | null)?.registros?.total_paginas) || 1),
        }),
        [data],
    );
    const observaciones = useObservaciones(breakdownMode && isStoreManager && filters.vista === "SEGUIMIENTO", filters.mes);
    const records = useMemo(() => {
        // Las observaciones del Jefe (importe pendiente) se muestran en la primera página junto a los registros del servidor.
        if (recordPage > 1) return flat.rows;
        const known = new Set(flat.rows.map((row) => expedienteIdFromKey(row.id_origen)).filter(Boolean));
        const extra = observaciones.rows
            .filter((row) => !known.has(Number(row.id)))
            .filter((row) => !tipoUi || compensacionTipo(row.tipo) === tipoUi)
            .filter(() => !filters.concepto && !filters.estado)
            .filter((row) => !filters.desde || !row.fecha || String(row.fecha).slice(0, 10) >= filters.desde)
            .filter((row) => !filters.hasta || !row.fecha || String(row.fecha).slice(0, 10) <= filters.hasta)
            .map((row) => ({
                id: `OBSERVACION:${String(row.id)}`,
                concepto_nombre: row.concepto,
                tipo: row.tipo,
                fecha: row.fecha,
                descripcion: row.origen,
                estado: row.estado,
                estado_dominio: "registro",
                importe: row.importe,
                destino: compensacionTipo(row.tipo) === "PENALIDAD" ? destinoIncidencias : destinoAuditoria,
            }));
        return [...flat.rows, ...extra].sort((a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")));
    }, [flat.rows, recordPage, observaciones.rows, tipoUi, filters.concepto, filters.estado, filters.desde, filters.hasta]);
    const recordColumns: ColumnDef[] = [
        { key: "fecha", header: "Fecha", render: (value) => (value ? <CompensacionFechaCell value={String(value)} /> : "—") },
        {
            key: "concepto_nombre",
            header: "Concepto",
            width: "26%",
            render: (value, row) => (
                <span title={ayudaConMonto(ayudaDeConcepto(origenDeConcepto(row.concepto_codigo)), montos[String(row.concepto_codigo)])}>
                    <NombreCell value={value} />
                </span>
            ),
        },
        { key: "tipo", header: "Tipo", render: (value) => <StatusBadge>{compensacionTipoLabel(value)}</StatusBadge> },
        { key: "origen", header: "Origen", render: (_value, row) => destinoDeFila(row)?.modulo ?? "—" },
        { key: "descripcion", header: "Detalle", render: (value) => <NotasCell value={value} /> },
        {
            key: "estado",
            header: "Estado",
            render: (value, row) => (
                <CompensacionEstado
                    dominio="dashboard"
                    valor={grupoDeEstado(value, row.pendiente as boolean | null | undefined)}
                    detalle={
                        estadoVisual(
                            row.estado_dominio === "registro" ? "registro" : row.estado_dominio === "elegibilidad" ? "elegibilidad" : "seguimiento",
                            value,
                        ).label
                    }
                />
            ),
        },
        {
            key: "importe",
            header: "Monto",
            align: "right",
            render: (value, row) => {
                if (value == null) return <span className="text-tertiary">Pendiente</span>;
                const penalty = compensacionTipo(row.tipo) === "PENALIDAD";
                // La primera falta de Uniforme o Indisciplina del mes no descuenta. En los demás perfiles además quita el bono de
                // Puntualidad; Marketing no tiene ese bono (Esquema 12).
                if (penalty && Number(value) === 0 && /_(UNIFORME|INDISCIPLINA)$/.test(String(row.concepto_codigo ?? ""))) {
                    const marketing = String(row.concepto_codigo).startsWith("MKT_");
                    return (
                        <span
                            className="whitespace-nowrap text-tertiary"
                            title={
                                marketing ? "Primera falta del mes: no descuenta" : "Primera falta del mes: no descuenta, pero pierde el bono de Puntualidad"
                            }
                        >
                            {marketing ? "Sin Descuento" : "Pierde Puntualidad"}
                        </span>
                    );
                }
                return (
                    <span className={`whitespace-nowrap tabular-nums ${penalty ? "text-error-primary" : "text-success-primary"}`}>
                        {penalty ? "−" : "+"}
                        {money(Math.abs(Number(value)))}
                    </span>
                );
            },
        },
        {
            key: "acciones",
            header: "Acciones",
            // El Dashboard es informativo: editar o cambiar de estado se hace en la opción de origen.
            render: (_value, row) => {
                const etiqueta = compensacionTipo(row.tipo) === "PENALIDAD" ? "Ver detalle de la penalidad" : "Ver detalle del bono";
                return (
                    <ButtonUtility
                        icon={Eye}
                        size="xs"
                        color="tertiary"
                        tooltip={etiqueta}
                        aria-label={etiqueta}
                        className={compensationTableActionClass}
                        onClick={() => setFicha({ ...row, estado_grupo: grupoDeEstado(row.estado, row.pendiente as boolean | null | undefined) })}
                    />
                );
            },
        },
    ];
    // El Dashboard excluye sueldo: una jornada faltante para prorratearlo no
    // invalida las comisiones ni los bonos calculados desde sus propias fuentes.
    // Los eventos pendientes ya se cuentan en "Registros Pendientes" y no se suman: no ocultan los montos habilitados.
    const ignoradasDashboard = ["ASISTENCIA_INCOMPLETA", "EVENTO_PENDIENTE"];
    const warnings = (data?.advertencias ?? []).filter((item) => !dashboard || !ignoradasDashboard.includes(item.codigo));
    const incomplete = warnings.length > 0;
    // The RPC may repeat a source warning in both aviso and advertencias.
    const normalizeNotice = (value: string) =>
        value
            .toLocaleLowerCase("es-PE")
            .replace(/[\s.;:]+/g, " ")
            .trim();
    const notices = [...warnings.map((item) => item.mensaje), data?.advertencias?.length || (dashboard && valid) ? "" : (data?.aviso ?? "")]
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((value, index, all) => !all.slice(0, index).some((previous) => normalizeNotice(previous) === normalizeNotice(value)));
    const columns: ColumnDef[] = [
        ...(dashboard ? [{ key: "periodo", header: "Periodo", render: () => filters.mes }] : []),
        { key: "concepto", header: "Concepto", width: "38%" },
        {
            key: "tipo",
            header: "Tipo",
            render: (value) => <StatusBadge>{compensacionTipoLabel(value)}</StatusBadge>,
        },
        {
            key: "cantidad",
            header: "Cantidad",
            align: "right",
            render: (value) => String(value ?? "—"),
        },
        { key: "pendientes", header: "Pendientes", align: "right" },
        ...(dashboard
            ? [
                  {
                      key: "estado_agregado",
                      header: "Estado",
                      render: (_value: unknown, row: Record<string, unknown>) => {
                          const pending = Number(row.pendientes) > 0;
                          const enabled = Number(row.cantidad) > 0 && row.importe != null;
                          const settled = filters.vista === "LIQUIDADO" || data?.seguimiento_consolidado;
                          const summaryState = incomplete
                              ? "EN_REVISION"
                              : pending
                                ? "PENDIENTE"
                                : settled
                                  ? (data?.estado_liquidacion ?? "LIQUIDADO")
                                  : "HABILITADO";
                          return incomplete || pending || enabled ? (
                              <CompensacionEstado
                                  dominio="seguimiento"
                                  valor={summaryState}
                                  detalle={pending && enabled ? "Monto parcialmente habilitado; quedan registros pendientes de evaluación." : undefined}
                              />
                          ) : (
                              <StatusBadge>Sin Movimientos</StatusBadge>
                          );
                      },
                  },
              ]
            : []),
        {
            key: "importe",
            align: "right",
            header:
                dashboard && data?.seguimiento_consolidado ? "Monto consolidado" : dashboard && filters.vista === "SEGUIMIENTO" ? "Monto habilitado" : "Monto",
            render: (value) => (
                <span className={`whitespace-nowrap tabular-nums ${value == null ? "text-tertiary" : "text-secondary"}`}>
                    {dashboard && incomplete && Number(value) === 0 && value != null ? "Por Revisar" : money(value)}
                </span>
            ),
        },
        {
            key: "detalle",
            header: "Detalle",
            render: (_value, row) => (
                <ButtonUtility
                    icon={Eye}
                    size="xs"
                    color="tertiary"
                    tooltip={`Ver detalle de ${String(row.concepto)}`}
                    aria-label={`Ver detalle de ${String(row.concepto)}`}
                    className={compensationTableActionClass}
                    onClick={() => setDetail(row as BonoDescuentoConcepto)}
                />
            ),
        },
    ];
    const kpis = dashboard
        ? [
              { title: "Registros Pendientes", value: data?.kpis.pendientes, color: "text-warning-primary", count: true },
              {
                  title: "Bonos",
                  value: data?.kpis.bonos == null || data?.kpis.comisiones == null ? null : data.kpis.bonos + data.kpis.comisiones,
                  color: "text-success-primary",
              },
              { title: "Penalidades Confirmadas", value: data?.kpis.descuentos, color: "text-error-primary" },
          ]
        : [
              {
                  title: "Bonos",
                  value: data?.kpis.bonos == null || data?.kpis.comisiones == null ? null : data.kpis.bonos + data.kpis.comisiones,
                  color: "text-success-primary",
              },
              { title: "Penalidades", value: data?.kpis.descuentos, color: "text-error-primary" },
              { title: "Neto", value: data?.kpis.neto, color: "text-primary" },
              { title: "Pendientes", value: data?.kpis.pendientes, color: "text-warning-primary", count: true },
          ];
    return (
        <div className="min-w-0 space-y-4 [&_td]:text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <CompensacionHeading section="resumen" title="Mis Bonos y Penalidades" />
                <div className="flex flex-wrap items-center gap-2">{headingActions}</div>
            </div>
            {!dashboard && data?.cargo_actual && (
                <p className="text-xs text-tertiary">
                    Cargo Vigente: <span className="font-medium text-primary">{data.cargo_actual.nombre}</span> · Resultados personales según las asignaciones
                    del periodo.
                </p>
            )}
            <div className={dashboard ? "grid grid-cols-1 gap-3 sm:grid-cols-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"}>
                {kpis.map((item) => (
                    <CompensacionPanel
                        key={item.title}
                        title={item.title}
                        trailing={
                            item.count ? (
                                <Clock aria-hidden="true" className="size-4 text-warning-primary" />
                            ) : (
                                <Coins01 aria-hidden="true" className={`size-4 ${item.color}`} />
                            )
                        }
                    >
                        <p className={`text-display-xs font-semibold tabular-nums ${item.color}`}>
                            {valid ? (item.count ? item.value : item.value == null || (dashboard && incomplete) ? "—" : money(item.value)) : "—"}
                        </p>
                        <p className="mt-1 text-xs text-tertiary">
                            {item.count
                                ? "Sin incluir en los montos"
                                : valid && dashboard && incomplete
                                  ? "Por revisar: una fuente aprobada está en revisión"
                                  : filters.vista === "LIQUIDADO"
                                    ? "Liquidación oficial del periodo"
                                    : "Monto habilitado del periodo"}
                        </p>
                    </CompensacionPanel>
                ))}
            </div>
            {!dashboard && (
                <>
                    <p className="text-xs text-tertiary">
                        {filters.vista === "LIQUIDADO"
                            ? "Liquidado muestra la liquidación oficial; no acredita que ya se haya pagado."
                            : "Muestra los montos habilitados del mes. Los registros pendientes no se suman."}{" "}
                        El neto es bonos y comisiones menos penalidades.
                    </p>
                    <details className="text-xs text-tertiary">
                        <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-brand">Cómo Leer el Resumen</summary>
                        <p className="mt-2">Parcial combina montos habilitados y registros pendientes. El detalle muestra el estado de cada registro.</p>
                        <p className="mt-1">
                            Los filtros afectan la tabla, los KPI y el detalle. Los conceptos sin fecha diaria se consultan con el mes completo.
                        </p>
                    </details>
                </>
            )}
            {filters.concepto === "BONO_COLABORADOR_MES" && (
                <p className="text-xs text-tertiary">
                    Consulta el premio por Atenciones o Calificaciones. La ausencia de registros no confirma que hayas perdido el bono.
                </p>
            )}
            {filters.vista === "SEGUIMIENTO" && filters.concepto === "BONO_COLABORADOR_MES" && filters.criterio !== "CALIFICACIONES" && (
                <PancakeFuenteEstado mes={filters.mes} />
            )}
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            {!error && notices.length > 0 && <AlertMessage tone="notice">{notices.join("; ")}</AlertMessage>}
            {dashboard && filters.concepto === dashboardConcepto(conceptoUrl) && dashboardConceptoNotice(conceptoUrl) && !error && (
                <AlertMessage tone="notice">{dashboardConceptoNotice(conceptoUrl)}</AlertMessage>
            )}
            {busy && data && (
                <p role="status" className="text-xs text-tertiary">
                    Actualizando resumen…
                </p>
            )}
            {error && data && (
                <p className="text-xs text-tertiary">Se conserva la última consulta completada de este periodo. Los datos pueden estar desactualizados.</p>
            )}
            <div className="min-w-0 [&_table]:min-w-[700px]">
                <DataTable
                    density="compact"
                    wrapText
                    columns={breakdownMode ? recordColumns : columns}
                    data={
                        breakdownMode
                            ? records
                            : valid
                              ? data.items
                                    .filter((row) => tipoUi !== "BONO" || compensacionTipo(row.tipo) === "BONO")
                                    .map((row) => ({ ...row, id: row.codigo }))
                              : []
                    }
                    isLoading={breakdownMode ? busy || observaciones.busy : busy && !data}
                    page={breakdownMode ? recordPage : filters.pagina}
                    pageSize={filters.tamano}
                    totalPages={breakdownMode ? flat.totalPages : Math.max(1, Math.ceil((valid ? data.total : 0) / filters.tamano))}
                    onPageChange={(pagina) => (breakdownMode ? setRecordPage(pagina) : setFilters((old) => ({ ...old, pagina })))}
                    onPageSizeChange={(tamano) => change({ tamano })}
                    emptyMessage={
                        error
                            ? "Resumen no disponible"
                            : breakdownMode
                              ? "Sin bonos ni penalidades para los filtros seleccionados"
                              : "Sin conceptos para los filtros seleccionados"
                    }
                    toolbar={
                        <CompensacionFiltros toolbar>
                            <div className="flex flex-wrap items-end gap-2">
                                <Dropdown
                                    label="Vista"
                                    hideLabel={dashboard}
                                    value={filters.vista}
                                    items={[{ id: "SEGUIMIENTO", label: "Seguimiento" }]}
                                    onChange={(vista) => change({ vista: vista as BonosDescuentosVista, concepto: "", criterio: "" })}
                                />
                                <Dropdown
                                    label="Tipo"
                                    hideLabel={dashboard}
                                    value={tipoUi}
                                    items={[{ id: "", label: "Todos" }, ...compensacionTipoOptions]}
                                    onChange={(value) => {
                                        const tipo = value as CompensacionTipo | "";
                                        setTipoUi(tipo);
                                        change({ tipo: compensacionTipoServidor(tipo), concepto: "", criterio: "" });
                                    }}
                                />
                                <Dropdown
                                    label="Concepto"
                                    hideLabel={dashboard}
                                    wide
                                    value={filters.concepto}
                                    items={[
                                        { id: "", label: "Todos los conceptos" },
                                        ...(filters.concepto && !data?.conceptos.some((row) => row.codigo === filters.concepto)
                                            ? [{ id: filters.concepto, label: filters.concepto.replaceAll("_", " ") }]
                                            : []),
                                        ...(data?.conceptos ?? []).map((row) => ({ id: row.codigo, label: row.concepto })),
                                    ]}
                                    onChange={(concepto) => change({ concepto, criterio: "" })}
                                />
                                <Dropdown
                                    label="Estado de Origen"
                                    hideLabel={dashboard}
                                    value={filters.estado ?? ""}
                                    items={[
                                        { id: "", label: "Todos" },
                                        ...(dashboard ? opcionesGrupoEstado : opcionesEstado("seguimiento", ["PENDIENTE", ...Object.keys(detailStates)])),
                                    ]}
                                    onChange={(estado) => change({ estado })}
                                />
                                <CompensacionDatePicker hideLabel label="Desde" value={filters.desde ?? ""} onChange={(desde) => change({ desde })} />
                                <CompensacionDatePicker hideLabel label="Hasta" value={filters.hasta ?? ""} onChange={(hasta) => change({ hasta })} />
                                <MonthPicker
                                    hideLabel
                                    label="Periodo"
                                    value={filters.mes}
                                    allowAllMonths={false}
                                    onChange={(mes) => change({ mes, ...dashboardLimites(mes) })}
                                />
                                {filters.concepto === "BONO_COLABORADOR_MES" && (
                                    <Dropdown
                                        label="Criterio"
                                        value={filters.criterio ?? ""}
                                        items={[
                                            { id: "", label: "Ambos" },
                                            { id: "ATENCIONES", label: "Atenciones" },
                                            { id: "CALIFICACIONES", label: "Calificaciones" },
                                        ]}
                                        onChange={(criterio) => change({ criterio: criterio as BonosDescuentosFiltros["criterio"] })}
                                    />
                                )}
                                <Button
                                    size="sm"
                                    color="secondary"
                                    iconLeading={XClose}
                                    onClick={() => {
                                        setDetail(null);
                                        setTipoUi("");
                                        setFilters(initialFilters());
                                        setRefresh((v) => v + 1);
                                    }}
                                >
                                    Limpiar
                                </Button>
                                {!dashboard && (
                                    <Button
                                        size="sm"
                                        color="primary"
                                        iconLeading={RefreshCw01}
                                        onClick={() => {
                                            setDetail(null);
                                            setRefresh((v) => v + 1);
                                        }}
                                    >
                                        Actualizar
                                    </Button>
                                )}
                            </div>
                        </CompensacionFiltros>
                    }
                />
            </div>
            {detail && <ConceptDetail concept={detail} filters={filters} onClose={() => setDetail(null)} />}
            {ficha && <RegistroFormularioDialog row={ficha} destino={destinoDeFila(ficha)} onClose={() => setFicha(null)} />}
        </div>
    );
};

/** UI gate complements the RPC's own ATC authorization; no collaborator selector exists. */
export const BonosDescuentosPage = withAlertProvider(() => {
    const { isAdvisor, isFacturacion, isStoreManager, isPagos, isResolving } = useCompensacionPerfil();
    return (
        <AppLayout>
            {isResolving ? (
                <p role="status" className="text-sm text-tertiary">
                    Verificando acceso…
                </p>
            ) : isAdvisor || isFacturacion || isStoreManager || isPagos ? (
                <BonosDescuentosContent />
            ) : (
                <AlertMessage tone="notice">{"Esta consulta está disponible para tu perfil de Atención al Cliente."}</AlertMessage>
            )}
        </AppLayout>
    );
});
