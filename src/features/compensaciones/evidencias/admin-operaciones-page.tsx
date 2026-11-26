import { useEffect, useRef, useState } from "react";
import { Eye } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import type { ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { IncidenciaDetailModal } from "../incidencias/incidencia-detail-modal";
import { IncidenciaPopup } from "../incidencias/incidencia-popup";
import { incidenciasService } from "../incidencias/incidencias.service";
import type { IncidenciaCatalogo, IncidenciaEvento } from "../incidencias/incidencias.types";
import { MarketingReviewDialog } from "../marketing/marketing-review-dialog";
import { type MarketingCaso, marketingService } from "../marketing/marketing.service";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { type AdminOperacion, type AdminOperacionGrupo, type AdminOperaciones, adminOperacionesService } from "./admin-operaciones.service";
import { EvidenciaDetailModal } from "./evidencia-detail-modal";
import type { EvidenciaEvento } from "./evidencias.types";
import type { FacturacionReporte } from "./facturacion-auditoria.service";
import { FacturacionRevisionDialog } from "./facturacion-revision-dialog";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const tipoItems = [
    { id: "", label: "Todos Bonos y Penalidades" },
    { id: "BONO", label: "Bonos" },
    { id: "PENALIDAD", label: "Penalidades" },
];
const perfilItems = [
    { id: "", label: "Todos los perfiles" },
    { id: "ATC", label: "Atención al Cliente" },
    { id: "JEFE", label: "Jefe de Sede" },
    { id: "FACTURACION", label: "Facturación" },
    { id: "PAGOS", label: "Pagos" },
    { id: "MARKETING", label: "Diseño y Marketing" },
];
const estadoItems = [
    { id: "", label: "Todos los estados" },
    { id: "PENDIENTE", label: "Pendiente" },
    { id: "APROBADO", label: "Aprobado" },
    { id: "RECHAZADO", label: "Rechazado" },
    { id: "ANULADO", label: "Anulado" },
];
/** Penalidades de Auditoría Operaciones que registra Administración; las demás tienen su propia opción. */
export const penalidadesOperaciones =
    /^(ATC_(ERROR_DATOS|ERROR_REGISTRO|MAL_FLUJO|PROCESO_AIRE|ABANDONO_CHAT|FRAUDE_DIGITAL)|FAC_ERROR_(SOLUCION|SIN_SOLUCION)|PAG_[A-Z_]+_(RETRASO_VOUCHER|ERROR_PAGO_CRITICO)|JEFE_(ERROR_SUPERVISION|ABANDONO_SOLIDARIO))$/;

/** Indisciplina Colaborador: faltas de todos los cargos, incluidas las del Jefe de Sede. */
export const penalidadesIndisciplina = /(UNIFORME|INDISCIPLINA|QUEJA_TARDIA)$/;
const conceptoItems = [
    { id: "", label: "Todos los conceptos" },
    { id: "UNIFORME", label: "Falta de Uniforme" },
    { id: "INDISCIPLINA", label: "Indisciplina Recurrente" },
    { id: "QUEJA_TARDIA", label: "Queja Tardía" },
];
/** Penalidad Escalonada: Error en Cuadro de Jefe y Pagos; el porcentaje se aplica en Bonos del mes. */
export const penalidadesEscalonada = /ERROR_CUADRO$/;
const perfilEscalonadaItems = perfilItems.filter((item) => ["", "JEFE", "PAGOS"].includes(item.id));
const descargo: Record<string, { tone: "success" | "warning"; label: string }> = {
    PRESENTADO: { tone: "success", label: "Presentado" },
    PENDIENTE: { tone: "warning", label: "Pendiente" },
};

const validacion: Record<string, { tone: "success" | "error" | "warning"; label: string }> = {
    APROBADO: { tone: "success", label: "Conforme" },
    RECHAZADO: { tone: "error", label: "No conforme" },
    SIN_VALIDAR: { tone: "warning", label: "Sin validar" },
};

const columns: ColumnDef[] = [
    {
        key: "tipo",
        header: "Tipo",
        render: (value) => <StatusBadge tone={value === "BONO" ? "success" : "error"}>{value === "BONO" ? "Bono" : "Penalidad"}</StatusBadge>,
    },
    {
        key: "concepto",
        header: "Detalle",
        render: (value, row) => (
            <div className="max-w-64 min-w-0 text-xs">
                <p className="font-medium break-words text-primary">{String(value ?? "—")}</p>
                {row.descripcion ? <p className="line-clamp-2 break-words text-tertiary">{String(row.descripcion)}</p> : null}
            </div>
        ),
    },
    {
        key: "colaborador",
        header: "Colaborador",
        render: (value, row) => (
            <div className="text-xs">
                <NombreCell value={value} />
                {row.cargo ? <p className="text-tertiary">{String(row.cargo)}</p> : null}
            </div>
        ),
    },
    { key: "registrado_por", header: "Registrado por", render: (value) => <NombreCell value={value} /> },
    { key: "fecha_evento", header: "Fecha", render: (value) => <CompensacionFechaCell value={value} /> },
    {
        key: "importe_aprobado",
        header: "Monto",
        align: "right",
        render: (value, row) =>
            value === null || value === undefined ? (
                <span className="text-tertiary">—</span>
            ) : (
                <span className={`whitespace-nowrap tabular-nums ${row.tipo === "PENALIDAD" ? "text-error-primary" : "text-success-primary"}`}>
                    {money.format(Number(value))}
                </span>
            ),
    },
    {
        key: "validacion_jefe",
        header: "Validación Jefe",
        render: (value) => {
            const visual = validacion[String(value ?? "")];
            return visual ? <StatusBadge tone={visual.tone}>{visual.label}</StatusBadge> : <span className="text-tertiary">—</span>;
        },
    },
    { key: "estado_evento", header: "Estado", render: (value) => <CompensacionEstado dominio="registro" valor={value} /> },
];

const columnasIndisciplina: ColumnDef[] = [
    ...columns.filter((column) => ["concepto", "colaborador"].includes(column.key)),
    { key: "sede", header: "Sede", render: (value) => (value ? <StatusBadge>{String(value)}</StatusBadge> : <span className="text-tertiary">—</span>) },
    ...columns.filter((column) => ["registrado_por", "fecha_evento", "importe_aprobado"].includes(column.key)),
    {
        key: "descargo",
        header: "Descargo",
        render: (value) => {
            const visual = descargo[String(value ?? "")];
            return visual ? <StatusBadge tone={visual.tone}>{visual.label}</StatusBadge> : <span className="text-tertiary">No requiere</span>;
        },
    },
    ...columns.filter((column) => column.key === "estado_evento"),
];

const columnasEscalonada = columnasIndisciplina.filter((column) => column.key !== "importe_aprobado");

const opciones: Record<AdminOperacionGrupo, { title: string; columns: ColumnDef[]; penalidades: RegExp; empty: string }> = {
    OPERACIONES: { title: "Auditoría Operaciones", columns, penalidades: penalidadesOperaciones, empty: "Sin registros de auditoría" },
    INDISCIPLINA: {
        title: "Indisciplina Colaborador",
        columns: columnasIndisciplina,
        penalidades: penalidadesIndisciplina,
        empty: "Sin faltas registradas",
    },
    ESCALONADA: {
        title: "Penalidad Escalonada Bonos",
        columns: columnasEscalonada,
        penalidades: penalidadesEscalonada,
        empty: "Sin errores en cuadro registrados",
    },
};

type Detalle =
    | { kind: "incidencia"; item: IncidenciaEvento }
    | { kind: "evidencia"; item: EvidenciaEvento; readOnly: boolean }
    | { kind: "facturacion"; item: FacturacionReporte }
    | { kind: "alerta"; item: MarketingCaso; mode: "revision" | "anulacion" };

const errorText = (cause: unknown) => (cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo completar la solicitud");

/**
 * Auditoría Operaciones, Indisciplina Colaborador y Penalidad Escalonada del Administrador (Esquema 12): lo de todos los perfiles en una tabla,
 * con su revisión, y el registro de las penalidades propias de cada opción.
 */
export const AdminOperacionesPage = withAlertProvider<{ grupo?: AdminOperacionGrupo }>(({ grupo: elegido }) => {
    const grupo: AdminOperacionGrupo = elegido ?? "OPERACIONES";
    const { userId } = useCompensacionPerfil();
    return (
        <AppLayout>
            <Content key={`${userId}:${grupo}`} grupo={grupo} />
        </AppLayout>
    );
});

const Content = ({ grupo }: { grupo: AdminOperacionGrupo }) => {
    const opcion = opciones[grupo];
    const indisciplina = grupo === "INDISCIPLINA";
    const escalonada = grupo === "ESCALONADA";
    const notify = useAlert();
    const [filtros, setFiltros] = useState({ grupo, tipo: "", concepto: "", perfil: "", estado: "", busqueda: "", pagina: 1, tamano: 20 });
    const [busqueda, setBusqueda] = useState("");
    const [data, setData] = useState<AdminOperaciones | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [detalle, setDetalle] = useState<Detalle | null>(null);
    const [catalogo, setCatalogo] = useState<IncidenciaCatalogo | null>(null);
    const [formKey, setFormKey] = useState(0);
    const [decision, setDecision] = useState("APROBADO");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const opening = useRef(false);

    useEffect(() => {
        incidenciasService
            .getCatalog()
            .then((result) => setCatalogo({ ...result, tipos: result.tipos.filter((tipo) => tipo.codigo === "REPORTE_PENALIDAD") }))
            .catch((cause) => setError(errorText(cause)));
    }, []);
    useEffect(() => {
        if (busqueda === filtros.busqueda) return;
        const timer = setTimeout(() => setFiltros((value) => ({ ...value, busqueda, pagina: 1 })), 350);
        return () => clearTimeout(timer);
    }, [busqueda, filtros.busqueda]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        adminOperacionesService
            .list(filtros)
            .then((result) => {
                if (active) setData(result);
            })
            .catch((cause) => {
                if (!active) return;
                setData(null);
                setError(errorText(cause));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filtros, refresh]);

    const recargar = () => setRefresh((value) => value + 1);
    const cerrar = () => {
        setDetalle(null);
        recargar();
    };
    const filtrar = (key: "tipo" | "concepto" | "perfil" | "estado", value: string) => setFiltros((current) => ({ ...current, [key]: value, pagina: 1 }));

    const abrir = async (row: AdminOperacion) => {
        if (opening.current) return;
        opening.current = true;
        try {
            if (row.origen === "INCIDENCIA") setDetalle({ kind: "incidencia", item: await adminOperacionesService.incidencia(row.id) });
            else if (row.origen === "FACTURACION") setDetalle({ kind: "facturacion", item: await adminOperacionesService.facturacion(row) });
            else if (row.origen === "ALERTA") {
                const caso = await adminOperacionesService.alerta(row);
                const mode = caso.estado === "PENDIENTE" && caso.puede_revisar ? "revision" : caso.puede_anular ? "anulacion" : null;
                if (mode) {
                    setDecision(mode === "anulacion" ? "ANULADO" : "APROBADO");
                    setReason("");
                    setDetalle({ kind: "alerta", item: caso, mode });
                } else {
                    setDetalle({ kind: "evidencia", item: await adminOperacionesService.evidencia(row.id), readOnly: true });
                    if (caso.estado === "PENDIENTE" && caso.validacion !== "APROBADO")
                        notify("notice", "La alerta se aprueba o rechaza después de la validación conforme del Jefe de Tienda.");
                }
            } else setDetalle({ kind: "evidencia", item: await adminOperacionesService.evidencia(row.id), readOnly: false });
        } catch (cause) {
            notify("error", errorText(cause));
        } finally {
            opening.current = false;
        }
    };
    const revisarAlerta = async () => {
        if (detalle?.kind !== "alerta" || saving) return;
        setSaving(true);
        try {
            await marketingService.review(detalle.item.id, detalle.mode === "anulacion" ? "ANULADO" : decision, reason);
            notify("success", detalle.mode === "anulacion" ? "Registro anulado" : "Revisión guardada");
            cerrar();
        } catch (cause) {
            notify("error", errorText(cause));
        } finally {
            setSaving(false);
        }
    };

    const resumen = data?.resumen;
    return (
        <div className="min-w-0 space-y-5">
            <CompensacionHeading section="evidencias" title={opcion.title} />
            <div className={`grid gap-4 ${grupo === "OPERACIONES" ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                {[
                    ["Registros", data?.total],
                    ["Pendientes", resumen?.pendientes],
                    ["Bonos aprobados", resumen ? money.format(resumen.bonos_aprobados) : undefined],
                    ["Penalidades aprobadas", resumen ? money.format(resumen.penalidades_aprobadas) : undefined],
                    ["Confirmadas", resumen?.penalidades_confirmadas],
                ]
                    .filter(([title]) => {
                        if (escalonada) return title === "Registros" || title === "Pendientes" || title === "Confirmadas";
                        return title !== "Confirmadas" && (!indisciplina || title !== "Bonos aprobados");
                    })
                    .map(([title, value]) => (
                        <CompensacionPanel key={String(title)} title={String(title)}>
                            <p className="text-display-xs font-semibold text-primary tabular-nums">{loading ? "…" : (value ?? "—")}</p>
                        </CompensacionPanel>
                    ))}
            </div>
            {catalogo && (
                <IncidenciaPopup
                    key={formKey}
                    isOpen
                    inline
                    catalog={catalogo}
                    penaltyPattern={opcion.penalidades}
                    onClose={() => undefined}
                    onSave={() => {
                        setFormKey((value) => value + 1);
                        recargar();
                    }}
                />
            )}
            {escalonada && (
                <div className="flex justify-end">
                    <Button href="/compensaciones/bonos-mes" color="link-color" size="sm">
                        Aplicar escalonado en Bonos del mes
                    </Button>
                </div>
            )}
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <DataTable
                density="compact"
                columns={opcion.columns}
                data={(data?.items ?? []) as unknown as Record<string, unknown>[]}
                isLoading={loading}
                page={filtros.pagina}
                pageSize={filtros.tamano}
                totalPages={data?.total_paginas ?? 1}
                onPageChange={(pagina) => setFiltros((value) => ({ ...value, pagina }))}
                onPageSizeChange={(tamano) => setFiltros((value) => ({ ...value, tamano, pagina: 1 }))}
                emptyMessage={opcion.empty}
                renderActions={(row) => (
                    <ButtonUtility
                        icon={Eye}
                        size="xs"
                        color="tertiary"
                        className={compensationTableActionClass}
                        tooltip="Ver y revisar"
                        aria-label="Ver y revisar"
                        onClick={() => void abrir(row as unknown as AdminOperacion)}
                    />
                )}
                toolbar={
                    <div className="flex flex-wrap items-end gap-3">
                        {!escalonada && (
                            <Select
                                aria-label={indisciplina ? "Filtrar por concepto" : "Filtrar por tipo"}
                                size="sm"
                                className="w-60"
                                items={indisciplina ? conceptoItems : tipoItems}
                                selectedKey={indisciplina ? filtros.concepto : filtros.tipo}
                                onSelectionChange={(value) => filtrar(indisciplina ? "concepto" : "tipo", String(value ?? ""))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        )}
                        <Select
                            aria-label="Filtrar por perfil"
                            size="sm"
                            className="w-52"
                            items={escalonada ? perfilEscalonadaItems : perfilItems}
                            selectedKey={filtros.perfil}
                            onSelectionChange={(value) => filtrar("perfil", String(value ?? ""))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        <Select
                            aria-label="Filtrar por estado"
                            size="sm"
                            className="w-48"
                            items={estadoItems}
                            selectedKey={filtros.estado}
                            onSelectionChange={(value) => filtrar("estado", String(value ?? ""))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        <Input
                            aria-label="Buscar colaborador"
                            placeholder="Buscar colaborador"
                            size="sm"
                            className="w-56"
                            value={busqueda}
                            onChange={setBusqueda}
                        />
                    </div>
                }
            />
            <IncidenciaDetailModal item={detalle?.kind === "incidencia" ? detalle.item : null} onClose={() => setDetalle(null)} onChanged={cerrar} />
            <EvidenciaDetailModal
                item={detalle?.kind === "evidencia" ? detalle.item : null}
                readOnly={detalle?.kind === "evidencia" && detalle.readOnly}
                onClose={() => setDetalle(null)}
                onChanged={cerrar}
            />
            {detalle?.kind === "facturacion" && <FacturacionRevisionDialog record={detalle.item} onClose={cerrar} />}
            {detalle?.kind === "alerta" && (
                <MarketingReviewDialog
                    review={detalle.item}
                    mode={detalle.mode}
                    saving={saving}
                    decision={decision}
                    reason={reason}
                    onDecision={setDecision}
                    onReason={setReason}
                    onClose={() => setDetalle(null)}
                    onSave={() => void revisarAlerta()}
                />
            )}
        </div>
    );
};
