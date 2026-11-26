import { useEffect, useMemo, useState } from "react";
import { Eye, Save01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { mixColumns } from "../evidencias/auditoria-mixta";
import { EvidenciaDetailModal } from "../evidencias/evidencia-detail-modal";
import { evidenciasService } from "../evidencias/evidencias.service";
import type { EvidenciaEvento } from "../evidencias/evidencias.types";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { IncidenciaDetailModal } from "./incidencia-detail-modal";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaCatalogo, IncidenciaEvento } from "./incidencias.types";
import { type PagosColaborador, pagosCuadreService } from "./pagos-cuadre.service";
import { PagosOperacionSelect } from "./pagos-operacion-select";

const LIMITE = 100;
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
type Concepto = "CUADRE" | "DESCUADRE" | "CIERRE";
const conceptos: { id: Concepto; label: string }[] = [
    { id: "CUADRE", label: "Cuadre Perfecto (bono mensual)" },
    { id: "DESCUADRE", label: "Descuadre (penalidad)" },
    { id: "CIERRE", label: "Cierre Incompleto (penalidad)" },
];
/** Uniforme, Indisciplina, Retraso de Voucher, Error de Pago Crítico y Error en Cuadro tienen su propia opción. */
const cargos = ["JEFE_SUPERIOR_PAGOS", "OPERADOR_ALTA_DEMANDA", "ENCARGADO_CARTERA_MEDIA", "ASISTENTE_VIRTUAL_PAGOS"];
const gruposCierre = ["CARTERA", "JEFE", "OPERADOR", "VIRTUAL"];
export const otrasOpcionesCuadre = [
    ...cargos.flatMap((cargo) => ["UNIFORME", "INDISCIPLINA", "ERROR_PAGO_CRITICO", "ERROR_CUADRO"].map((concepto) => `PAG_${cargo}_${concepto}`)),
    ...gruposCierre.map((grupo) => `PAG_${grupo}_RETRASO_VOUCHER`),
];
const esCuadreCierre = (nombre: string) => /^(descuadre|cierre diario incompleto)$/i.test(nombre.trim());
const cierreGrupo: Record<string, string> = {
    JEFE_SUPERIOR_PAGOS: "JEFE",
    OPERADOR_ALTA_DEMANDA: "OPERADOR",
    ENCARGADO_CARTERA_MEDIA: "CARTERA",
    ASISTENTE_VIRTUAL_PAGOS: "VIRTUAL",
};
const penalidadCodigo = (concepto: Concepto, cargo: string) =>
    concepto === "DESCUADRE" ? `PAG_${cargo}_DESCUADRE` : `PAG_${cierreGrupo[cargo] ?? ""}_CIERRE_INCOMPLETO`;
const errorText = (cause: unknown) =>
    cause instanceof Error
        ? cause.message
        : cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "No se pudo completar la solicitud";
const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 16);
/** Cuadre Perfecto solo se registra sobre un mes ya terminado. */
const ultimoMesTerminado = () => new Date(Date.parse(`${hoy().slice(0, 7)}-01T00:00:00Z`) - 86400e3).toISOString().slice(0, 7);

type Fila = Record<string, unknown> & { id: string; tipo: "BONO" | "PENALIDAD"; fecha: string; estado: string; monto: number | null };

/**
 * Auditoría Cuadre y Cierre (Esquema 12). Pagos consulta su Cuadre Perfecto, Descuadres y Cierres Incompletos y presenta su descargo;
 * Administración registra el cuadre, el descuadre y el cierre incompleto desde el formulario de esta misma opción.
 */
export const AuditoriaCuadreCierrePage = withAlertProvider(() => {
    const { userId, isResolving } = useCompensacionPerfil();
    return (
        <AppLayout>
            {isResolving ? (
                <p role="status" className="text-sm text-tertiary">
                    Verificando acceso…
                </p>
            ) : (
                <Content key={userId} />
            )}
        </AppLayout>
    );
});

const Content = () => {
    const { isAdministrator } = useCompensacionPerfil();
    const notify = useAlert();
    const [bonos, setBonos] = useState<EvidenciaEvento[]>([]);
    const [penalidades, setPenalidades] = useState<IncidenciaEvento[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [bonoSel, setBonoSel] = useState<EvidenciaEvento | null>(null);
    const [penaSel, setPenaSel] = useState<IncidenciaEvento | null>(null);
    const [actorId, setActorId] = useState<number | undefined>();
    useEffect(() => {
        incidenciasService
            .getCatalog()
            .then((catalog) => setActorId(catalog.reportantes.length === 1 ? catalog.reportantes[0].id : undefined))
            .catch(() => setActorId(undefined));
    }, []);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        const loadBonos = async () => {
            const types = await evidenciasService.getTypes();
            const type = types.find((item) => item.codigo === "CUADRE_PERFECTO");
            if (!type) return [] as EvidenciaEvento[];
            const result = await evidenciasService.getList({
                documentoCliente: "",
                nombreCliente: "",
                colaborador: "",
                search: "",
                category: "",
                status: "",
                typeId: type.id,
                from: "",
                to: "",
                page: 1,
                pageSize: LIMITE,
            });
            return result.items;
        };
        const loadPenalidades = () =>
            incidenciasService
                .getList({
                    tray: "TODOS",
                    category: "",
                    status: "",
                    penaltyId: 0,
                    search: "",
                    from: "",
                    to: "",
                    page: 1,
                    pageSize: LIMITE,
                    excludeCodes: otrasOpcionesCuadre,
                })
                .then((data) => data.items.filter((item) => esCuadreCierre(item.penalidadNombre)));
        Promise.all([loadBonos(), loadPenalidades()])
            .then(([b, p]) => {
                if (!active) return;
                setBonos(b);
                setPenalidades(p);
            })
            .catch((cause) => {
                if (!active) return;
                setBonos([]);
                setPenalidades([]);
                setError(errorText(cause));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [refresh]);
    const filas = useMemo<Fila[]>(() => {
        const rowsBono = bonos.map((e): Fila => ({
            id: `B:${e.id}`,
            tipo: "BONO",
            detalle: "Cuadre Perfecto",
            detalle2: [e.beneficiarioNombre, e.periodoImputacion?.slice(0, 7)].filter(Boolean).join(" · "),
            registradoPor: e.usuarioRegistraNombre,
            fecha: e.fechaEvento,
            monto: e.importeAprobado,
            estado: e.estado,
            bono: e,
        }));
        const rowsPena = penalidades.map((e): Fila => ({
            id: `P:${e.id}`,
            tipo: "PENALIDAD",
            detalle: e.penalidadNombre,
            detalle2: [e.responsableNombre, e.motivo].filter(Boolean).join(" · "),
            registradoPor: e.reportanteNombre,
            fecha: e.fechaEvento,
            monto: e.importeAprobado ?? null,
            estado: e.estado,
            incidencia: e,
        }));
        return [...rowsBono, ...rowsPena].sort((x, y) => (Date.parse(y.fecha) || 0) - (Date.parse(x.fecha) || 0));
    }, [bonos, penalidades]);
    const resumen = useMemo(() => {
        const sum = (kind: Fila["tipo"]) => filas.filter((f) => f.tipo === kind && f.estado === "APROBADO").reduce((total, f) => total + (f.monto ?? 0), 0);
        return {
            registros: filas.length,
            pendientes: filas.filter((f) => f.estado === "PENDIENTE" || f.estado === "EN_REVISION").length,
            bonos: sum("BONO"),
            penalidades: sum("PENALIDAD"),
        };
    }, [filas]);
    const totalPages = Math.max(1, Math.ceil(filas.length / pageSize));
    const current = Math.min(page, totalPages);
    const visibles = filas.slice((current - 1) * pageSize, current * pageSize);
    return (
        <div className="min-w-0 space-y-5">
            <CompensacionHeading section="evidencias" title="Auditoría Cuadre y Cierre" />
            <div className="grid gap-4 sm:grid-cols-4">
                {[
                    ["Registros", resumen.registros],
                    ["Pendientes", resumen.pendientes],
                    ["Bonos aprobados", money.format(resumen.bonos)],
                    ["Penalidades aprobadas", money.format(resumen.penalidades)],
                ].map(([title, value]) => (
                    <CompensacionPanel key={title} title={String(title)}>
                        <p className="text-display-xs font-semibold text-primary tabular-nums">{loading ? "…" : value}</p>
                    </CompensacionPanel>
                ))}
            </div>
            {isAdministrator && (
                <RegistroAdmin
                    onSaved={(mensaje) => {
                        setRefresh((value) => value + 1);
                        notify("success", mensaje);
                    }}
                />
            )}
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <DataTable
                density="compact"
                columns={isAdministrator ? mixColumns : mixColumns.filter((column) => column.key !== "registradoPor")}
                data={visibles}
                isLoading={loading}
                page={current}
                pageSize={pageSize}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
                emptyMessage="Sin registros de cuadre ni cierre"
                renderActions={(row) => {
                    const bono = row.bono as EvidenciaEvento | undefined;
                    return (
                        <ButtonUtility
                            icon={Eye}
                            size="xs"
                            color="tertiary"
                            className={compensationTableActionClass}
                            tooltip={bono ? "Consultar cuadre y revisión" : "Ver detalle y descargo"}
                            aria-label={bono ? "Consultar cuadre y revisión" : "Ver detalle y descargo"}
                            onClick={() => (bono ? setBonoSel(bono) : setPenaSel(row.incidencia as IncidenciaEvento))}
                        />
                    );
                }}
            />
            <EvidenciaDetailModal item={bonoSel} onClose={() => setBonoSel(null)} onChanged={() => setBonoSel(null)} readOnly />
            <IncidenciaDetailModal
                item={penaSel}
                actorCollaboratorId={actorId}
                onClose={() => setPenaSel(null)}
                onChanged={() => {
                    setPenaSel(null);
                    setRefresh((value) => value + 1);
                }}
            />
        </div>
    );
};

/** Formulario de Administración: Cuadre Perfecto se registra y aprueba con la conciliación; Descuadre y Cierre Incompleto entran como penalidad. */
const RegistroAdmin = ({ onSaved }: { onSaved: (mensaje: string) => void }) => {
    const [colaboradores, setColaboradores] = useState<PagosColaborador[]>([]);
    const [catalogo, setCatalogo] = useState<IncidenciaCatalogo | null>(null);
    const [concepto, setConcepto] = useState<Concepto>("CUADRE");
    const [colaborador, setColaborador] = useState<number | null>(null);
    const [mes, setMes] = useState(ultimoMesTerminado);
    const [fecha, setFecha] = useState(hoy());
    const [operacion, setOperacion] = useState<number | null>(null);
    const [motivo, setMotivo] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [loadError, setLoadError] = useState("");
    useEffect(() => {
        Promise.all([pagosCuadreService.colaboradores(), incidenciasService.getCatalog()])
            .then(([people, catalog]) => {
                setColaboradores(people);
                setCatalogo(catalog);
            })
            .catch((cause) => setLoadError(errorText(cause)));
    }, []);
    const responsable = colaboradores.find((item) => item.id === colaborador) ?? null;
    const valido = Boolean(responsable) && motivo.trim().length >= 10 && (concepto === "CUADRE" ? Boolean(mes) : Boolean(fecha) && operacion != null);
    const guardar = async () => {
        if (!responsable || saving) return;
        setSaving(true);
        setError("");
        try {
            if (concepto === "CUADRE") {
                await pagosCuadreService.registrarCuadre(mes, responsable.id, "", motivo.trim());
                onSaved("Cuadre perfecto registrado y aprobado.");
            } else {
                const penalidad = catalogo?.penalidades.find((item) => item.codigo === penalidadCodigo(concepto, responsable.cargo));
                const tipo = catalogo?.tipos.find((item) => item.codigo === "REPORTE_PENALIDAD");
                if (!penalidad || !tipo) throw new Error("La penalidad no está disponible para el cargo del colaborador.");
                const reportante =
                    colaboradores.find((item) => item.id !== responsable.id && item.cargo === "JEFE_SUPERIOR_PAGOS") ??
                    colaboradores.find((item) => item.id !== responsable.id);
                if (!reportante) throw new Error("No hay otro colaborador de Pagos que figure como reportante.");
                const id = await incidenciasService.create({
                    idTipoEvento: tipo.id,
                    idPenalidadTipo: penalidad.id,
                    idReportante: reportante.id,
                    idResponsable: responsable.id,
                    fechaEvento: fecha,
                    titulo: "",
                    motivo: motivo.trim(),
                    evidenciaUrl: "",
                    clienteId: null,
                    clienteDocumento: "",
                    clienteNombre: "",
                    operacionId: operacion,
                });
                await incidenciasService.send(id);
                onSaved(`${concepto === "DESCUADRE" ? "Descuadre" : "Cierre incompleto"} registrado. Pendiente de revisión.`);
            }
            setOperacion(null);
            setMotivo("");
        } catch (cause) {
            setError(errorText(cause));
        } finally {
            setSaving(false);
        }
    };
    return (
        <CompensacionPanel title="Registrar Cuadre o Cierre">
            {loadError && <AlertMessage tone="error">{loadError}</AlertMessage>}
            <div className="flex flex-wrap items-end gap-3">
                <Select
                    size="sm"
                    label="Concepto"
                    className="w-64"
                    items={conceptos}
                    selectedKey={concepto}
                    isDisabled={saving}
                    onSelectionChange={(value) => {
                        setConcepto(value === "DESCUADRE" || value === "CIERRE" ? value : "CUADRE");
                        setOperacion(null);
                    }}
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Select
                    size="sm"
                    label="Colaborador de Pagos"
                    placeholder="Seleccionar"
                    className="w-72"
                    items={colaboradores.map((item) => ({ id: item.id, label: `${item.nombre} · ${item.cargoNombre}` }))}
                    selectedKey={colaborador}
                    isDisabled={saving}
                    onSelectionChange={(id) => {
                        setColaborador(id == null ? null : Number(id));
                        setOperacion(null);
                    }}
                >
                    {(item) => <Select.Item {...item} />}
                </Select>
                {concepto === "CUADRE" ? (
                    <div className="w-40">
                        <Input size="sm" label="Mes" type="month" value={mes} isDisabled={saving} onChange={setMes} />
                    </div>
                ) : (
                    <div className="w-56">
                        <Input size="sm" label="Fecha del hecho" type="datetime-local" value={fecha} isDisabled={saving} onChange={setFecha} />
                    </div>
                )}
                {concepto !== "CUADRE" && (
                    <PagosOperacionSelect
                        className="w-72 max-w-full"
                        colaboradorId={colaborador}
                        vinculo={concepto}
                        fechaHecho={fecha}
                        value={operacion}
                        onChange={setOperacion}
                        disabled={saving}
                    />
                )}
                <div className="min-w-56 flex-1">
                    <CompensacionNoteField label="Detalle" value={motivo} onChange={setMotivo} isDisabled={saving} isRequired />
                </div>
                <Button size="sm" color="primary" iconLeading={Save01} isDisabled={saving || !valido} onClick={guardar}>
                    Guardar
                </Button>
            </div>
            {error && (
                <div className="mt-3">
                    <AlertMessage tone="validation">{error}</AlertMessage>
                </div>
            )}
        </CompensacionPanel>
    );
};
