import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Edit03, Plus, RefreshCw01, Settings01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { AppLayout } from "@/components/application/app-layout";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { type ColumnDef, DataTable } from "@/components/shared/data-table";
import { useToast } from "@/providers/toast-provider";
import { type ConfigField, type ConfigValue, ConfiguracionPopup } from "./configuracion-popup";
import { configuracionService } from "./configuracion.service";
import type {
    Acceso,
    Cargo,
    Concepto,
    ConfiguracionCatalogos,
    EventoTipo,
    Jornada,
    MetaSede,
    PenalidadTipo,
    Plan,
    PlanVersion,
    Regla,
    UsuarioAcceso,
} from "./configuracion.types";

type Tab = "PLANES" | "REGLAS" | "CONCEPTOS" | "CARGOS" | "JORNADAS" | "EVENTOS" | "METAS" | "PENALIDADES" | "ACCESOS";
type EditorKind = "PLAN" | "VERSION" | "REGLA" | "CONCEPTO" | "CARGO" | "JORNADA" | "EVENTO" | "META" | "PENALIDAD" | "ACCESO";
interface EditorState {
    kind: EditorKind;
    item: unknown | null;
}
const tabs: { id: Tab; label: string }[] = [
    { id: "PLANES", label: "Planes y versiones" },
    { id: "REGLAS", label: "Reglas" },
    { id: "CONCEPTOS", label: "Conceptos" },
    { id: "CARGOS", label: "Cargos" },
    { id: "JORNADAS", label: "Jornadas" },
    { id: "EVENTOS", label: "Tipos de evidencia" },
    { id: "METAS", label: "Metas por sede" },
    { id: "PENALIDADES", label: "Penalidades" },
    { id: "ACCESOS", label: "Accesos" },
];
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const date = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "UTC" });
const humanize = (value: string) =>
    value
        .toLocaleLowerCase("es-PE")
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const statusColor = (value: string): "success" | "warning" | "error" | "brand" | "gray" =>
    ["ACTIVO", "PUBLICADA"].includes(value) ? "success" : value === "BORRADOR" ? "warning" : ["INACTIVO", "RETIRADA"].includes(value) ? "gray" : "brand";
const toOptions = (items: { id: number; nombre: string }[], empty?: string) => [
    ...(empty ? [{ id: 0, label: empty }] : []),
    ...items.map((item) => ({ id: item.id, label: item.nombre })),
];

export const ConfiguracionPage = () => {
    const { addToast } = useToast();
    const [tab, setTab] = useState<Tab>("PLANES");
    const [plans, setPlans] = useState<Plan[]>([]);
    const [versions, setVersions] = useState<PlanVersion[]>([]);
    const [concepts, setConcepts] = useState<Concepto[]>([]);
    const [cargos, setCargos] = useState<Cargo[]>([]);
    const [jornadas, setJornadas] = useState<Jornada[]>([]);
    const [eventTypes, setEventTypes] = useState<EventoTipo[]>([]);
    const [accesses, setAccesses] = useState<Acceso[]>([]);
    const [accessUsers, setAccessUsers] = useState<UsuarioAcceso[]>([]);
    const [rules, setRules] = useState<Regla[]>([]);
    const [goals, setGoals] = useState<MetaSede[]>([]);
    const [penalties, setPenalties] = useState<PenalidadTipo[]>([]);
    const [catalogs, setCatalogs] = useState<ConfiguracionCatalogos>({ estados: [], sucursales: [] });
    const [versionId, setVersionId] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const selectedVersion = versions.find((item) => item.id === versionId) ?? null;
    const drafts = versions.filter((item) => item.estado === "BORRADOR");
    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [
                planRows,
                versionRows,
                conceptRows,
                cargoRows,
                jornadaRows,
                eventTypeRows,
                accessRows,
                accessUserRows,
                ruleRows,
                goalRows,
                penaltyRows,
                catalogRows,
            ] = await Promise.all([
                configuracionService.getPlans(),
                configuracionService.getVersions(),
                configuracionService.getConcepts(),
                configuracionService.getCargos(),
                configuracionService.getJornadas(),
                configuracionService.getEventTypes(),
                configuracionService.getAccesses(),
                configuracionService.getAccessUsers(),
                configuracionService.getRules(),
                configuracionService.getGoals(),
                configuracionService.getPenalties(),
                configuracionService.getCatalogs(),
            ]);
            setPlans(planRows);
            setVersions(versionRows);
            setConcepts(conceptRows);
            setCargos(cargoRows);
            setJornadas(jornadaRows);
            setEventTypes(eventTypeRows);
            setAccesses(accessRows);
            setAccessUsers(accessUserRows);
            setRules(ruleRows);
            setGoals(goalRows);
            setPenalties(penaltyRows);
            setCatalogs(catalogRows);
            setVersionId((current) => current || versionRows.find((item) => item.estado === "BORRADOR")?.id || versionRows[0]?.id || 0);
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible cargar la configuración");
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);
    useEffect(() => {
        void load();
    }, [load, refreshKey]);
    const changed = () => {
        setEditor(null);
        setRefreshKey((value) => value + 1);
    };
    const save = async (kind: EditorKind, id: number | null, values: Record<string, ConfigValue>) => {
        try {
            if (kind === "PLAN") await configuracionService.savePlan(id, values);
            if (kind === "VERSION") await configuracionService.saveVersion(id, values);
            if (kind === "CONCEPTO") await configuracionService.saveConcept(id, values);
            if (kind === "CARGO") await configuracionService.saveCargo(id, values);
            if (kind === "JORNADA") await configuracionService.saveJornada(id, values);
            if (kind === "EVENTO") await configuracionService.saveEventType(id, values);
            if (kind === "ACCESO") await configuracionService.saveAccess(values);
            if (kind === "REGLA") await configuracionService.saveRule(id, values);
            if (kind === "META") await configuracionService.saveGoal(id, values);
            if (kind === "PENALIDAD") await configuracionService.savePenalty(id, values);
            addToast("success", "Configuración guardada correctamente");
            changed();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible guardar la configuración");
            throw error;
        }
    };
    const publish = async (item: PlanVersion) => {
        try {
            await configuracionService.publishVersion(item.id);
            addToast("success", `Versión ${item.numeroVersion} publicada`);
            changed();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible publicar la versión");
        }
    };

    const states = toOptions(catalogs.estados);
    const branches = toOptions(catalogs.sucursales, "Todas las sedes");
    const cargoOptions = toOptions(cargos, "Todos los cargos");
    const conceptOptions = toOptions(concepts);
    const versionOptions = versions.map((item) => ({ id: item.id, label: `${item.planNombre} · v${item.numeroVersion} · ${humanize(item.estado)}` }));
    const draftOptions = drafts.map((item) => ({ id: item.id, label: `${item.planNombre} · v${item.numeroVersion}` }));
    const editorConfig = useMemo(() => {
        if (!editor) return null;
        const item = editor.item as Record<string, unknown> | null;
        const id = item ? Number(item.id) : null;
        const stateDefault = catalogs.estados.find((entry) => entry.nombre.toUpperCase() === "ACTIVO")?.id ?? 0;
        const commonState: ConfigField = { key: "idEstado", label: "Estado", type: "select", required: true, items: states };
        if (editor.kind === "PLAN")
            return {
                id,
                title: id ? "Editar plan" : "Nuevo plan",
                description: "Agrupa una matriz de compensación y todas sus versiones.",
                fields: [
                    { key: "codigo", label: "Código", required: true },
                    { key: "nombre", label: "Nombre", required: true },
                    { key: "descripcion", label: "Descripción", type: "textarea" },
                    commonState,
                ],
                values: {
                    codigo: (item?.codigo as string) ?? "",
                    nombre: (item?.nombre as string) ?? "",
                    descripcion: (item?.descripcion as string) ?? "",
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        if (editor.kind === "VERSION")
            return {
                id,
                title: id ? "Editar versión" : "Nueva versión",
                description: "Las reglas, metas y penalidades se editan únicamente mientras esté en borrador.",
                fields: [
                    { key: "idPlan", label: "Plan", type: "select", required: true, disabled: Boolean(id), items: toOptions(plans) },
                    { key: "nombre", label: "Nombre de versión" },
                    { key: "fechaInicio", label: "Inicio de vigencia", type: "date", required: true },
                    { key: "fechaFin", label: "Fin de vigencia", type: "date" },
                    { key: "observacion", label: "Observación", type: "textarea" },
                ],
                values: {
                    idPlan: (item?.idPlan as number) ?? plans[0]?.id ?? 0,
                    nombre: (item?.nombre as string) ?? "",
                    fechaInicio: String(item?.fechaInicio ?? "").slice(0, 10),
                    fechaFin: String(item?.fechaFin ?? "").slice(0, 10),
                    observacion: (item?.observacion as string) ?? "",
                },
            };
        if (editor.kind === "CONCEPTO")
            return {
                id,
                title: id ? "Editar concepto" : "Nuevo concepto",
                description: "Define la identidad y el tratamiento económico del concepto.",
                fields: [
                    { key: "codigo", label: "Código", required: true },
                    { key: "nombre", label: "Nombre", required: true },
                    {
                        key: "categoria",
                        label: "Categoría",
                        type: "select",
                        required: true,
                        items: ["SUELDO", "BONO", "COMISION", "PENALIDAD", "DESCUENTO", "INFORMATIVO"].map((x) => ({
                            id: x,
                            label: humanize(x),
                        })),
                    },
                    {
                        key: "naturaleza",
                        label: "Naturaleza",
                        type: "select",
                        required: true,
                        items: ["INGRESO", "DESCUENTO", "INFORMATIVO"].map((x) => ({ id: x, label: humanize(x) })),
                    },
                    {
                        key: "unidad",
                        label: "Unidad",
                        type: "select",
                        required: true,
                        items: ["MONTO", "PORCENTAJE", "MINUTO", "HORA", "DIA", "UNIDAD", "PUNTO"].map((x) => ({ id: x, label: humanize(x) })),
                    },
                    { key: "orden", label: "Orden", type: "number" },
                    {
                        key: "requiereEvidencia",
                        label: "Requiere evidencia",
                        type: "select",
                        items: [
                            { id: "SI", label: "Sí" },
                            { id: "NO", label: "No" },
                        ],
                    },
                    {
                        key: "requiereAprobacion",
                        label: "Requiere aprobación",
                        type: "select",
                        items: [
                            { id: "SI", label: "Sí" },
                            { id: "NO", label: "No" },
                        ],
                    },
                    {
                        key: "permiteExcepcion",
                        label: "Permite excepción",
                        type: "select",
                        items: [
                            { id: "SI", label: "Sí" },
                            { id: "NO", label: "No" },
                        ],
                    },
                    commonState,
                ],
                values: {
                    codigo: (item?.codigo as string) ?? "",
                    nombre: (item?.nombre as string) ?? "",
                    categoria: (item?.categoria as string) ?? "BONO",
                    naturaleza: (item?.naturaleza as string) ?? "INGRESO",
                    unidad: (item?.unidad as string) ?? "MONTO",
                    orden: (item?.orden as number) ?? 0,
                    requiereEvidencia: item?.requiereEvidencia ? "SI" : "NO",
                    requiereAprobacion: item?.requiereAprobacion ? "SI" : "NO",
                    permiteExcepcion: item ? (item.permiteExcepcion ? "SI" : "NO") : "SI",
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        if (editor.kind === "CARGO")
            return {
                id,
                title: id ? "Editar cargo" : "Nuevo cargo",
                description: "Catálogo laboral utilizado por asignaciones y reglas salariales.",
                fields: [
                    { key: "codigo", label: "Código", required: true },
                    { key: "nombre", label: "Nombre", required: true },
                    { key: "orden", label: "Orden", type: "number" },
                    commonState,
                    { key: "descripcion", label: "Descripción", type: "textarea" },
                ],
                values: {
                    codigo: (item?.codigo as string) ?? "",
                    nombre: (item?.nombre as string) ?? "",
                    orden: (item?.orden as number) ?? 0,
                    descripcion: (item?.descripcion as string) ?? "",
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        if (editor.kind === "JORNADA")
            return {
                id,
                title: id ? "Editar jornada" : "Nueva jornada",
                description: "Define el horario utilizado para calcular asistencia, tardanzas y horas extra.",
                fields: [
                    { key: "codigo", label: "Código", required: true },
                    { key: "nombre", label: "Nombre", required: true },
                    {
                        key: "modalidad",
                        label: "Modalidad",
                        type: "select",
                        required: true,
                        items: ["TIEMPO_COMPLETO", "PART_TIME", "PERSONALIZADA"].map((x) => ({ id: x, label: humanize(x) })),
                    },
                    { key: "horaEntrada", label: "Hora de entrada", type: "time", required: true },
                    { key: "horaSalida", label: "Hora de salida", type: "time", required: true },
                    { key: "minutosTolerancia", label: "Tolerancia (min)", type: "number", required: true },
                    { key: "minutosDescanso", label: "Descanso (min)", type: "number", required: true },
                    { key: "diasSemana", label: "Días de semana (1=lunes, separados por coma)", required: true, placeholder: "1,2,3,4,5" },
                    {
                        key: "cruzaMedianoche",
                        label: "Cruza medianoche",
                        type: "select",
                        items: [
                            { id: "SI", label: "Sí" },
                            { id: "NO", label: "No" },
                        ],
                    },
                    commonState,
                ],
                values: {
                    codigo: (item?.codigo as string) ?? "",
                    nombre: (item?.nombre as string) ?? "",
                    modalidad: (item?.modalidad as string) ?? "TIEMPO_COMPLETO",
                    horaEntrada: (item?.horaEntrada as string) ?? "09:00",
                    horaSalida: (item?.horaSalida as string) ?? "18:00",
                    minutosTolerancia: (item?.minutosTolerancia as number) ?? 5,
                    minutosDescanso: (item?.minutosDescanso as number) ?? 60,
                    diasSemana: Array.isArray(item?.diasSemana) ? (item.diasSemana as number[]).join(",") : "1,2,3,4,5",
                    cruzaMedianoche: item?.cruzaMedianoche ? "SI" : "NO",
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        if (editor.kind === "EVENTO")
            return {
                id,
                title: id ? "Editar tipo de evidencia" : "Nuevo tipo de evidencia",
                description: "Configura el formulario, los participantes requeridos y el concepto económico relacionado.",
                fields: [
                    { key: "codigo", label: "Código", required: true },
                    { key: "nombre", label: "Nombre", required: true },
                    {
                        key: "categoria",
                        label: "Categoría",
                        type: "select",
                        required: true,
                        items: ["CALIFICACION", "LLAMADA", "TARJETA_TERCERO", "REFERIDO", "PENALIDAD", "AUDITORIA_PAGO", "AJUSTE_MANUAL", "OTRO"].map((x) => ({
                            id: x,
                            label: humanize(x),
                        })),
                    },
                    { key: "idConcepto", label: "Concepto económico", type: "select", items: [{ id: 0, label: "Sin concepto" }, ...conceptOptions] },
                    ...["Beneficiario", "Responsable", "Cliente", "Operacion"].map((label) => ({
                        key: `requiere${label}`,
                        label: `Requiere ${label.toLocaleLowerCase("es-PE")}`,
                        type: "select" as const,
                        items: [
                            { id: "SI", label: "Sí" },
                            { id: "NO", label: "No" },
                        ],
                    })),
                    commonState,
                ],
                values: {
                    codigo: (item?.codigo as string) ?? "",
                    nombre: (item?.nombre as string) ?? "",
                    categoria: (item?.categoria as string) ?? "OTRO",
                    idConcepto: (item?.idConcepto as number) ?? 0,
                    requiereBeneficiario: item ? (item.requiereBeneficiario ? "SI" : "NO") : "SI",
                    requiereResponsable: item?.requiereResponsable ? "SI" : "NO",
                    requiereCliente: item?.requiereCliente ? "SI" : "NO",
                    requiereOperacion: item?.requiereOperacion ? "SI" : "NO",
                    configuracionOriginal: JSON.stringify(item?.configuracion ?? {}),
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        if (editor.kind === "ACCESO") {
            const yesNo = [
                { id: "SI", label: "Sí" },
                { id: "NO", label: "No" },
            ];
            return {
                id,
                title: id ? "Editar acceso" : "Nuevo acceso",
                description: "Asigna capacidades y alcance para un recurso del módulo de compensaciones.",
                fields: [
                    {
                        key: "idUsuario",
                        label: "Usuario",
                        type: "select",
                        required: true,
                        items: accessUsers.map((user) => ({ id: user.id, label: `${user.nombre} · ${user.username}` })),
                    },
                    {
                        key: "recurso",
                        label: "Recurso",
                        type: "select",
                        required: true,
                        items: [
                            "RESUMEN",
                            "COLABORADORES",
                            "ASISTENCIA",
                            "EVIDENCIAS",
                            "INCIDENCIAS",
                            "LIQUIDACIONES",
                            "CIERRES",
                            "CONFIGURACION",
                            "REPORTES",
                        ].map((x) => ({ id: x, label: humanize(x) })),
                    },
                    {
                        key: "alcance",
                        label: "Alcance",
                        type: "select",
                        required: true,
                        items: ["PROPIO", "SEDE", "GLOBAL"].map((x) => ({ id: x, label: humanize(x) })),
                    },
                    { key: "idSucursal", label: "Sede (solo alcance Sede)", type: "select", items: branches },
                    ...[
                        ["puedeConsultar", "Consultar"],
                        ["puedeRegistrar", "Registrar"],
                        ["puedeEditar", "Editar"],
                        ["puedeRevisar", "Revisar"],
                        ["puedeAprobar", "Aprobar"],
                        ["puedePagar", "Pagar"],
                        ["puedeCerrar", "Cerrar"],
                        ["puedeConfigurar", "Configurar"],
                    ].map(([key, label]) => ({ key, label, type: "select" as const, items: yesNo })),
                    commonState,
                ],
                values: {
                    idUsuario: (item?.idUsuario as number) ?? accessUsers[0]?.id ?? 0,
                    recurso: (item?.recurso as string) ?? "RESUMEN",
                    alcance: (item?.alcance as string) ?? "PROPIO",
                    idSucursal: (item?.idSucursal as number) ?? 0,
                    puedeConsultar: item ? (item.puedeConsultar ? "SI" : "NO") : "SI",
                    puedeRegistrar: item?.puedeRegistrar ? "SI" : "NO",
                    puedeEditar: item?.puedeEditar ? "SI" : "NO",
                    puedeRevisar: item?.puedeRevisar ? "SI" : "NO",
                    puedeAprobar: item?.puedeAprobar ? "SI" : "NO",
                    puedePagar: item?.puedePagar ? "SI" : "NO",
                    puedeCerrar: item?.puedeCerrar ? "SI" : "NO",
                    puedeConfigurar: item?.puedeConfigurar ? "SI" : "NO",
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        }
        if (editor.kind === "REGLA")
            return {
                id,
                title: id ? "Editar regla" : "Nueva regla",
                description: "Configura el cálculo por concepto, cargo y sede dentro de una versión borrador.",
                fields: [
                    { key: "idPlanVersion", label: "Versión", type: "select", required: true, disabled: Boolean(id), items: draftOptions },
                    { key: "idConcepto", label: "Concepto", type: "select", required: true, items: conceptOptions },
                    { key: "idCargo", label: "Cargo", type: "select", items: cargoOptions },
                    { key: "idSucursal", label: "Sede", type: "select", items: branches },
                    {
                        key: "tipoCalculo",
                        label: "Tipo de cálculo",
                        type: "select",
                        required: true,
                        items: ["FIJO", "PORCENTAJE", "POR_MINUTO", "POR_HORA", "POR_DIA", "POR_UNIDAD"].map((x) => ({ id: x, label: humanize(x) })),
                    },
                    {
                        key: "fuenteOperacion",
                        label: "Fuente operativa",
                        type: "select",
                        items: [
                            { id: "", label: "Sin fuente automática" },
                            { id: "OPERACION_PAGADA_GESTOR", label: "Operación pagada · gestor" },
                            { id: "CLIENTE_NUEVO_EFECTIVIZADO_7_DIAS", label: "Cliente nuevo efectivizado en 7 días" },
                        ],
                    },
                    { key: "monto", label: "Monto", type: "number" },
                    { key: "porcentaje", label: "Porcentaje", type: "number" },
                    { key: "valorMinimo", label: "Valor mínimo", type: "number" },
                    { key: "valorMaximo", label: "Valor máximo", type: "number" },
                    { key: "topeImporte", label: "Tope de importe", type: "number" },
                    { key: "prioridad", label: "Prioridad", type: "number" },
                    commonState,
                ],
                values: {
                    idPlanVersion: (item?.idPlanVersion as number | undefined) ?? (versionId || drafts[0]?.id || 0),
                    idConcepto: (item?.idConcepto as number) ?? concepts[0]?.id ?? 0,
                    idCargo: (item?.idCargo as number) ?? 0,
                    idSucursal: (item?.idSucursal as number) ?? 0,
                    tipoCalculo: (item?.tipoCalculo as string) ?? "FIJO",
                    monto: (item?.monto as number) ?? "",
                    porcentaje: (item?.porcentaje as number) ?? "",
                    valorMinimo: (item?.valorMinimo as number) ?? "",
                    valorMaximo: (item?.valorMaximo as number) ?? "",
                    topeImporte: (item?.topeImporte as number) ?? "",
                    prioridad: (item?.prioridad as number) ?? 0,
                    fuenteOperacion: (item?.fuenteOperacion as string) ?? "",
                    configuracionOriginal: JSON.stringify((item?.configuracion as Record<string, unknown> | undefined) ?? {}),
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        if (editor.kind === "META")
            return {
                id,
                title: id ? "Editar meta" : "Nueva meta por sede",
                description: "La meta queda asociada a una versión y a un mes específico.",
                fields: [
                    { key: "idPlanVersion", label: "Versión", type: "select", required: true, disabled: Boolean(id), items: draftOptions },
                    { key: "idSucursal", label: "Sede", type: "select", required: true, items: toOptions(catalogs.sucursales) },
                    { key: "codigoIndicador", label: "Indicador", required: true, placeholder: "SAFETYPAY_MONTO" },
                    { key: "periodo", label: "Mes", type: "month", required: true },
                    { key: "valorMeta", label: "Valor meta", type: "number", required: true },
                    {
                        key: "unidad",
                        label: "Unidad",
                        type: "select",
                        required: true,
                        items: ["MONTO", "PORCENTAJE", "UNIDAD", "PUNTO"].map((x) => ({ id: x, label: humanize(x) })),
                    },
                    commonState,
                ],
                values: {
                    idPlanVersion: (item?.idPlanVersion as number | undefined) ?? (versionId || drafts[0]?.id || 0),
                    idSucursal: (item?.idSucursal as number) ?? catalogs.sucursales[0]?.id ?? 0,
                    codigoIndicador: (item?.codigoIndicador as string) ?? "SAFETYPAY_MONTO",
                    periodo: String(item?.periodo ?? new Date().toISOString().slice(0, 7)).slice(0, 7),
                    valorMeta: (item?.valorMeta as number) ?? "",
                    unidad: (item?.unidad as string) ?? "MONTO",
                    idEstado: (item?.idEstado as number) ?? stateDefault,
                },
            };
        return {
            id,
            title: id ? "Editar penalidad" : "Nueva penalidad",
            description: "Congela los importes de descuento y, opcionalmente, el bono del reportante.",
            fields: [
                { key: "idPlanVersion", label: "Versión", type: "select", required: true, disabled: Boolean(id), items: draftOptions },
                { key: "codigo", label: "Código", required: true },
                { key: "nombre", label: "Nombre", required: true },
                { key: "idCargo", label: "Cargo aplicable", type: "select", items: cargoOptions },
                {
                    key: "idConceptoDescuento",
                    label: "Concepto de descuento",
                    type: "select",
                    required: true,
                    items: conceptOptions.filter((entry) => concepts.find((concept) => concept.id === entry.id)?.naturaleza === "DESCUENTO"),
                },
                { key: "montoReferencia", label: "Monto de descuento", type: "number", required: true },
                {
                    key: "idConceptoBono",
                    label: "Concepto de bono",
                    type: "select",
                    items: [
                        { id: 0, label: "Sin bono" },
                        ...conceptOptions.filter((entry) => concepts.find((concept) => concept.id === entry.id)?.naturaleza === "INGRESO"),
                    ],
                },
                { key: "montoBono", label: "Monto del bono", type: "number" },
                {
                    key: "requiereRespuesta",
                    label: "Requiere descargo",
                    type: "select",
                    items: [
                        { id: "SI", label: "Sí" },
                        { id: "NO", label: "No" },
                    ],
                },
                commonState,
                { key: "descripcion", label: "Descripción", type: "textarea" },
            ],
            values: {
                idPlanVersion: (item?.idPlanVersion as number | undefined) ?? (versionId || drafts[0]?.id || 0),
                codigo: (item?.codigo as string) ?? "",
                nombre: (item?.nombre as string) ?? "",
                idCargo: (item?.idCargo as number) ?? 0,
                idConceptoDescuento: (item?.idConceptoDescuento as number) ?? concepts.find((concept) => concept.naturaleza === "DESCUENTO")?.id ?? 0,
                montoReferencia: (item?.montoReferencia as number) ?? "",
                idConceptoBono: (item?.idConceptoBono as number) ?? 0,
                montoBono: (item?.montoBono as number) ?? "",
                requiereRespuesta: item ? (item.requiereRespuesta ? "SI" : "NO") : "SI",
                descripcion: (item?.descripcion as string) ?? "",
                idEstado: (item?.idEstado as number) ?? stateDefault,
            },
        };
    }, [accessUsers, branches, cargoOptions, catalogs.estados, catalogs.sucursales, conceptOptions, concepts, draftOptions, editor, plans, states, versionId]);

    const actionButton = (kind: EditorKind, item: unknown) => (
        <Button size="xs" color="tertiary" iconLeading={Edit03} onClick={() => setEditor({ kind, item })}>
            Editar
        </Button>
    );
    const planColumns: ColumnDef[] = [
        { key: "code", header: "Código" },
        { key: "name", header: "Plan" },
        { key: "versions", header: "Versiones" },
        {
            key: "status",
            header: "Estado",
            render: (value) => (
                <Badge size="sm" color={statusColor(String(value))}>
                    {String(value)}
                </Badge>
            ),
        },
    ];
    const versionColumns: ColumnDef[] = [
        { key: "plan", header: "Plan" },
        { key: "version", header: "Versión", render: (value) => `v${String(value)}` },
        { key: "period", header: "Vigencia" },
        { key: "rules", header: "Reglas" },
        {
            key: "status",
            header: "Estado",
            render: (value) => (
                <Badge size="sm" color={statusColor(String(value))}>
                    {humanize(String(value))}
                </Badge>
            ),
        },
    ];
    const genericColumns: Record<Exclude<Tab, "PLANES">, ColumnDef[]> = {
        REGLAS: [
            { key: "concept", header: "Concepto" },
            { key: "scope", header: "Aplicación" },
            { key: "calculation", header: "Cálculo" },
            { key: "source", header: "Fuente" },
            { key: "value", header: "Valor" },
            { key: "priority", header: "Prioridad" },
            {
                key: "status",
                header: "Estado",
                render: (value) => (
                    <Badge size="sm" color={statusColor(String(value))}>
                        {String(value)}
                    </Badge>
                ),
            },
        ],
        CONCEPTOS: [
            { key: "code", header: "Código" },
            { key: "name", header: "Concepto" },
            { key: "category", header: "Categoría" },
            { key: "nature", header: "Naturaleza" },
            { key: "unit", header: "Unidad" },
            {
                key: "status",
                header: "Estado",
                render: (value) => (
                    <Badge size="sm" color={statusColor(String(value))}>
                        {String(value)}
                    </Badge>
                ),
            },
        ],
        CARGOS: [
            { key: "code", header: "Código" },
            { key: "name", header: "Cargo" },
            { key: "order", header: "Orden" },
            { key: "description", header: "Descripción" },
            {
                key: "status",
                header: "Estado",
                render: (value) => (
                    <Badge size="sm" color={statusColor(String(value))}>
                        {String(value)}
                    </Badge>
                ),
            },
        ],
        JORNADAS: [
            { key: "code", header: "Código" },
            { key: "name", header: "Jornada" },
            { key: "schedule", header: "Horario" },
            { key: "days", header: "Días" },
            { key: "tolerance", header: "Tolerancia" },
            { key: "status", header: "Estado" },
        ],
        EVENTOS: [
            { key: "code", header: "Código" },
            { key: "name", header: "Tipo" },
            { key: "category", header: "Categoría" },
            { key: "concept", header: "Concepto" },
            { key: "requirements", header: "Requisitos" },
            { key: "status", header: "Estado" },
        ],
        METAS: [
            { key: "branch", header: "Sede" },
            { key: "indicator", header: "Indicador" },
            { key: "period", header: "Mes" },
            { key: "goal", header: "Meta" },
            { key: "version", header: "Versión" },
            {
                key: "status",
                header: "Estado",
                render: (value) => (
                    <Badge size="sm" color={statusColor(String(value))}>
                        {String(value)}
                    </Badge>
                ),
            },
        ],
        PENALIDADES: [
            { key: "code", header: "Código" },
            { key: "name", header: "Penalidad" },
            { key: "role", header: "Cargo" },
            { key: "amount", header: "Descuento" },
            { key: "bonus", header: "Bono reportante" },
            {
                key: "status",
                header: "Estado",
                render: (value) => (
                    <Badge size="sm" color={statusColor(String(value))}>
                        {String(value)}
                    </Badge>
                ),
            },
        ],
        ACCESOS: [
            { key: "user", header: "Usuario" },
            { key: "resource", header: "Recurso" },
            { key: "scope", header: "Alcance" },
            { key: "permissions", header: "Permisos" },
            { key: "status", header: "Estado" },
        ],
    };
    const filteredRules = rules.filter((item) => !versionId || item.idPlanVersion === versionId);
    const filteredGoals = goals.filter((item) => !versionId || item.idPlanVersion === versionId);
    const filteredPenalties = penalties.filter((item) => !versionId || item.idPlanVersion === versionId);
    const dataByTab: Record<Exclude<Tab, "PLANES">, Record<string, unknown>[]> = {
        REGLAS: filteredRules.map((x) => ({
            id: x.id,
            concept: x.conceptoNombre,
            scope: `${x.cargoNombre || "Todos los cargos"} · ${x.sucursalNombre || "Todas las sedes"}`,
            calculation: humanize(x.tipoCalculo),
            source: x.fuenteOperacion ? humanize(x.fuenteOperacion) : "Manual / sin fuente",
            value: x.monto !== null ? money.format(x.monto) : x.porcentaje !== null ? `${x.porcentaje}%` : "Configuración",
            priority: x.prioridad,
            status: x.estado,
        })),
        CONCEPTOS: concepts.map((x) => ({
            id: x.id,
            code: x.codigo,
            name: x.nombre,
            category: humanize(x.categoria),
            nature: humanize(x.naturaleza),
            unit: humanize(x.unidad),
            status: x.estado,
        })),
        CARGOS: cargos.map((x) => ({ id: x.id, code: x.codigo, name: x.nombre, order: x.orden, description: x.descripcion || "—", status: x.estado })),
        JORNADAS: jornadas.map((x) => ({
            id: x.id,
            code: x.codigo,
            name: x.nombre,
            schedule: `${x.horaEntrada} – ${x.horaSalida}${x.cruzaMedianoche ? " (+1 día)" : ""}`,
            days: x.diasSemana.join(", "),
            tolerance: `${x.minutosTolerancia} min`,
            status: x.estado,
        })),
        EVENTOS: eventTypes.map((x) => ({
            id: x.id,
            code: x.codigo,
            name: x.nombre,
            category: humanize(x.categoria),
            concept: x.conceptoNombre || "Sin concepto",
            requirements:
                [
                    x.requiereBeneficiario && "Beneficiario",
                    x.requiereResponsable && "Responsable",
                    x.requiereCliente && "Cliente",
                    x.requiereOperacion && "Operación",
                ]
                    .filter(Boolean)
                    .join(", ") || "Ninguno",
            status: x.estado,
        })),
        METAS: filteredGoals.map((x) => ({
            id: x.id,
            branch: x.sucursalNombre,
            indicator: x.codigoIndicador,
            period: date.format(new Date(`${x.periodo.slice(0, 10)}T12:00:00Z`)),
            goal: x.unidad === "MONTO" ? money.format(x.valorMeta) : `${x.valorMeta} ${humanize(x.unidad)}`,
            version: `${x.planNombre} · v${x.numeroVersion}`,
            status: x.estado,
        })),
        PENALIDADES: filteredPenalties.map((x) => ({
            id: x.id,
            code: x.codigo,
            name: x.nombre,
            role: x.cargoNombre || "Todos",
            amount: money.format(x.montoReferencia),
            bonus: x.montoBono === null ? "—" : money.format(x.montoBono),
            status: x.estado,
        })),
        ACCESOS: accesses.map((x) => ({
            id: x.id,
            user: x.usuarioNombre,
            resource: humanize(x.recurso),
            scope: x.alcance === "SEDE" ? `${humanize(x.alcance)} · ${x.sucursalNombre}` : humanize(x.alcance),
            permissions: [
                x.puedeConsultar && "Consultar",
                x.puedeRegistrar && "Registrar",
                x.puedeEditar && "Editar",
                x.puedeRevisar && "Revisar",
                x.puedeAprobar && "Aprobar",
                x.puedePagar && "Pagar",
                x.puedeCerrar && "Cerrar",
                x.puedeConfigurar && "Configurar",
            ]
                .filter(Boolean)
                .join(", "),
            status: x.estado,
        })),
    };
    const sourceByTab: Record<Exclude<Tab, "PLANES">, unknown[]> = {
        REGLAS: filteredRules,
        CONCEPTOS: concepts,
        CARGOS: cargos,
        JORNADAS: jornadas,
        EVENTOS: eventTypes,
        METAS: filteredGoals,
        PENALIDADES: filteredPenalties,
        ACCESOS: accesses,
    };
    const kindByTab: Record<Exclude<Tab, "PLANES">, EditorKind> = {
        REGLAS: "REGLA",
        CONCEPTOS: "CONCEPTO",
        CARGOS: "CARGO",
        JORNADAS: "JORNADA",
        EVENTOS: "EVENTO",
        METAS: "META",
        PENALIDADES: "PENALIDAD",
        ACCESOS: "ACCESO",
    };
    const canAddVersionItem = selectedVersion?.estado === "BORRADOR";

    return (
        <AppLayout>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
                    <div>
                        <p className="text-sm font-medium text-brand-secondary">Compensaciones</p>
                        <h1 className="mt-1 text-display-xs font-semibold text-primary">Configuración</h1>
                        <p className="mt-1 text-sm text-tertiary">Administra la matriz versionada de sueldos, bonos, metas y penalidades.</p>
                    </div>
                    <Button size="sm" color="secondary" iconLeading={RefreshCw01} isLoading={isLoading} onClick={() => setRefreshKey((value) => value + 1)}>
                        Actualizar
                    </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                    {[
                        { label: "Planes", value: plans.length, helper: `${drafts.length} versión(es) en borrador` },
                        { label: "Conceptos", value: concepts.length, helper: `${concepts.filter((x) => x.estado.toUpperCase() === "ACTIVO").length} activos` },
                        {
                            label: "Reglas vigentes",
                            value: rules.filter((x) => x.estadoVersion === "PUBLICADA").length,
                            helper: `${penalties.length} penalidad(es)`,
                        },
                    ].map((metric, index) => (
                        <motion.article
                            key={metric.label}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.04 }}
                            className="rounded-xl border border-secondary bg-primary p-4 shadow-xs"
                        >
                            <div className="flex justify-between">
                                <p className="text-xs font-medium text-tertiary">{metric.label}</p>
                                {index === 0 ? <Settings01 className="size-5 text-brand-secondary" /> : <CheckCircle className="size-5 text-success-primary" />}
                            </div>
                            <p className="mt-3 text-display-xs font-semibold text-primary">{metric.value}</p>
                            <p className="mt-1 text-xs text-tertiary">{metric.helper}</p>
                        </motion.article>
                    ))}
                </div>
                <section className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs">
                    <div className="flex flex-wrap gap-2 border-b border-secondary p-3">
                        {tabs.map((item) => (
                            <Button key={item.id} size="sm" color={tab === item.id ? "primary" : "tertiary"} onClick={() => setTab(item.id)}>
                                {item.label}
                            </Button>
                        ))}
                    </div>
                    {["REGLAS", "METAS", "PENALIDADES"].includes(tab) && (
                        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-secondary p-4">
                            <div className="w-80">
                                <Select
                                    label="Versión de matriz"
                                    size="sm"
                                    items={versionOptions}
                                    selectedKey={versionId}
                                    onSelectionChange={(key) => key !== null && setVersionId(Number(key))}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <Button
                                size="sm"
                                color="primary"
                                iconLeading={Plus}
                                isDisabled={!canAddVersionItem}
                                onClick={() => setEditor({ kind: kindByTab[tab as Exclude<Tab, "PLANES">], item: null })}
                            >
                                Nuevo
                            </Button>
                        </div>
                    )}
                    <div className="p-4">
                        {tab === "PLANES" ? (
                            <div className="space-y-6">
                                <div>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-sm font-semibold text-primary">Planes</h2>
                                        <Button size="sm" color="secondary" iconLeading={Plus} onClick={() => setEditor({ kind: "PLAN", item: null })}>
                                            Nuevo plan
                                        </Button>
                                    </div>
                                    <DataTable
                                        columns={planColumns}
                                        data={plans.map((x) => ({ id: x.id, code: x.codigo, name: x.nombre, versions: x.versiones, status: x.estado }))}
                                        isLoading={isLoading}
                                        page={1}
                                        totalPages={1}
                                        pageSize={20}
                                        onPageChange={() => undefined}
                                        onPageSizeChange={() => undefined}
                                        renderActions={(row) => {
                                            const item = plans.find((x) => x.id === Number(row.id));
                                            return item ? actionButton("PLAN", item) : null;
                                        }}
                                    />
                                </div>
                                <div>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-sm font-semibold text-primary">Versiones</h2>
                                        <Button
                                            size="sm"
                                            color="primary"
                                            iconLeading={Plus}
                                            isDisabled={!plans.length}
                                            onClick={() => setEditor({ kind: "VERSION", item: null })}
                                        >
                                            Nueva versión
                                        </Button>
                                    </div>
                                    <DataTable
                                        columns={versionColumns}
                                        data={versions.map((x) => ({
                                            id: x.id,
                                            plan: x.planNombre,
                                            version: x.numeroVersion,
                                            period: `${x.fechaInicio.slice(0, 10)} — ${x.fechaFin?.slice(0, 10) || "sin fin"}`,
                                            rules: x.cantidadReglas,
                                            status: x.estado,
                                        }))}
                                        isLoading={isLoading}
                                        page={1}
                                        totalPages={1}
                                        pageSize={20}
                                        onPageChange={() => undefined}
                                        onPageSizeChange={() => undefined}
                                        renderActions={(row) => {
                                            const item = versions.find((x) => x.id === Number(row.id));
                                            return item?.estado === "BORRADOR" ? (
                                                <div className="flex gap-1">
                                                    {actionButton("VERSION", item)}
                                                    <Button size="xs" color="primary" onClick={() => void publish(item)}>
                                                        Publicar
                                                    </Button>
                                                </div>
                                            ) : null;
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 className="text-sm font-semibold text-primary">{tabs.find((item) => item.id === tab)?.label}</h2>
                                    {["CONCEPTOS", "CARGOS", "JORNADAS", "EVENTOS", "ACCESOS"].includes(tab) && (
                                        <Button
                                            size="sm"
                                            color="primary"
                                            iconLeading={Plus}
                                            onClick={() => setEditor({ kind: kindByTab[tab as Exclude<Tab, "PLANES">], item: null })}
                                        >
                                            Nuevo
                                        </Button>
                                    )}
                                </div>
                                <DataTable
                                    columns={genericColumns[tab]}
                                    data={dataByTab[tab]}
                                    isLoading={isLoading}
                                    page={1}
                                    totalPages={1}
                                    pageSize={20}
                                    onPageChange={() => undefined}
                                    onPageSizeChange={() => undefined}
                                    emptyMessage="No hay configuraciones registradas"
                                    renderActions={(row) => {
                                        const item = sourceByTab[tab].find((entry) => Number((entry as { id: number }).id) === Number(row.id)) as
                                            { estadoVersion?: string } | undefined;
                                        const editable = !["REGLAS", "METAS", "PENALIDADES"].includes(tab) || item?.estadoVersion === "BORRADOR";
                                        return item && editable ? actionButton(kindByTab[tab], item) : null;
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </section>
                {editorConfig && editor && (
                    <ConfiguracionPopup
                        isOpen
                        title={editorConfig.title}
                        description={editorConfig.description}
                        fields={editorConfig.fields as ConfigField[]}
                        initialValues={editorConfig.values as unknown as Record<string, ConfigValue>}
                        onClose={() => setEditor(null)}
                        onSave={(values) => save(editor.kind, editorConfig.id, values)}
                    />
                )}
            </div>
        </AppLayout>
    );
};
