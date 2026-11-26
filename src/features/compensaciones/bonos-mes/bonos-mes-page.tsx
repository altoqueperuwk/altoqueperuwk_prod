import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download01, Eye, Lock01, LockUnlocked01, RefreshCw01, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompensacionDataTable as DataTable } from "../shared/compensacion-data-table";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFiltros } from "../shared/compensacion-filtros";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { reporteACsv } from "./bonos-mes-export";
import { bonosMesService } from "./bonos-mes.service";
import type { ListaBonosMes, PeriodoBonosMes } from "./bonos-mes.types";
import { ColaboradorBonosModal } from "./colaborador-bonos-modal";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const mensajeError = (error: unknown) =>
    error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown })?.message === "string"
          ? String((error as { message: string }).message)
          : "No fue posible completar la acción";

export const BonosMesPage = withAlertProvider(() => {
    const notify = useAlert();
    const [periodos, setPeriodos] = useState<PeriodoBonosMes[]>([]);
    const [idPeriodo, setIdPeriodo] = useState(0);
    const [busqueda, setBusqueda] = useState("");
    const [lista, setLista] = useState<ListaBonosMes | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState("");
    const [seleccionado, setSeleccionado] = useState<number | null>(null);
    const [dialogo, setDialogo] = useState<"confirmar" | "reabrir" | null>(null);
    const [nota, setNota] = useState("");
    const [incluirBloqueados, setIncluirBloqueados] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const solicitud = useRef(0);

    const cargarPeriodos = useCallback(async () => {
        try {
            const data = await bonosMesService.getPeriodos();
            setPeriodos(data);
            setIdPeriodo((actual) => actual || data[0]?.id || 0);
            if (!data.length) setCargando(false);
        } catch (cause) {
            setError(mensajeError(cause));
            setCargando(false);
        }
    }, []);

    const cargar = useCallback(async () => {
        if (!idPeriodo) return;
        const actual = ++solicitud.current;
        setCargando(true);
        setError("");
        try {
            const data = await bonosMesService.getLista(idPeriodo, busqueda);
            if (actual === solicitud.current) setLista(data);
        } catch (cause) {
            if (actual === solicitud.current) {
                setLista(null);
                setError(mensajeError(cause));
            }
        } finally {
            if (actual === solicitud.current) setCargando(false);
        }
    }, [idPeriodo, busqueda]);

    useEffect(() => {
        void cargarPeriodos();
    }, [cargarPeriodos]);

    useEffect(() => {
        const timer = window.setTimeout(() => void cargar(), 250);
        return () => window.clearTimeout(timer);
    }, [cargar]);

    const periodo = periodos.find((entry) => entry.id === idPeriodo) ?? null;
    const confirmado = lista?.estadoReporte === "CONFIRMADO";
    const bloqueados = useMemo(() => lista?.filas.filter((fila) => !fila.puedeCalcular).length ?? 0, [lista]);

    const filas = useMemo<Record<string, unknown>[]>(
        () =>
            (lista?.filas ?? []).map((fila) => ({
                id: fila.idColaborador,
                nombre: fila.nombre,
                cargo: fila.cargo,
                sucursal: fila.sucursal,
                bonos: fila.totalBonos,
                comisiones: fila.totalComisiones,
                descuentos: fila.totalDescuentos,
                total: fila.totalNeto,
                aplicados: fila.descuentos.filter((entry) => entry.estado === "ACTIVO").length,
                estado: fila.puedeCalcular ? "LISTO" : "BLOQUEADO",
            })),
        [lista],
    );

    const columnas: ColumnDef[] = [
        { key: "nombre", header: "Colaborador" },
        { key: "cargo", header: "Cargo" },
        { key: "sucursal", header: "Sede" },
        { key: "bonos", header: "Bonos", align: "right", render: (value) => money.format(Number(value)) },
        { key: "comisiones", header: "Comisiones", align: "right", render: (value) => money.format(Number(value)) },
        {
            key: "descuentos",
            header: "Penalidades",
            align: "right",
            render: (value) => <span className="text-error-primary">{money.format(Number(value))}</span>,
        },
        {
            key: "total",
            header: "Total a reportar",
            align: "right",
            render: (value) => <span className="font-semibold text-primary">{money.format(Number(value))}</span>,
        },
        { key: "aplicados", header: "Descuentos aplicados", align: "right" },
        {
            key: "estado",
            header: "Estado",
            render: (value) => <StatusBadge tone={value === "LISTO" ? "success" : "warning"}>{value === "LISTO" ? "Listo" : "Con pendientes"}</StatusBadge>,
        },
    ];

    const metricas = [
        { label: "Bonos", value: lista ? money.format(lista.totales.totalBonos) : "—", tone: "text-success-primary" },
        { label: "Comisiones", value: lista ? money.format(lista.totales.totalComisiones) : "—", tone: "text-success-primary" },
        { label: "Penalidades", value: lista ? money.format(lista.totales.totalDescuentos) : "—", tone: "text-error-primary" },
        { label: "Total a reportar", value: lista ? money.format(lista.totales.totalNeto) : "—", tone: "text-primary" },
    ];

    const cerrarDialogo = () => {
        if (guardando) return;
        setDialogo(null);
        setNota("");
        setIncluirBloqueados(false);
    };

    const ejecutar = async (accion: () => Promise<void>, exito: string) => {
        setGuardando(true);
        try {
            await accion();
            notify("success", exito);
            setDialogo(null);
            setNota("");
            setIncluirBloqueados(false);
            await Promise.all([cargar(), cargarPeriodos()]);
        } catch (cause) {
            notify("error", mensajeError(cause));
        } finally {
            setGuardando(false);
        }
    };

    const descargar = async () => {
        try {
            const reporte = await bonosMesService.exportar(idPeriodo);
            const blob = new Blob(["﻿" + reporteACsv(reporte)], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `bonos-${reporte.periodo.slice(0, 7)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (cause) {
            notify("error", mensajeError(cause));
        }
    };

    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <CompensacionHeading
                    section="bonos-mes"
                    title="Bonos del mes"
                    description="Revisa lo que acumuló cada colaborador, aplica descuentos y confirma el reporte del mes."
                />
                <CompensacionFiltros>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="w-full max-w-60 min-w-0">
                                <Select
                                    aria-label="Mes"
                                    size="sm"
                                    placeholder="Seleccionar mes"
                                    items={periodos.map((entry) => ({
                                        id: entry.id,
                                        label: `${entry.nombre} · ${entry.estadoReporte === "CONFIRMADO" ? "Confirmado" : "Borrador"}`,
                                    }))}
                                    selectedKey={idPeriodo || null}
                                    onSelectionChange={(key) => {
                                        if (key !== null) setIdPeriodo(Number(key));
                                    }}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <div className="w-full max-w-60 min-w-0">
                                <Input
                                    aria-label="Buscar colaborador"
                                    size="sm"
                                    placeholder="Buscar por nombre o documento"
                                    value={busqueda}
                                    onChange={setBusqueda}
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <Button size="sm" color="secondary" iconLeading={RefreshCw01} isLoading={cargando} onClick={() => void cargar()}>
                                Actualizar
                            </Button>
                            {confirmado && (
                                <Button size="sm" color="secondary" iconLeading={Download01} onClick={() => void descargar()}>
                                    Descargar
                                </Button>
                            )}
                            {confirmado ? (
                                <Button size="sm" color="secondary" iconLeading={LockUnlocked01} onClick={() => setDialogo("reabrir")}>
                                    Reabrir reporte
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    color="primary"
                                    iconLeading={Lock01}
                                    isDisabled={!lista || cargando || lista.filas.length === 0}
                                    onClick={() => setDialogo("confirmar")}
                                >
                                    Confirmar reporte
                                </Button>
                            )}
                        </div>
                    </div>
                </CompensacionFiltros>
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                {confirmado && lista && (
                    <AlertMessage tone="notice">
                        {`Reporte confirmado${lista.confirmadoEn ? ` el ${new Date(lista.confirmadoEn).toLocaleString("es-PE")}` : ""}. Huella ${lista.hashContenido?.slice(0, 12) ?? ""}. Reábrelo para cambiar descuentos.`}
                    </AlertMessage>
                )}
                {!confirmado && bloqueados > 0 && (
                    <AlertMessage tone="notice">{`${bloqueados} colaborador(es) tienen pendientes por resolver antes de confirmar.`}</AlertMessage>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {metricas.map((metrica) => (
                        <CompensacionPanel key={metrica.label} title={metrica.label}>
                            <p className={`text-display-xs font-semibold tabular-nums ${metrica.tone}`}>{metrica.value}</p>
                        </CompensacionPanel>
                    ))}
                </div>
                <CompensacionPanel title="Colaboradores">
                    <DataTable
                        density="compact"
                        columns={columnas}
                        data={filas}
                        isLoading={cargando}
                        page={1}
                        totalPages={1}
                        pageSize={500}
                        onPageChange={() => undefined}
                        onPageSizeChange={() => undefined}
                        emptyMessage={error ? "Consulta no disponible" : periodo ? "No hay colaboradores en este mes" : "Selecciona un mes"}
                        emptyDescription="Solo aparecen colaboradores con asignación vigente en el mes."
                        renderActions={(row) => (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                icon={Eye}
                                tooltip="Ver detalle"
                                className={compensationTableActionClass}
                                onClick={() => setSeleccionado(Number(row.id))}
                            />
                        )}
                    />
                </CompensacionPanel>
                {seleccionado !== null && (
                    <ColaboradorBonosModal
                        key={`${idPeriodo}:${seleccionado}`}
                        idPeriodo={idPeriodo}
                        idColaborador={seleccionado}
                        confirmado={confirmado}
                        onClose={() => setSeleccionado(null)}
                        onChanged={() => void cargar()}
                    />
                )}
                {dialogo && (
                    <CompensacionSurface title={dialogo === "confirmar" ? "Confirmar reporte" : "Reabrir reporte"} busy={guardando} onClose={cerrarDialogo}>
                        <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
                            <CompensacionDialogHeader
                                title={dialogo === "confirmar" ? "Confirmar reporte del mes" : "Reabrir reporte del mes"}
                                busy={guardando}
                                onClose={cerrarDialogo}
                            />
                            <div className="space-y-4 p-4">
                                {dialogo === "confirmar" ? (
                                    <>
                                        <p className="text-sm text-secondary">
                                            Se fijará el reporte de {periodo?.nombre} con {lista?.filas.length ?? 0} colaboradores por un total de{" "}
                                            {money.format(lista?.totales.totalNeto ?? 0)}. Podrás reabrirlo con un motivo.
                                        </p>
                                        {bloqueados > 0 && (
                                            <label className="border-warning flex items-start gap-2 rounded-lg border bg-warning-secondary p-3 text-sm text-warning-primary">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1"
                                                    checked={incluirBloqueados}
                                                    onChange={(event) => setIncluirBloqueados(event.target.checked)}
                                                />
                                                <span>
                                                    {bloqueados} colaborador(es) tienen pendientes. Confirmar de todos modos, con lo calculado hasta ahora.
                                                </span>
                                            </label>
                                        )}
                                        <TextArea label="Nota (opcional)" size="sm" rows={2} value={nota} onChange={setNota} isDisabled={guardando} />
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm text-secondary">
                                            El reporte volverá a borrador y se recalculará. Queda registrado quién lo reabre y por qué.
                                        </p>
                                        <TextArea label="Motivo" size="sm" rows={3} isRequired value={nota} onChange={setNota} isDisabled={guardando} />
                                    </>
                                )}
                            </div>
                            <CompensacionDialogFooter>
                                <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={guardando} onClick={cerrarDialogo}>
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    color="primary"
                                    iconLeading={Check}
                                    isLoading={guardando}
                                    isDisabled={
                                        guardando ||
                                        (dialogo === "reabrir" && nota.trim().length < 5) ||
                                        (dialogo === "confirmar" && bloqueados > 0 && !incluirBloqueados)
                                    }
                                    onClick={() =>
                                        void (dialogo === "confirmar"
                                            ? ejecutar(() => bonosMesService.confirmar(idPeriodo, nota, incluirBloqueados), "Reporte confirmado")
                                            : ejecutar(() => bonosMesService.reabrir(idPeriodo, nota), "Reporte reabierto"))
                                    }
                                >
                                    {dialogo === "confirmar" ? "Confirmar" : "Reabrir"}
                                </Button>
                            </CompensacionDialogFooter>
                        </div>
                    </CompensacionSurface>
                )}
            </div>
        </AppLayout>
    );
});
