import { useEffect, useState } from "react";
import { Check, Send01, X, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { useToast } from "@/providers/toast-provider";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaEvento } from "./evidencias.types";

interface EvidenciaDetailModalProps {
    item: EvidenciaEvento | null;
    onClose: () => void;
    onChanged: () => void;
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
const moneyFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));

const badgeColor = (status: string): "success" | "warning" | "error" | "gray" | "brand" => {
    if (["APROBADO", "LIQUIDADO", "ENVIADO"].includes(status)) return "success";
    if (["PENDIENTE", "OBSERVADO"].includes(status)) return "warning";
    if (["RECHAZADO", "ANULADO"].includes(status)) return "error";
    if (status === "BORRADOR") return "brand";
    return "gray";
};

export const EvidenciaDetailModal = ({ item, onClose, onChanged }: EvidenciaDetailModalProps) => {
    const { addToast } = useToast();
    const [comment, setComment] = useState("");
    const [base, setBase] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => { if (item) { setComment(""); setBase(""); setQuantity("1"); } }, [item]);

    const run = async (action: "SEND" | "APPROVE" | "REJECT" | "OBSERVE" | "ANNUL") => {
        if (!item) return;
        if (["REJECT", "OBSERVE", "ANNUL"].includes(action) && !comment.trim()) return addToast("error", "Ingresa el motivo o comentario");
        setIsSaving(true);
        try {
            if (action === "SEND") await evidenciasService.send(item.id, comment);
            if (action === "APPROVE") await evidenciasService.resolve(item.id, "APROBADO", comment, base ? Number(base) : null, quantity ? Number(quantity) : null);
            if (action === "REJECT") await evidenciasService.resolve(item.id, "RECHAZADO", comment, null, null);
            if (action === "OBSERVE") await evidenciasService.observe(item.id, comment);
            if (action === "ANNUL") await evidenciasService.annul(item.id, comment);
            addToast("success", action === "SEND" ? "Evidencia enviada a revisión" : "Evidencia actualizada correctamente");
            onChanged();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible actualizar la evidencia");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {item && <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} />
                <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.18 }} className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
                    <div className="flex items-start justify-between border-b border-secondary px-6 py-5"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-primary">Evidencia #{item.id}</h2><Badge size="sm" color={badgeColor(item.estado)}>{humanize(item.estado)}</Badge></div><p className="mt-1 text-sm text-tertiary">{item.tipoNombre} · {dateTimeFormatter.format(new Date(item.fechaEvento))}</p></div><Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} /></div>
                    <div className="flex-1 space-y-5 overflow-y-auto p-6">
                        <div className="grid gap-4 rounded-lg border border-secondary bg-secondary p-4 sm:grid-cols-2"><div><p className="text-xs text-tertiary">Beneficiario</p><p className="mt-1 text-sm font-medium text-primary">{item.beneficiarioNombre ?? "—"}</p><p className="text-xs text-tertiary">{item.beneficiarioDocumento ?? ""}</p></div><div><p className="text-xs text-tertiary">Sede</p><p className="mt-1 text-sm font-medium text-primary">{item.sucursalOrigenNombre ?? "—"}</p></div><div><p className="text-xs text-tertiary">Registrado por</p><p className="mt-1 text-sm font-medium text-primary">{item.usuarioRegistraNombre}</p></div><div><p className="text-xs text-tertiary">Importe aprobado</p><p className="mt-1 text-sm font-semibold text-success-primary">{moneyFormatter.format(item.importeAprobado ?? 0)}</p></div></div>
                        {(item.titulo || item.descripcion) && <div><h3 className="text-sm font-semibold text-primary">Detalle</h3><p className="mt-2 text-sm font-medium text-primary">{item.titulo}</p><p className="mt-1 whitespace-pre-wrap text-sm text-tertiary">{item.descripcion}</p></div>}
                        {item.evidencia.length > 0 && <div><h3 className="text-sm font-semibold text-primary">Sustentos ({item.evidencia.length})</h3><div className="mt-2 space-y-2">{item.evidencia.map((entry, index) => { const value = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; const url = String(value.url ?? ""); return <div key={`${url}-${index}`} className="rounded-lg border border-secondary px-3 py-2 text-sm">{url ? <a className="font-medium text-brand-secondary hover:underline" href={url} target="_blank" rel="noreferrer">Abrir evidencia {index + 1}</a> : <span className="text-tertiary">Evidencia {index + 1}</span>}</div>; })}</div></div>}
                        {item.revisiones.length > 0 && <div><h3 className="text-sm font-semibold text-primary">Historial de revisión</h3><div className="mt-2 space-y-2">{item.revisiones.map((revision) => <div key={revision.id} className="flex gap-3 rounded-lg border border-secondary p-3"><Badge size="sm" color={badgeColor(revision.decision)}>{humanize(revision.decision)}</Badge><div><p className="text-sm font-medium text-primary">{revision.usuarioRevisorNombre}</p><p className="mt-0.5 text-xs text-tertiary">{revision.fechaRegistro ? dateTimeFormatter.format(new Date(revision.fechaRegistro)) : ""}{revision.comentario ? ` · ${revision.comentario}` : ""}</p></div></div>)}</div></div>}
                        {item.estado === "PENDIENTE" && <div className="grid gap-4 border-t border-secondary pt-5 sm:grid-cols-2"><Input label="Base de cálculo" size="sm" type="number" value={base} onChange={setBase} hint="Solo es obligatoria para reglas porcentuales." /><Input label="Cantidad" size="sm" type="number" value={quantity} onChange={setQuantity} /></div>}
                        {["BORRADOR", "PENDIENTE"].includes(item.estado) && <TextArea label={item.estado === "BORRADOR" ? "Comentario de envío o motivo de anulación" : "Comentario de revisión"} size="sm" rows={3} value={comment} onChange={setComment} />}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 border-t border-secondary px-6 py-4">
                        <Button size="sm" color="secondary" onClick={onClose}>Cerrar</Button>
                        {item.estado === "BORRADOR" && <><Button size="sm" color="secondary-destructive" iconLeading={XClose} isLoading={isSaving} onClick={() => void run("ANNUL")}>Anular</Button><Button size="sm" color="primary" iconLeading={Send01} isLoading={isSaving} onClick={() => void run("SEND")}>Enviar a revisión</Button></>}
                        {item.estado === "PENDIENTE" && <><Button size="sm" color="secondary" isLoading={isSaving} onClick={() => void run("OBSERVE")}>Observar</Button><Button size="sm" color="secondary-destructive" iconLeading={XClose} isLoading={isSaving} onClick={() => void run("REJECT")}>Rechazar</Button><Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void run("APPROVE")}>Aprobar</Button></>}
                    </div>
                </motion.div>
            </div>}
        </AnimatePresence>
    );
};
