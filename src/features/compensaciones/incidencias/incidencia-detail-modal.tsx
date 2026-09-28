import { useEffect, useState } from "react";
import { Check, Send01, X, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { useToast } from "@/providers/toast-provider";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaEvento } from "./incidencias.types";

interface Props { item: IncidenciaEvento | null; onClose: () => void; onChanged: () => void; }
const dateTime = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const color = (value: string): "success" | "warning" | "error" | "brand" | "gray" => ["APROBADO", "LIQUIDADO", "ENVIADO"].includes(value) ? "success" : ["PENDIENTE", "OBSERVADO"].includes(value) ? "warning" : ["RECHAZADO", "ANULADO"].includes(value) ? "error" : value === "BORRADOR" ? "brand" : "gray";

export const IncidenciaDetailModal = ({ item, onClose, onChanged }: Props) => {
    const { addToast } = useToast();
    const [comment, setComment] = useState("");
    const [evidenceUrl, setEvidenceUrl] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    useEffect(() => { if (item) { setComment(""); setEvidenceUrl(""); } }, [item]);
    const execute = async (action: "SEND" | "DISCHARGE" | "APPROVE" | "REJECT" | "OBSERVE" | "ANNUL") => {
        if (!item) return;
        if (["DISCHARGE", "REJECT", "OBSERVE", "ANNUL"].includes(action) && !comment.trim()) return addToast("error", "Ingresa el comentario o motivo");
        setIsSaving(true);
        try { if (action === "SEND") await incidenciasService.send(item.id, comment); if (action === "DISCHARGE") await incidenciasService.discharge(item.id, comment, evidenceUrl); if (action === "APPROVE") await incidenciasService.resolve(item.id, "APROBADO", comment); if (action === "REJECT") await incidenciasService.resolve(item.id, "RECHAZADO", comment); if (action === "OBSERVE") await incidenciasService.observe(item.id, comment); if (action === "ANNUL") await incidenciasService.annul(item.id, comment); addToast("success", "Incidencia actualizada correctamente"); onChanged(); }
        catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible actualizar la incidencia"); }
        finally { setIsSaving(false); }
    };
    const latestSendStep = item?.revisiones.reduce((latest, revision) => revision.decision === "ENVIADO" ? Math.max(latest, revision.numeroPaso) : latest, 0) ?? 0;
    const hasDischarge = item?.revisiones.some((revision) => revision.etapa === "DESCARGO" && revision.numeroPaso > latestSendStep) ?? false;

    return <AnimatePresence>{item && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} /><motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.18 }} className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
        <div className="flex items-start justify-between border-b border-secondary px-6 py-5"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-primary">Incidencia #{item.id}</h2><Badge size="sm" color={color(item.estado)}>{humanize(item.estado)}</Badge></div><p className="mt-1 text-sm text-tertiary">{item.penalidadNombre} · {dateTime.format(new Date(item.fechaEvento))}</p></div><Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} /></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div className="grid gap-4 rounded-lg border border-secondary bg-secondary p-4 sm:grid-cols-2"><div><p className="text-xs text-tertiary">Reportante</p><p className="mt-1 text-sm font-medium text-primary">{item.reportanteNombre ?? "—"}</p><p className="text-xs text-tertiary">{item.sucursalOrigenNombre ?? "—"}</p></div><div><p className="text-xs text-tertiary">Responsable</p><p className="mt-1 text-sm font-medium text-primary">{item.responsableNombre}</p><p className="text-xs text-tertiary">{item.sucursalResponsableNombre ?? "—"}</p></div><div><p className="text-xs text-tertiary">Descuento</p><p className="mt-1 text-sm font-semibold text-error-primary">{money.format(item.montoReferencia)}</p></div><div><p className="text-xs text-tertiary">Bono al reportante</p><p className="mt-1 text-sm font-semibold text-success-primary">{money.format(item.montoBonoReportante ?? 0)}</p></div></div>
            <div><h3 className="text-sm font-semibold text-primary">Motivo</h3><p className="mt-2 whitespace-pre-wrap text-sm text-tertiary">{item.motivo ?? "—"}</p></div>
            {item.evidencia.length > 0 && <div><h3 className="text-sm font-semibold text-primary">Evidencia</h3><div className="mt-2 space-y-2">{item.evidencia.map((entry, index) => { const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; const url = String(row.url ?? ""); return <div key={`${url}-${index}`} className="rounded-lg border border-secondary px-3 py-2">{url ? <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-secondary hover:underline">Abrir sustento {index + 1}</a> : <span className="text-sm text-tertiary">Sustento {index + 1}</span>}</div>; })}</div></div>}
            {item.revisiones.length > 0 && <div><h3 className="text-sm font-semibold text-primary">Trazabilidad</h3><div className="mt-2 space-y-2">{item.revisiones.map((revision) => <div key={revision.id} className="flex gap-3 rounded-lg border border-secondary p-3"><Badge size="sm" color={color(revision.decision)}>{humanize(revision.decision)}</Badge><div><p className="text-sm font-medium text-primary">{revision.usuarioRevisorNombre}</p><p className="mt-0.5 text-xs text-tertiary">{revision.fechaRegistro ? dateTime.format(new Date(revision.fechaRegistro)) : ""}{revision.comentario ? ` · ${revision.comentario}` : ""}</p></div></div>)}</div></div>}
            {["BORRADOR", "PENDIENTE"].includes(item.estado) && <div className="space-y-4 border-t border-secondary pt-5"><TextArea label="Comentario" size="sm" rows={3} value={comment} onChange={setComment} />{item.estado === "PENDIENTE" && item.requiereRespuesta && !hasDischarge && <Input label="Evidencia del descargo" size="sm" type="url" placeholder="https://..." value={evidenceUrl} onChange={setEvidenceUrl} />}</div>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-secondary px-6 py-4"><Button size="sm" color="secondary" onClick={onClose}>Cerrar</Button>{item.estado === "BORRADOR" && <><Button size="sm" color="secondary-destructive" iconLeading={XClose} isLoading={isSaving} onClick={() => void execute("ANNUL")}>Anular</Button><Button size="sm" color="primary" iconLeading={Send01} isLoading={isSaving} onClick={() => void execute("SEND")}>Enviar</Button></>}{item.estado === "PENDIENTE" && <>{item.requiereRespuesta && <Button size="sm" color="secondary" isDisabled={hasDischarge} isLoading={isSaving} onClick={() => void execute("DISCHARGE")}>{hasDischarge ? "Descargo presentado" : "Presentar descargo"}</Button>}<Button size="sm" color="secondary" isLoading={isSaving} onClick={() => void execute("OBSERVE")}>Observar</Button><Button size="sm" color="secondary-destructive" iconLeading={XClose} isLoading={isSaving} onClick={() => void execute("REJECT")}>Rechazar</Button><Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void execute("APPROVE")}>Aprobar</Button></>}</div>
    </motion.div></div>}</AnimatePresence>;
};
