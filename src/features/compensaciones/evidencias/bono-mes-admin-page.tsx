import { useEffect, useState } from "react";
import { CheckCircle, InfoCircle, RefreshCw01 } from "@untitledui/icons";
import { AppLayout } from "@/components/application/app-layout";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert, withAlertProvider } from "@/components/shared/alert-center";
import { type ColumnDef } from "@/components/shared/data-table";
import { CompensacionDataTable as DataTable } from "@/features/compensaciones/shared/compensacion-data-table";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { textosEstado } from "@/features/compensaciones/shared/compensacion-estados";
import { CompensacionHeading } from "../shared/compensacion-heading";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { type BonoMesCandidato, type SeleccionBonoMes, getSeleccionBonoMes, validarSeleccionBonoMes } from "./bono-automatico.service";
import type { EvidenciaTipo } from "./evidencias.types";
import { fechaLima } from "./tarjeta-tercero-form";

const estadoLabel: Record<SeleccionBonoMes["estado"], string> = {
    SIN_CANDIDATOS: "Sin candidatos elegibles",
    ASISTENCIA_PENDIENTE: "Falta confirmar la puntualidad del mes",
    DESEMPATE_ADMINISTRATIVO: "Desempate requiere revisión",
    PRESELECCION_VALIDABLE: "Preselección lista para validar",
};

export const BonoMesAdminPage = withAlertProvider(({ type }: { type: EvidenciaTipo }) => {
    const notify = useAlert();

    const [month, setMonth] = useState(() => fechaLima().slice(0, 7));
    const [refresh, setRefresh] = useState(0);
    const [data, setData] = useState<SeleccionBonoMes | null>(null);
    const [busy, setBusy] = useState(true);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [justification, setJustification] = useState("");

    const [error, setError] = useState("");
    const [branch, setBranch] = useState("");
    const [collaborator, setCollaborator] = useState(0);
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    useEffect(() => {
        let active = true;
        setBusy(true);
        setError("");
        setData(null);
        getSeleccionBonoMes(type.codigo, month)
            .then((result) => {
                if (active) setData(result);
            })
            .catch((cause) => {
                if (active) setError(cause?.message ?? "No se pudo calcular la preselección");
            })
            .finally(() => {
                if (active) setBusy(false);
            });
        return () => {
            active = false;
        };
    }, [month, refresh, type.codigo]);

    const validate = async (candidateId: number, needsJustification: boolean) => {
        if (needsJustification && justification.trim().length < 10) {
            setError("Para resolver un empate, escribe una justificación de al menos 10 caracteres.");
            return;
        }
        setSavingId(candidateId);
        setError("");

        try {
            const result = await validarSeleccionBonoMes(type.codigo, month, candidateId, justification);
            notify("success", `Reconocimiento validado por S/ ${Number(result.importe).toFixed(2)}. Se incorporará a la preliquidación del mes.`);
            setJustification("");
            setRefresh((value) => value + 1);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "No fue posible validar el reconocimiento.");
        } finally {
            setSavingId(null);
        }
    };

    const candidates = data?.candidatos ?? [];
    const resultKey = (candidate: BonoMesCandidato) =>
        !candidate.elegible ? "NO_ELEGIBLE" : candidate.requiere_desempate ? "EMPATE" : candidate.es_preseleccionado ? "PRESELECCION" : "ELEGIBLE";
    const resultLabels = textosEstado("elegibilidad", ["PRESELECCION", "EMPATE", "ELEGIBLE", "NO_ELEGIBLE"]);
    const branches = [...new Set(candidates.map((candidate) => candidate.sede))].sort((a, b) => a.localeCompare(b, "es-PE"));
    const collaborators = candidates.filter((candidate) => !branch || candidate.sede === branch);
    const filtered = candidates.filter(
        (candidate) =>
            (!branch || candidate.sede === branch) &&
            (!collaborator || candidate.id_colaborador === collaborator) &&
            (!status || resultKey(candidate) === status),
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const visiblePage = Math.min(page, totalPages);
    const columns: ColumnDef[] = [
        { key: "puesto", header: "Cargo", width: "6%", render: (value) => (value == null ? "—" : String(value)) },
        {
            key: "nombre",
            header: "Colaborador",
            width: "23%",
            render: (value, row) => (
                <div>
                    <p className="font-medium text-primary">{String(value)}</p>
                    <p className="mt-1 text-xs text-tertiary tabular-nums">{String(row.documento)}</p>
                </div>
            ),
        },
        { key: "sede", header: "Sede", width: "11%" },
        { key: "atenciones", header: "Atenciones", width: "10%" },
        { key: "calificaciones_4_5", header: "Calificaciones 4–5", width: "12%" },
        { key: "minutos_tarde", header: "Min. tarde", width: "9%", render: (value) => `${Number(value)} min` },
        {
            key: "importe_referencia",
            header: "Monto",
            width: "10%",
            render: (value) =>
                value == null ? (
                    <span className="text-tertiary">Sin tarifa</span>
                ) : (
                    <span className="font-semibold text-primary">S/ {Number(value).toFixed(2)}</span>
                ),
        },
        {
            key: "resultado",
            header: "Estado",
            width: "13%",
            render: (_value, row) => {
                const candidate = candidates.find((item) => item.id_colaborador === row.id)!;
                const result = resultKey(candidate);
                return <CompensacionEstado dominio="elegibilidad" valor={result} />;
            },
        },
    ];
    return (
        <AppLayout>
            <div className="flex min-w-0 flex-col gap-4 [&_td]:text-xs">
                <CompensacionHeading section="evidencias" title={type.nombre} description="Revisa los candidatos y valida el reconocimiento mensual." />
                {error && <AlertMessage tone="error">{error}</AlertMessage>}

                <div className="grid gap-4 sm:grid-cols-3">
                    {[
                        ["Candidatos", candidates.length, "text-primary"],
                        ["Elegibles", candidates.filter((candidate) => candidate.elegible).length, "text-success-primary"],
                        [
                            "Bono de referencia",
                            data?.importe_referencia == null ? "Por confirmar" : `S/ ${Number(data.importe_referencia).toFixed(2)}`,
                            "text-brand-secondary",
                        ],
                    ].map(([label, value, tone]) => (
                        <article key={label} className="rounded-xl border border-secondary bg-primary px-4 py-3 shadow-xs">
                            <p className="text-xs text-tertiary">{label}</p>
                            <p className={`mt-1 text-display-xs font-semibold ${tone}`}>{busy ? "—" : error ? "—" : value}</p>
                        </article>
                    ))}
                </div>
                {data && (
                    <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-secondary bg-primary px-4 py-3">
                        <h2 className="text-sm font-semibold text-primary">{estadoLabel[data.estado]}</h2>
                        <ButtonUtility
                            size="xs"
                            color="tertiary"
                            icon={InfoCircle}
                            aria-label="Ver criterios de selección"
                            tooltip={`${data.criterio_principal}. Elegibilidad: ${data.elegibilidad}. Desempate: ${data.desempate}.`}
                            className={compensationTableActionClass}
                        />
                    </section>
                )}
                {data?.estado === "ASISTENCIA_PENDIENTE" && (
                    <p className="border-warning-secondary rounded-lg border bg-primary px-4 py-3 text-sm text-warning-primary">
                        Confirma la puntualidad del mes para habilitar la selección.
                    </p>
                )}
                {data?.estado === "DESEMPATE_ADMINISTRATIVO" && (
                    <div className="border-warning-secondary rounded-xl border bg-primary p-4">
                        <TextArea
                            label="Justificación para resolver el empate"
                            value={justification}
                            onChange={setJustification}
                            rows={3}
                            maxLength={1000}
                            isDisabled={savingId !== null}
                            placeholder="Registra el motivo de la decisión administrativa"
                            hint="Mínimo 10 caracteres. Se guardará en el historial."
                        />
                    </div>
                )}
                <DataTable
                    density="compact"
                    wrapText
                    columns={columns}
                    data={filtered
                        .slice((visiblePage - 1) * pageSize, visiblePage * pageSize)
                        .map((candidate) => ({ ...candidate, id: candidate.id_colaborador }))}
                    isLoading={busy}
                    page={visiblePage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                    emptyMessage={error ? "Consulta no disponible" : "No hay candidatos para los filtros seleccionados"}
                    emptyDescription="Revisa el mes y los filtros."
                    toolbar={
                        <div className="flex flex-wrap items-end gap-2">
                            <MonthPicker
                                label="Mes evaluado"
                                value={month}
                                allowAllMonths={false}
                                onChange={(value) => {
                                    setMonth(value);
                                    setBranch("");
                                    setCollaborator(0);
                                    setJustification("");

                                    setPage(1);
                                }}
                            />
                            <div className="w-40">
                                <Select
                                    label="Sede"
                                    size="sm"
                                    selectedKey={branch}
                                    isDisabled={busy}
                                    items={[{ id: "", label: "Todas las sedes" }, ...branches.map((value) => ({ id: value, label: value }))]}
                                    onSelectionChange={(key) => {
                                        setBranch(String(key ?? ""));
                                        setCollaborator(0);
                                        setPage(1);
                                    }}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <div className="w-64">
                                <Select
                                    label="Colaborador"
                                    size="sm"
                                    selectedKey={collaborator}
                                    isDisabled={busy}
                                    items={[
                                        { id: 0, label: "Todos los colaboradores" },
                                        ...collaborators.map((candidate) => ({
                                            id: candidate.id_colaborador,
                                            label: `${candidate.nombre} · ${candidate.documento}`,
                                        })),
                                    ]}
                                    onSelectionChange={(key) => {
                                        setCollaborator(Number(key) || 0);
                                        setPage(1);
                                    }}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <div className="w-44">
                                <Select
                                    label="Estado"
                                    size="sm"
                                    selectedKey={status}
                                    items={[{ id: "", label: "Todos los estados" }, ...Object.entries(resultLabels).map(([id, label]) => ({ id, label }))]}
                                    onSelectionChange={(key) => {
                                        setStatus(String(key ?? ""));
                                        setPage(1);
                                    }}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <Button
                                size="sm"
                                color="primary"
                                iconLeading={RefreshCw01}
                                isDisabled={busy || savingId !== null}
                                onClick={() => setRefresh((value) => value + 1)}
                            >
                                Actualizar
                            </Button>
                        </div>
                    }
                    renderActions={(row) => {
                        const candidate = candidates.find((item) => item.id_colaborador === row.id)!;
                        return (
                            <div className="flex items-center gap-1">
                                <ButtonUtility
                                    size="xs"
                                    color="tertiary"
                                    icon={InfoCircle}
                                    tooltip={candidate.motivo_elegibilidad ?? candidate.estado_puntualidad}
                                    aria-label={`Ver detalle de ${candidate.nombre}`}
                                    className={compensationTableActionClass}
                                />
                                {data?.estado !== "ASISTENCIA_PENDIENTE" &&
                                    candidate.elegible &&
                                    (candidate.es_preseleccionado || candidate.requiere_desempate) && (
                                        <ButtonUtility
                                            size="xs"
                                            color="tertiary"
                                            icon={CheckCircle}
                                            tooltip={candidate.requiere_desempate ? "Resolver y validar" : "Validar preselección"}
                                            className={compensationTableActionClass}
                                            isDisabled={busy || savingId !== null}
                                            onClick={() => void validate(candidate.id_colaborador, candidate.requiere_desempate)}
                                        />
                                    )}
                            </div>
                        );
                    }}
                />
            </div>
        </AppLayout>
    );
});
