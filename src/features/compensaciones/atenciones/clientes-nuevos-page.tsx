import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckDone01, Edit03, Eye, MessageSquare01, Paperclip, RefreshCw01, Trash01, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertProvider, useAlert } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { useAtkBrand } from "@/hooks/use-atk-brand";
import { adminOperacionesService } from "../evidencias/admin-operaciones.service";
import { EvidenciaDetailModal } from "../evidencias/evidencia-detail-modal";
import type { EvidenciaEvento } from "../evidencias/evidencias.types";
import { fechaLima } from "../evidencias/tarjeta-tercero-form";
import { tiktokClientesService } from "../evidencias/tiktok-clientes.service";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionDeleteDialog } from "../shared/compensacion-delete-dialog";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { CaptacionAdjuntoDialog } from "./captacion-adjunto-dialog";
import { CaptacionInfoDialog } from "./captacion-info-dialog";
import { CaptacionRevisionDialog } from "./captacion-revision-dialog";
import { canEditCliente } from "./cliente-nuevo-eligibility";
import { ClienteNuevoForm } from "./cliente-nuevo-form";
import { captacionApprovalColumn, clientesNuevosColumns, registradoPorColumn, validacionPagosColumn } from "./clientes-nuevos-columns";
import { ClientesNuevosFiltrosBar, currentLimaMonth } from "./clientes-nuevos-filtros";
import { ClientesNuevosKpis } from "./clientes-nuevos-kpis";
import {
    type ClienteNuevo,
    type ClientesNuevosFiltros,
    type ClientesNuevosResult,
    type ValidacionPagos,
    clientesNuevosService,
} from "./clientes-nuevos.service";

const message = (cause: unknown) => (cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo completar la solicitud");
const periodDates = (month: string) => {
    const [year, number] = month.split("-").map(Number);
    return { desde: `${month}-01`, hasta: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) };
};
type PageProps = { tiktok?: boolean; readOnly?: boolean };
export const ClientesNuevosPage = (props: PageProps) => {
    useAtkBrand();
    const { userId, isStoreManager, isAdministrator, isResolving } = useCompensacionPerfil();
    if (isResolving)
        return (
            <AppLayout>
                <p role="status">Verificando acceso a Clientes…</p>
            </AppLayout>
        );
    return (
        <AlertProvider>
            <ClientesNuevosContent key={`${userId}:${isStoreManager}:${isAdministrator}:${Boolean(props.tiktok)}:${Boolean(props.readOnly)}`} {...props} />
        </AlertProvider>
    );
};
const ClientesNuevosContent = ({ tiktok = false, readOnly = false }: PageProps) => {
    const { isStoreManager, isAdministrator } = useCompensacionPerfil();
    const supervising = isStoreManager && !tiktok;
    const liveFilter = tiktok;
    const liveCapture = tiktok;
    const [capture, setCapture] = useState<File | null>(null);
    const [review, setReview] = useState<ClienteNuevo | null>(null);
    const [attaching, setAttaching] = useState(false);
    const [deciding, setDeciding] = useState<number | null>(null);
    const decisionLock = useRef(false);
    const active = useRef(true);
    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false;
        };
    }, []);
    const [showInfo, setShowInfo] = useState(false);
    const [capturePath, setCapturePath] = useState<string | null>(null);
    const [captureUrl, setCaptureUrl] = useState("");
    const [captureError, setCaptureError] = useState("");
    const [captureRetry, setCaptureRetry] = useState(0);
    useEffect(() => {
        if (!capturePath) return;
        let active = true;
        setCaptureUrl("");
        setCaptureError("");
        tiktokClientesService
            .evidenceUrl(capturePath)
            .then((url) => {
                if (active) setCaptureUrl(url);
            })
            .catch((cause) => {
                if (active) setCaptureError(message(cause));
            });
        return () => {
            active = false;
        };
    }, [capturePath, captureRetry]);
    const clientService = liveFilter ? tiktokClientesService : clientesNuevosService;
    const notify = useAlert();
    const [month, setMonth] = useState(() => fechaLima().slice(0, 7));
    const [page, setPage] = useState(1),
        [size, setSize] = useState(20),
        [revision, setRevision] = useState(0);
    const [filters, setFilters] = useState<ClientesNuevosFiltros>(() => periodDates(month));
    const [query, setQuery] = useState({ documento: "", nombre: "", colaborador: "" });
    const [data, setData] = useState<ClientesNuevosResult | null>(null);
    const [loading, setLoading] = useState(true),
        [error, setError] = useState("");
    const [form, setForm] = useState<ClienteNuevo | null>(null),
        [busy, setBusy] = useState(false);
    const [removing, setRemoving] = useState<ClienteNuevo | null>(null);
    const [newFormRevision, setNewFormRevision] = useState(0);
    useEffect(() => {
        if (error) notify("error", error);
    }, [error, notify]);
    useEffect(() => {
        if (captureError) notify("error", captureError);
    }, [captureError, notify]);
    const typed = { documento: filters.documento ?? "", nombre: filters.nombre ?? "", colaborador: filters.colaborador ?? "" };
    const queryPending = typed.documento !== query.documento || typed.nombre !== query.nombre || typed.colaborador !== query.colaborador;
    useEffect(() => {
        if (!queryPending) return;
        const timer = setTimeout(() => {
            setQuery({ documento: filters.documento ?? "", nombre: filters.nombre ?? "", colaborador: filters.colaborador ?? "" });
            setPage(1);
        }, 250);
        return () => clearTimeout(timer);
    }, [queryPending, filters.documento, filters.nombre, filters.colaborador]);
    useEffect(() => {
        const timer = setInterval(() => setRevision((v) => v + 1), 60000);
        const focus = () => setRevision((v) => v + 1);
        window.addEventListener("focus", focus);
        return () => {
            clearInterval(timer);
            window.removeEventListener("focus", focus);
        };
    }, []);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        if (filters.desde && filters.hasta && filters.desde > filters.hasta) {
            setError("Desde no puede ser posterior a Hasta");
            setData(null);
            setLoading(false);
            return;
        }
        if (queryPending) return;
        clientService
            .list(month, page, size, { ...filters, ...query })
            .then((result) => {
                if (active) setData(result);
            })
            .catch((cause) => {
                if (active) {
                    setData(null);
                    setError(message(cause));
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [month, page, size, revision, filters.tipo, filters.estado, filters.desde, filters.hasta, query, queryPending, clientService, supervising]);
    const conValidacionPagos = isAdministrator && !tiktok;
    const [validaciones, setValidaciones] = useState<ValidacionPagos[]>([]);
    const [validacion, setValidacion] = useState<EvidenciaEvento | null>(null);
    useEffect(() => {
        const ids = conValidacionPagos ? (data?.items ?? []).map((row) => row.id) : [];
        if (!ids.length) return;
        let active = true;
        clientesNuevosService
            .validacionesPagos(ids)
            .then((result) => {
                if (active) setValidaciones(result.items);
            })
            .catch((cause) => {
                if (!active) return;
                setValidaciones([]);
                notify("error", message(cause));
            });
        return () => {
            active = false;
        };
    }, [conValidacionPagos, data, notify]);
    const validacionDe = (id: unknown) => validaciones.find((item) => item.id_cliente === Number(id));
    const abrirValidacion = async (id: number) => {
        try {
            const item = await adminOperacionesService.evidencia(id);
            if (active.current) setValidacion(item);
        } catch (cause) {
            if (active.current) notify("error", message(cause));
        }
    };
    const decide = async (row: ClienteNuevo, action: "APROBADO" | "RECHAZADO") => {
        if (!isAdministrator || loading || decisionLock.current || !row.puede_resolver || !row.id_colaborador) return;
        decisionLock.current = true;
        setDeciding(row.id);
        const concept = row.concepto_codigo ?? (tiktok ? "COMISION_TIKTOK_LIVE" : "COMISION_REGISTRO_EFECTIVIZACION");
        try {
            const current = await clientesNuevosService.revision(row.id, row.id_colaborador, concept);
            if (!active.current) return;
            if (!current.puede_resolver) throw new Error(current.bloqueo_revision || "El registro ya fue resuelto o cambió de estado.");
            if (!current.revision_version) throw new Error("No se confirmó la versión de revisión. Actualiza e inténtalo de nuevo.");
            await clientesNuevosService.resolve(row.id, row.id_colaborador, current.revision_version, action, concept);
            if (active.current) notify("success", action === "APROBADO" ? "Comisión aprobada." : "Comisión rechazada.");
        } catch (cause) {
            if (active.current) notify("error", message(cause));
        } finally {
            decisionLock.current = false;
            if (active.current) {
                setDeciding(null);
                setData(null);
                setRevision((value) => value + 1);
            }
        }
    };
    const filter = (key: keyof ClientesNuevosFiltros, value: string) => {
        setData(null);
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    };
    const selectPeriod = (value: string) => {
        setData(null);
        setMonth(value);
        setFilters((current) => ({ ...current, ...periodDates(value) }));
        setPage(1);
    };
    return (
        <AppLayout>
            <div className="min-w-0 space-y-4 [&_td]:text-xs">
                <div className="flex items-center justify-between gap-3">
                    <CompensacionHeading section="evidencias" title={tiktok ? "TikTok Live" : "Registro Nuevo"} />
                    <ButtonUtility
                        size="sm"
                        color="tertiary"
                        icon={AlertCircle}
                        tooltip={tiktok ? "Información de TikTok Live" : "Información de Registro Nuevo"}
                        className="shrink-0"
                        onClick={() => setShowInfo(true)}
                    />
                </div>
                <ClientesNuevosKpis data={data} error={error} />
                {!readOnly && !isAdministrator && (
                    <ClienteNuevoForm
                        key={newFormRevision}
                        inline
                        registration={{
                            title: tiktok ? "Registrar Cliente de TikTok Live" : "Registrar Cliente Nuevo",
                            validate: tiktokClientesService.validate,
                            ready: (!liveCapture || !!capture) && !busy,
                            missingDataMessage: liveCapture ? "adjunta la captura de TikTok Live" : undefined,
                            register: async (documento, nombre, tipo, celular, comunidad) => {
                                if (!liveCapture) return clientesNuevosService.register(documento, nombre, tipo, celular, comunidad ?? null);
                                if (!capture) throw new Error("Adjunta la captura de TikTok Live");
                                return tiktokClientesService.register(documento, nombre, tipo, celular, comunidad ?? null, capture);
                            },
                            extra: null,
                            actions: liveCapture ? (
                                <Button size="sm" color="secondary" iconLeading={Paperclip} isDisabled={busy} onClick={() => setAttaching(true)}>
                                    {capture ? "Adjuntar (1)" : "Adjuntar"}
                                </Button>
                            ) : null,
                        }}
                        onBusyChange={setBusy}
                        onCancel={() => {
                            setCapture(null);
                            setNewFormRevision((value) => value + 1);
                        }}
                        onSaved={(date) => {
                            setCapture(null);
                            setNewFormRevision((value) => value + 1);
                            notify(
                                "success",
                                liveCapture
                                    ? "Cliente TikTok Live registrado con evidencia. Se evaluará su primera operación pagada dentro de siete días."
                                    : "Cliente registrado. Se evaluará su primera operación pagada dentro de siete días.",
                            );
                            selectPeriod(
                                new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(new Date(date)),
                            );
                            setPage(1);
                            setRevision((value) => value + 1);
                        }}
                    />
                )}
                {loading && (
                    <p role="status" className="sr-only">
                        {data ? "Actualizando registros…" : "Cargando registros…"}
                    </p>
                )}
                <DataTable
                    rowAccent
                    density="compact"
                    wrapText
                    columns={[
                        ...(supervising || isAdministrator
                            ? [...clientesNuevosColumns.slice(0, 2), registradoPorColumn, ...clientesNuevosColumns.slice(2)]
                            : clientesNuevosColumns),
                        ...(data?.items.some((row) => row.estado_aprobacion) ? [captacionApprovalColumn] : []),
                        ...(conValidacionPagos ? [validacionPagosColumn] : []),
                    ]}
                    data={(data?.items ?? []).map((row) => ({
                        ...row,
                        validacion_pagos: validacionDe(row.id)?.estado,
                        canal: liveFilter
                            ? "TikTok LIVE"
                            : (row.canal ?? (row.evidencia?.some((item) => item.tipo === "IMAGEN_TIKTOK") ? "TikTok LIVE" : null)),
                    }))}
                    isLoading={loading && !data}
                    page={page}
                    totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / size))}
                    pageSize={size}
                    onPageChange={(value) => {
                        setData(null);
                        setPage(value);
                    }}
                    onPageSizeChange={(value) => {
                        setData(null);
                        setSize(value);
                        setPage(1);
                    }}
                    emptyMessage={error ? "Consulta no disponible" : "Sin clientes con estos filtros"}
                    renderActions={(row) => (
                        <div className="flex items-center gap-1">
                            {isAdministrator && Boolean(row.id_colaborador) && (
                                <>
                                    <ButtonUtility
                                        size="xs"
                                        color="tertiary"
                                        icon={Check}
                                        tooltip="Aprobar Comisión"
                                        isDisabled={loading || deciding !== null || !row.puede_resolver}
                                        className={compensationTableActionClass}
                                        aria-busy={deciding === row.id}
                                        onClick={() => void decide(row as unknown as ClienteNuevo, "APROBADO")}
                                    />
                                    <ButtonUtility
                                        size="xs"
                                        color="tertiary"
                                        icon={XClose}
                                        tooltip="Rechazar Comisión"
                                        isDisabled={loading || deciding !== null || !row.puede_resolver}
                                        className={compensationTableActionClass}
                                        aria-busy={deciding === row.id}
                                        onClick={() => void decide(row as unknown as ClienteNuevo, "RECHAZADO")}
                                    />
                                    <ButtonUtility
                                        size="xs"
                                        color="tertiary"
                                        icon={MessageSquare01}
                                        tooltip="Agregar Nota"
                                        isDisabled={loading || deciding !== null}
                                        className={compensationTableActionClass}
                                        onClick={() =>
                                            setReview({
                                                ...row,
                                                concepto_codigo: row.concepto_codigo ?? (tiktok ? "COMISION_TIKTOK_LIVE" : "COMISION_REGISTRO_EFECTIVIZACION"),
                                            } as unknown as ClienteNuevo)
                                        }
                                    />
                                </>
                            )}
                            {conValidacionPagos && validacionDe(row.id) && (
                                <ButtonUtility
                                    size="xs"
                                    color="tertiary"
                                    icon={CheckDone01}
                                    tooltip="Revisar Validación Pagos"
                                    aria-label="Revisar Validación Pagos"
                                    className={compensationTableActionClass}
                                    onClick={() => void abrirValidacion(validacionDe(row.id)!.id_evento)}
                                />
                            )}
                            {(row.evidencia as Array<{ path?: string }> | undefined)?.[0]?.path && (
                                <ButtonUtility
                                    size="xs"
                                    color="tertiary"
                                    icon={Eye}
                                    tooltip="Ver captura TikTok Live"
                                    className={compensationTableActionClass}
                                    onClick={() => setCapturePath((row.evidencia as Array<{ path: string }>)[0].path)}
                                />
                            )}
                            {!readOnly &&
                            !isAdministrator &&
                            !loading &&
                            (!supervising || row.propio === true) &&
                            canEditCliente(row as unknown as ClienteNuevo) ? (
                                <ButtonUtility
                                    size="xs"
                                    color="tertiary"
                                    icon={Edit03}
                                    tooltip="Editar cliente"
                                    className={compensationTableActionClass}
                                    onClick={() => setForm(row as unknown as ClienteNuevo)}
                                />
                            ) : null}
                            {!readOnly &&
                            !isAdministrator &&
                            !loading &&
                            (!supervising || row.propio === true) &&
                            canEditCliente(row as unknown as ClienteNuevo) ? (
                                <ButtonUtility
                                    size="xs"
                                    color="tertiary"
                                    icon={Trash01}
                                    tooltip="Eliminar cliente"
                                    className={compensationTableActionClass}
                                    onClick={() => setRemoving(row as unknown as ClienteNuevo)}
                                />
                            ) : null}
                        </div>
                    )}
                    toolbar={
                        <ClientesNuevosFiltrosBar
                            filters={filters}
                            month={month}
                            tiktok={tiktok}
                            onFilter={filter}
                            onPeriodChange={selectPeriod}
                            onClear={() => {
                                setData(null);
                                const currentMonth = currentLimaMonth();
                                setFilters(periodDates(currentMonth));
                                setQuery({ documento: "", nombre: "", colaborador: "" });
                                setMonth(currentMonth);
                                setPage(1);
                            }}
                        />
                    }
                />
                {showInfo && <CaptacionInfoDialog tiktok={tiktok} onClose={() => setShowInfo(false)} />}
                {deciding !== null && (
                    <p role="status" className="text-xs text-tertiary">
                        Verificando y guardando decisión…
                    </p>
                )}
                {attaching && (
                    <CaptacionAdjuntoDialog
                        initial={capture}
                        onClose={() => setAttaching(false)}
                        onApply={(file) => {
                            setCapture(file);
                            setAttaching(false);
                        }}
                    />
                )}
                {review && (
                    <CaptacionRevisionDialog
                        row={review}
                        onClose={() => setReview(null)}
                        onSaved={() => {
                            setReview(null);
                            setData(null);
                            setRevision((v) => v + 1);
                        }}
                    />
                )}
                {validacion && (
                    <EvidenciaDetailModal
                        item={validacion}
                        onClose={() => setValidacion(null)}
                        onChanged={() => {
                            setValidacion(null);
                            setData(null);
                            setRevision((value) => value + 1);
                        }}
                    />
                )}
                {removing && (
                    <CompensacionDeleteDialog
                        title="Eliminar cliente"
                        message={`Se eliminará el registro de ${removing.nombre || removing.documento}. Solo es posible mientras no tenga operaciones y dentro de los siete días.`}
                        onClose={() => setRemoving(null)}
                        onConfirm={async () => {
                            await clientesNuevosService.remove(removing.id);
                            setRemoving(null);
                            notify("success", "Cliente eliminado.");
                            setData(null);
                            setRevision((v) => v + 1);
                        }}
                    />
                )}
                {form && (
                    <CompensacionSurface
                        title="Editar Cliente"
                        busy={busy}
                        onClose={() => {
                            if (!busy) setForm(null);
                        }}
                    >
                        <ClienteNuevoForm
                            initial={form}
                            onCancel={() => setForm(null)}
                            onBusyChange={setBusy}
                            onSaved={(date) => {
                                notify("success", "Cliente actualizado. Se conserva la fecha original y el plazo de siete días.");
                                setForm(null);
                                selectPeriod(
                                    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(new Date(date)),
                                );
                                setPage(1);
                                setRevision((v) => v + 1);
                            }}
                        />
                    </CompensacionSurface>
                )}
                {capturePath && (
                    <CompensacionSurface title="Captura TikTok Live" onClose={() => setCapturePath(null)}>
                        <div className="mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                            <CompensacionDialogHeader title={<>Captura TikTok Live</>} onClose={() => setCapturePath(null)} />
                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                                {captureError ? (
                                    <div className="space-y-3">
                                        <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={() => setCaptureRetry((value) => value + 1)}>
                                            Reintentar captura
                                        </Button>
                                    </div>
                                ) : captureUrl ? (
                                    <img src={captureUrl} alt="Evidencia del registro TikTok Live" className="max-h-[65vh] w-full object-contain" />
                                ) : (
                                    <p role="status" className="text-sm text-tertiary">
                                        Cargando captura…
                                    </p>
                                )}
                            </div>
                        </div>
                    </CompensacionSurface>
                )}
            </div>
        </AppLayout>
    );
};
