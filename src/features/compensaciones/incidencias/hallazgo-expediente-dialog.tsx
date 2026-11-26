import { useEffect, useRef, useState } from "react";
import { RefreshCw01, Save01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { estadoVisual } from "@/features/compensaciones/shared/compensacion-estados";
import { NombreCell } from "../shared/compensacion-cells";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { type Expediente, seguimientoJefaturaService } from "../shared/seguimiento-jefatura.service";
import { incidenciasService } from "./incidencias.service";

const money = (amount: number | null) =>
    amount == null ? "Por confirmar" : new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(amount);
const message = (error: unknown) => (error instanceof Error ? error.message : "No se pudo consultar el expediente");
const localTime = (value: string) => new Date(new Date(value).getTime() - 5 * 3600_000).toISOString().slice(0, 16);
export const HallazgoExpedienteDialog = ({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged?: () => void }) => {
    const notify = useAlert();
    const [data, setData] = useState<Expediente | null>(null),
        [error, setError] = useState(""),
        [refresh, setRefresh] = useState(0);
    const [busy, setBusy] = useState(false),
        [loading, setLoading] = useState(true);
    const [state, setState] = useState("PENDIENTE"),
        [date, setDate] = useState(""),
        [person, setPerson] = useState(""),
        [before, setBefore] = useState(false),
        [note, setNote] = useState(""),
        [response, setResponse] = useState("");
    const lock = useRef(false);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setData(null);
        setError("");
        setResponse("");
        seguimientoJefaturaService
            .expediente(id)
            .then((value) => {
                if (!active) return;
                setData(value);
                setState(value.correccion?.estado ?? "PENDIENTE");
                setNote(value.correccion?.nota ?? "");
                setBefore(value.correccion?.antes_escalamiento ?? false);
                setPerson(String(value.correccion?.id_colaborador_corrige ?? value.id_responsable ?? ""));
                setDate(localTime(value.correccion?.fecha_correccion ?? new Date().toISOString()));
            })
            .catch((cause) => {
                if (active) setError(message(cause));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id, refresh]);
    const save = async (discharge: boolean) => {
        if (!data || lock.current || loading) return;
        lock.current = true;
        setBusy(true);
        try {
            if (discharge) await incidenciasService.discharge(data.id, response, "");
            else
                await seguimientoJefaturaService.corregir(data.id_origen, {
                    estado: state,
                    fecha: state === "CORREGIDO" && date ? new Date(`${date}-05:00`).toISOString() : null,
                    antes: before,
                    corrige: person ? Number(person) : null,
                    nota: note,
                    version: data.correccion?.version ?? 0,
                });
            notify("success", discharge ? "Descargo enviado a revisión" : "Seguimiento de corrección guardado");
            setRefresh((value) => value + 1);
            onChanged?.();
        } catch (cause) {
            notify("error", message(cause));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <CompensacionSurface title="Expediente del Hallazgo" onClose={onClose} busy={busy}>
            <section className="flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title="Expediente del Hallazgo" onClose={onClose} busy={busy} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {loading && (
                        <p role="status" className="text-sm text-tertiary">
                            Consultando expediente…
                        </p>
                    )}
                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                    {data && (
                        <>
                            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                <div className="sm:col-span-2">
                                    <p className="text-xs text-tertiary">Hallazgo</p>
                                    <p className="text-primary">{data.titulo}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-tertiary">Reportante</p>
                                    <p className="text-primary">
                                        <NombreCell value={data.reportante ?? "Administración"} />
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-tertiary">Colaborador</p>
                                    <p className="text-primary">
                                        <NombreCell value={data.colaborador} />
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm whitespace-pre-wrap text-secondary">{data.motivo}</p>
                            {data.es_hallazgo && (
                                <CompensacionPanel title="Corrección del Hallazgo">
                                    {data.puede_corregir ? (
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-end gap-3">
                                                <div className="min-w-40 flex-1">
                                                    <Select
                                                        label="Estado"
                                                        size="sm"
                                                        selectedKey={state}
                                                        onSelectionChange={(key) => setState(String(key))}
                                                        items={[
                                                            { id: "PENDIENTE", label: estadoVisual("correccion", "PENDIENTE").label },
                                                            { id: "CORREGIDO", label: estadoVisual("correccion", "CORREGIDO").label },
                                                        ]}
                                                    >
                                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                    </Select>
                                                </div>
                                                <div className="min-w-48 flex-1">
                                                    <Select
                                                        label="Corregido por"
                                                        size="sm"
                                                        selectedKey={person}
                                                        onSelectionChange={(key) => setPerson(String(key))}
                                                        items={[
                                                            { id: String(data.id_responsable), label: data.colaborador ?? "Colaborador" },
                                                            { id: String(data.id_reportante), label: data.reportante ?? "Jefe de Sede" },
                                                        ]}
                                                    >
                                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                    </Select>
                                                </div>
                                                <div className="w-56">
                                                    <Input label="Fecha de Corrección" type="datetime-local" size="sm" value={date} onChange={setDate} />
                                                </div>
                                            </div>
                                            <TextArea label="Detalle de Corrección" value={note} onChange={setNote} />
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <Checkbox label="Corregido antes de escalar a Pagos / Facturación" isSelected={before} onChange={setBefore} />
                                                <Button
                                                    size="sm"
                                                    color="primary"
                                                    iconLeading={Save01}
                                                    isDisabled={busy || note.trim().length < 5 || (state === "CORREGIDO" && (!date || !person))}
                                                    onClick={() => void save(false)}
                                                >
                                                    Guardar Corrección
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1 text-sm text-secondary">
                                            <CompensacionEstado dominio="correccion" valor={data.correccion?.estado ?? "PENDIENTE"} />
                                            {data.correccion && (
                                                <>
                                                    <div>
                                                        {data.correccion.colaborador}
                                                        <CompensacionFechaCell value={data.correccion.fecha_correccion} />
                                                    </div>
                                                    <p>{data.correccion.nota}</p>
                                                    <p>{data.correccion.antes_escalamiento ? "Antes de escalar" : "Sin confirmación previa al escalamiento"}</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </CompensacionPanel>
                            )}
                            <CompensacionPanel title="Consecuencias Autorizadas">
                                <div className="space-y-2">
                                    {data.consecuencias.map((item) => (
                                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-secondary pb-2 text-sm">
                                            <span className="min-w-0 flex-1 text-secondary">
                                                {item.tipo} · {item.titulo}
                                            </span>
                                            <span className="text-primary tabular-nums">{money(item.importe)}</span>
                                            <CompensacionEstado dominio="registro" valor={item.estado} />
                                        </div>
                                    ))}
                                </div>
                            </CompensacionPanel>
                            <CompensacionPanel title="Historial y Descargos">
                                <div className="space-y-3 text-xs text-secondary">
                                    {data.historial.length ? (
                                        data.historial.map((item, index) => (
                                            <div key={index} className="grid gap-1 border-b border-secondary pb-2 sm:grid-cols-[9rem_1fr]">
                                                <CompensacionFechaCell value={item.fecha} />
                                                <div>
                                                    <p className="font-medium text-primary">
                                                        {item.etapa} · {item.decision} · {item.usuario}
                                                    </p>
                                                    <p className="whitespace-pre-wrap">{item.comentario || "Sin comentario"}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p>Sin decisiones registradas.</p>
                                    )}
                                </div>
                                {data.puede_descargo && (
                                    <div className="mt-3 space-y-3">
                                        <TextArea label="Mi Descargo" value={response} onChange={setResponse} />
                                        <Button
                                            size="sm"
                                            color="primary"
                                            iconLeading={Save01}
                                            isDisabled={busy || !response.trim()}
                                            onClick={() => void save(true)}
                                        >
                                            Enviar Descargo
                                        </Button>
                                    </div>
                                )}
                            </CompensacionPanel>
                        </>
                    )}
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="primary" iconLeading={RefreshCw01} isDisabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>
                        Actualizar
                    </Button>
                </CompensacionDialogFooter>
            </section>
        </CompensacionSurface>
    );
};
