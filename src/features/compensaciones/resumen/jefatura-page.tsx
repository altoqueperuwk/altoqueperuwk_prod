import { useEffect, useState } from "react";
import { AlertCircle, Clock, Users03, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { AlertMessage, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { compensationMoney } from "@/features/compensaciones/shared/compensacion-cells";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { supabase } from "@/lib/supabase";
import { fechaLima } from "../evidencias/tarjeta-tercero-form";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";

interface Rule {
    codigo: string;
    monto: number | null;
    porcentaje?: number | null;
    configuracion?: Record<string, unknown>;
}
interface ManagerSummary {
    sede: string;
    estado: string;
    estado_matriz: string | null;
    equipo: number;
    revisiones: number;
    correcciones: number;
    incidencias_propias: number;
    /** Aviso informativo: el Jefe no revisa ni pierde comisiones por estos hechos de su equipo. */
    tolerancia_cero?: { id: number; colaborador: string; fecha: string; estado: "CONFIRMADO" | "EN_REVISION" }[];
    rutas: string[];
    reglas: Rule[];
    penalidades: Rule[];
}
const bonus = "otros-bonos/";
export const jefaturaConcepts = [
    [
        "BONO_INNOVACION",
        "Bono por Aporte e Innovación Operativa (Extra)",
        "Bono",
        `${bonus}propuesta_innovacion`,
        "Propuesta sustentada; aprobación administrativa",
    ],
    [
        "COMISION_REGISTRO_EFECTIVIZACION",
        "Registro Nuevo y Efectivización",
        "Bono",
        "atenciones",
        "Cliente nuevo y primera operación final pagada en siete días",
    ],
    [
        "COMISION_CALIFICACION_PRESENCIAL",
        "Atención Presencial Calificada",
        "Bono",
        "calificaciones",
        "4 o 5 estrellas y operación elegible; sin autorresolución",
    ],
    [
        "COMISION_AUDITORIA_ACTIVA",
        "Comisión de Auditoría Activa (Caza-Errores)",
        "Bono",
        "resumen",
        "Reporte sustentado antes de escalar; revisión independiente",
    ],
    ["COMISION_LLAMADA", "Llamada / Contacto", "Bono", "llamadas", "Llamada contestada y revisión independiente"],
    ["COMISION_REFERIDO", "Referido", "Bono", "referidos", "Operación a tasa de 1%; revisión administrativa"],
    [
        "COMISION_TIKTOK_LIVE",
        "TIKTOK LIVE",
        "Bono",
        `${bonus}tiktok_live`,
        "Cliente, captura, conversión pagada en siete días; solo los clientes que registras tú",
    ],
    ["JEFE_ERROR_SUPERVISION", "Error Supervisión", "Penalidad", "resumen", "Error del equipo que supera el filtro; requiere reporte y revisión"],
    ["JEFE_ABANDONO_SOLIDARIO", "Abandono Chat (Solidario)", "Penalidad", "resumen", "Chat del equipo sin responder por más de 20 minutos; con sustento"],
    ["JEFE_QUEJA_TARDIA", "Queja Tardía / Omisión de Reporte", "Penalidad", "resumen", "Revisión administrativa con evidencia de la omisión"],
    ["JEFE_UNIFORME", "Falta de Uniforme (Jefatura)", "Penalidad", "resumen", "Incidencia diaria confirmada, una vez perdido el bono mensual"],
    ["JEFE_ERROR_CUADRO", "Error en Cuadro de Comisiones", "Penalidad", "resumen", "Errores confirmados y tramo mensual configurado sobre comisiones"],
    ["JEFE_INDISCIPLINA", "Indisciplina Recurrente Activa", "Penalidad", "resumen", "Incidencia sustentada y confirmada, una vez perdido el bono mensual"],
] as const;
export const JefaturaPage = withAlertProvider(() => {
    const [month, setMonth] = useState(() => fechaLima().slice(0, 7));
    const [kind, setKind] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [data, setData] = useState<ManagerSummary | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        setBusy(true);
        setError("");
        setData(null);
        void supabase
            .rpc("f_get_compensacion_jefatura", { p_mes: `${month}-01` })
            .then(({ data: value, error: cause }) => {
                if (!active) return;
                if (cause) {
                    setError(cause.message);
                    return;
                }
                setData(value as ManagerSummary);
            })
            .then(
                () => {
                    if (active) setBusy(false);
                },
                (cause: unknown) => {
                    if (active) {
                        setError(cause instanceof Error ? cause.message : "No se pudo consultar tu sede");
                        setBusy(false);
                    }
                },
            );
        return () => {
            active = false;
        };
    }, [month, refresh]);
    const money = (value: number) => compensationMoney.format(value);
    const rows = jefaturaConcepts
        .filter((row) => !kind || row[2] === kind)
        .map(([id, concepto, tipo, route, flujo]) => {
            const rule = [...(data?.reglas ?? []), ...(data?.penalidades ?? [])].find((rule) => rule.codigo === id);
            const referencia =
                rule?.porcentaje != null
                    ? `${rule.porcentaje}%`
                    : rule?.monto != null && Number(rule.monto) > 0
                      ? money(Number(rule.monto))
                      : "Según configuración";
            return { id, concepto, tipo, flujo, referencia, route: `/compensaciones/${route}` };
        });
    const resetFilters = () => {
        setMonth(fechaLima().slice(0, 7));
        setKind("");
        setRefresh((value) => value + 1);
    };
    const columns: ColumnDef[] = [
        { key: "concepto", header: "Concepto" },
        {
            key: "tipo",
            header: "Tipo",
            render: (value) => <StatusBadge>{String(value)}</StatusBadge>,
        },
        { key: "referencia", header: "Tarifa", align: "right" },
        { key: "flujo", header: "Flujo" },
        {
            key: "route",
            header: "Acciones",
            render: (value) =>
                data?.rutas.includes(String(value)) ? (
                    <Button href={String(value)} size="xs" color="secondary" className="h-6 px-2 py-0 text-xs">
                        Consultar
                    </Button>
                ) : (
                    <span className="text-xs text-tertiary">Sin acceso asignado</span>
                ),
        },
    ];
    return (
        <AppLayout>
            <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CompensacionHeading section="resumen" title="Responsabilidades de Sede" />
                    {data?.sede && <StatusBadge>{data.sede}</StatusBadge>}
                </div>
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                        ["Personal ATC", data?.equipo, Users03],
                        ["Registros Pendientes", data?.revisiones, Clock],
                        ["Mis Incidencias Pendientes", data?.incidencias_propias, AlertCircle],
                    ].map(([label, value, Icon]) => {
                        const MetricIcon = Icon as typeof Clock;
                        return (
                            <CompensacionPanel key={String(label)} title={String(label)} trailing={<MetricIcon className="size-5 text-brand-secondary" />}>
                                <p className="text-display-xs font-semibold text-primary tabular-nums">{busy || error ? "—" : String(value ?? 0)}</p>
                            </CompensacionPanel>
                        );
                    })}
                </div>
                {!busy && !error && (data?.tolerancia_cero?.length ?? 0) > 0 && (
                    <AlertMessage tone="notice">{`Tolerancia cero digital en tu equipo: ${data!
                        .tolerancia_cero!.map(
                            (item) =>
                                `${item.colaborador} (${item.fecha.split("-").reverse().join("/")}, ${item.estado === "CONFIRMADO" ? "confirmado" : "en revisión de Administración"})`,
                        )
                        .join("; ")}; la pérdida corresponde al colaborador y no afecta tus comisiones.`}</AlertMessage>
                )}
                {data?.estado === "SIN_ASIGNACION" && (
                    <AlertMessage tone="notice">
                        {"Ficha laboral pendiente: Administración debe vincular tu ficha y asignación para habilitar registros y cálculos."}
                    </AlertMessage>
                )}
                {data?.estado === "MATRIZ_PENDIENTE" && (
                    <AlertMessage tone="notice">
                        {"Matriz pendiente de publicación: los importes son referencias del borrador; no acreditan bonos ni autorizan un pago."}
                    </AlertMessage>
                )}
                <DataTable
                    density="compact"
                    wrapText
                    columns={columns}
                    data={busy || error ? [] : rows}
                    isLoading={busy}
                    page={1}
                    totalPages={1}
                    pageSize={20}
                    onPageChange={() => {}}
                    onPageSizeChange={() => {}}
                    hidePageSizeSelector
                    emptyMessage={error ? "Consulta no disponible" : "Sin conceptos"}
                    toolbar={
                        <CompensacionFiltros toolbar>
                            <div className="flex flex-wrap items-end gap-2">
                                <MonthPicker hideLabel label="Periodo" value={month} onChange={setMonth} allowAllMonths={false} />
                                <div className="w-full sm:w-44">
                                    <Select
                                        size="sm"
                                        aria-label="Filtrar por tipo"
                                        selectedKey={kind}
                                        items={[{ id: "", label: "Todos" }, ...["Bono", "Penalidad"].map((label) => ({ id: label, label }))]}
                                        onSelectionChange={(value) => setKind(String(value ?? ""))}
                                    >
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>
                                </div>
                                <Button color="secondary" size="sm" iconLeading={XClose} isDisabled={busy} onClick={resetFilters}>
                                    Limpiar
                                </Button>
                            </div>
                        </CompensacionFiltros>
                    }
                />
            </div>
        </AppLayout>
    );
});
