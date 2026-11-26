import { useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, Edit03, Trash01, XClose } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { opcionesEstado } from "@/features/compensaciones/shared/compensacion-estados";
import { fechaLima } from "../evidencias/tarjeta-tercero-form";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { alertaTempranaColumns } from "./alerta-temprana-columns";
import { MarketingCaptureForm } from "./marketing-capture-form";
import { MarketingDeleteDialog } from "./marketing-delete-dialog";
import { MarketingFilters } from "./marketing-filters";
import { emptyCapture, limaInput, marketingMessage as message } from "./marketing-form-state";
import { MarketingReviewDialog } from "./marketing-review-dialog";
import { type MarketingCaso, type MarketingOperacion, type MarketingPanel, marketingService } from "./marketing.service";

const TIPO = "ALERTA_TEMPRANA" as const;
const stateOptions = opcionesEstado("registro", ["PENDIENTE", "APROBADO", "RECHAZADO"]);

/**
 * Marketing la usa como su Auditoría Operaciones; Administración, como Alerta Temprana.
 * Valida el Jefe de Tienda y aprueba el Administrador; el servidor define quién puede cada paso.
 */
export const AlertaTempranaPage = withAlertProvider(() => {
    const notify = useAlert();
    const beginRequest = useCompensacionRequestScope();
    const { isStoreManager, isMarketing } = useCompensacionPerfil();
    const [month, setMonth] = useState(fechaLima().slice(0, 7)),
        [search, setSearch] = useState(""),
        [state, setState] = useState("");
    const [query, setQuery] = useState({ month, search: "", state: "" }),
        [page, setPage] = useState(1),
        [size, setSize] = useState(20),
        [refresh, setRefresh] = useState(0);
    const [data, setData] = useState<MarketingPanel | null>(null),
        [error, setError] = useState(""),
        [loading, setLoading] = useState(true);
    const canRegister = Boolean(data && !isStoreManager && (data.puede_registrar ?? !data.es_admin));
    const canReview = Boolean(data && (data.es_revisor ?? data.es_admin));
    const [form, setForm] = useState(emptyCapture),
        [saving, setSaving] = useState(false),
        [attempted, setAttempted] = useState(false),
        [review, setReview] = useState<MarketingCaso | null>(null),
        [reviewMode, setReviewMode] = useState<"revision" | "anulacion">("revision"),
        [reason, setReason] = useState(""),
        [decision, setDecision] = useState("APROBADO");
    const [editing, setEditing] = useState<MarketingCaso | null>(null),
        [removing, setRemoving] = useState<MarketingCaso | null>(null),
        [operations, setOperations] = useState<MarketingOperacion[]>([]),
        [lookupBusy, setLookupBusy] = useState(false);
    const lookupVersion = useRef(0);
    const canCancel = (row: Record<string, unknown>) => data?.es_admin === true && row.estado === "APROBADO" && row.puede_anular === true;
    const reviewAllowed = review && (reviewMode === "anulacion" ? canCancel(review) : canReview && review.estado === "PENDIENTE" && review.puede_revisar);
    const captureKey = useRef(crypto.randomUUID()),
        lock = useRef(false);
    useEffect(() => {
        if (month === query.month && search === query.search && state === query.state) return;
        const timer = setTimeout(() => {
            setPage(1);
            setQuery({ month, search, state });
        }, 350);
        return () => clearTimeout(timer);
    }, [month, search, state, query]);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        setData(null);
        void marketingService
            .list(TIPO, query.month, query.search, query.state, page, size)
            .then((result) => {
                if (active) setData(result);
            })
            .catch((e) => {
                if (active) setError(message(e));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [query, page, size, refresh]);
    const reset = () => {
        setAttempted(false);
        setForm(emptyCapture());
        setEditing(null);
        setOperations([]);
        ++lookupVersion.current;
        captureKey.current = crypto.randomUUID();
    };
    const set = (key: string, value: string) => {
        if (key === "dni") {
            ++lookupVersion.current;
            setOperations([]);
        }
        setForm((old) => ({ ...old, [key]: value, ...(key === "dni" ? { operacion_id: "" } : {}) }));
    };
    const lookup = async (dni: string) => {
        const version = ++lookupVersion.current;
        const current = beginRequest();
        setLookupBusy(true);
        try {
            const result = await marketingService.operations(dni);
            if (current() && version === lookupVersion.current) setOperations(result.items);
        } catch (e) {
            if (current() && version === lookupVersion.current) notify("error", message(e));
        } finally {
            if (current()) setLookupBusy(false);
        }
    };
    const edit = (row: MarketingCaso) => {
        const saved = row.captura;
        setForm({ ...emptyCapture(), ...saved, desde: limaInput(String(saved.desde || "")) });
        setEditing(row);
        setAttempted(false);
        setOperations([]);
        captureKey.current = crypto.randomUUID();
        if (saved.dni?.length === 8) void lookup(saved.dni);
    };
    const mutate = async (fn: () => Promise<unknown>, done: () => void, text: string) => {
        if (lock.current) return;
        const current = beginRequest();
        lock.current = true;
        setSaving(true);
        try {
            await fn();
            if (current()) {
                done();
                notify("success", text);
                setRefresh((v) => v + 1);
            }
        } catch (e) {
            if (current()) notify("error", message(e));
        } finally {
            lock.current = false;
            if (current()) setSaving(false);
        }
    };
    const capture = (send: boolean) => {
        if (!canRegister) return;
        setAttempted(true);
        if (form.dni && !form.operacion_id) return notify("validation", "Selecciona la operación del DNI o deja el DNI vacío.");
        if (!form.titulo.trim() || !form.descripcion.trim()) return notify("validation", "Título y descripción son obligatorios.");
        const instant = form.desde ? new Date(form.desde + "-05:00") : null;
        if (instant && Number.isNaN(instant.getTime())) return notify("validation", "Indica una fecha y hora válidas.");
        const values = { ...form, desde: instant?.toISOString() ?? "" };
        void mutate(
            () => marketingService.save(TIPO, values, captureKey.current, send, editing?.id ?? null),
            reset,
            send ? "Registro enviado a revisión" : "Borrador guardado",
        );
    };
    const openReview = (row: Record<string, unknown>, mode: "revision" | "anulacion") => {
        setReview(row as MarketingCaso);
        setReviewMode(mode);
        setReason("");
        setDecision(mode === "anulacion" ? "ANULADO" : "APROBADO");
    };
    return (
        <AppLayout>
            <div className="min-w-0 space-y-4">
                <CompensacionHeading
                    section="evidencias"
                    title={isMarketing ? "Auditoría Operaciones" : "Alerta Temprana"}
                    description="Alerta Temprana. Valida: Jefe de Tienda; aprueba: Administrador. Recién ahí nacen el bono de Marketing y la penalidad del asesor."
                />
                {error && <AlertMessage tone="error">{error}</AlertMessage>}
                <div className="grid gap-4 sm:grid-cols-3">
                    {[
                        { title: "Pendientes", value: data?.kpis.pendientes, Icon: Clock, color: "text-warning-primary" },
                        { title: "Aprobados", value: data?.kpis.aprobados, Icon: CheckCircle, color: "text-success-primary" },
                        { title: "Rechazados", value: data?.kpis.rechazados, Icon: XClose, color: "text-error-primary" },
                    ].map(({ title, value, Icon, color }) => (
                        <CompensacionPanel key={title} title={title} trailing={<Icon className={`size-5 ${color}`} />}>
                            <p className={`text-2xl font-semibold ${color}`}>{loading || error ? "—" : (value ?? 0)}</p>
                        </CompensacionPanel>
                    ))}
                </div>
                {data && canRegister && (
                    <MarketingCaptureForm
                        type={TIPO}
                        alert
                        data={data}
                        form={form}
                        editId={editing?.id ?? null}
                        hideDraft={editing?.estado === "PENDIENTE"}
                        attempted={attempted}
                        saving={saving}
                        operations={operations}
                        lookupBusy={lookupBusy}
                        set={set}
                        onOperationSelect={(id) => set("operacion_id", id == null ? "" : String(id))}
                        onLookup={() => void lookup(form.dni)}
                        onSubmit={capture}
                        onCancel={reset}
                    />
                )}
                <DataTable
                    density="compact"
                    columns={alertaTempranaColumns()}
                    data={data?.items ?? []}
                    isLoading={loading}
                    page={page}
                    totalPages={data?.total_paginas ?? 1}
                    pageSize={size}
                    onPageChange={setPage}
                    onPageSizeChange={(v) => {
                        setSize(v);
                        setPage(1);
                    }}
                    toolbar={
                        <MarketingFilters
                            search={search}
                            onSearch={setSearch}
                            state={state}
                            onState={setState}
                            stateOptions={stateOptions}
                            month={month}
                            onMonth={setMonth}
                            onClear={() => {
                                const m = fechaLima().slice(0, 7);
                                setMonth(m);
                                setSearch("");
                                setState("");
                                setQuery({ month: m, search: "", state: "" });
                                setPage(1);
                            }}
                            onRefresh={() => {
                                setQuery({ month, search, state });
                                setPage(1);
                                setRefresh((v) => v + 1);
                            }}
                        />
                    }
                    renderActions={(row) => (
                        <>
                            {canRegister && row.puede_editar === true && (
                                <>
                                    <ButtonUtility
                                        size="xs"
                                        color="tertiary"
                                        icon={Edit03}
                                        tooltip="Editar registro"
                                        className={compensationTableActionClass}
                                        onClick={() => edit(row as MarketingCaso)}
                                    />
                                    <ButtonUtility
                                        size="xs"
                                        color="tertiary"
                                        icon={Trash01}
                                        tooltip="Eliminar registro"
                                        className={compensationTableActionClass}
                                        onClick={() => setRemoving(row as MarketingCaso)}
                                    />
                                </>
                            )}
                            {canReview && row.estado === "PENDIENTE" && row.puede_revisar === true && (
                                <ButtonUtility
                                    size="xs"
                                    color="tertiary"
                                    icon={CheckCircle}
                                    tooltip="Revisar registro"
                                    className={compensationTableActionClass}
                                    onClick={() => openReview(row, "revision")}
                                />
                            )}
                            {canCancel(row) && (
                                <ButtonUtility
                                    size="xs"
                                    color="tertiary"
                                    icon={XClose}
                                    tooltip="Anular registro"
                                    className={compensationTableActionClass}
                                    onClick={() => openReview(row, "anulacion")}
                                />
                            )}
                        </>
                    )}
                />
                {removing && (
                    <MarketingDeleteDialog
                        record={removing}
                        saving={saving}
                        onClose={() => setRemoving(null)}
                        onConfirm={() =>
                            void mutate(
                                () => marketingService.remove(removing.id),
                                () => {
                                    if (editing?.id === removing.id) reset();
                                    setRemoving(null);
                                },
                                "Registro eliminado",
                            )
                        }
                    />
                )}
                {reviewAllowed && review && (
                    <MarketingReviewDialog
                        review={review}
                        mode={reviewMode}
                        saving={saving}
                        decision={decision}
                        reason={reason}
                        onDecision={setDecision}
                        onReason={setReason}
                        onClose={() => setReview(null)}
                        onSave={() =>
                            void mutate(
                                () => marketingService.review(review.id, reviewMode === "anulacion" ? "ANULADO" : decision, reason),
                                () => setReview(null),
                                reviewMode === "anulacion" ? "Registro anulado" : "Revisión guardada",
                            )
                        }
                    />
                )}
            </div>
        </AppLayout>
    );
});
