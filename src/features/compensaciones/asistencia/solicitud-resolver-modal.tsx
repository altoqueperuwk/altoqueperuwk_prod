import { useEffect, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { useToast } from "@/providers/toast-provider";
import { asistenciaService } from "./asistencia.service";
import type { AsistenciaSolicitud } from "./asistencia.types";

interface SolicitudResolverModalProps { solicitud: AsistenciaSolicitud | null; decision: "APROBADA" | "RECHAZADA" | null; onClose: () => void; onSave: () => void; }

export const SolicitudResolverModal = ({ solicitud, decision, onClose, onSave }: SolicitudResolverModalProps) => {
    const { addToast } = useToast();
    const [reason, setReason] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    useEffect(() => { if (solicitud && decision) setReason(""); }, [decision, solicitud]);
    const save = async () => {
        if (!solicitud || !decision) return;
        if (!reason.trim()) return addToast("error", "El motivo de resolución es obligatorio");
        setIsSaving(true);
        try { await asistenciaService.resolveSolicitud(solicitud.id, decision, reason.trim()); addToast("success", decision === "APROBADA" ? "Corrección aprobada y aplicada" : "Corrección rechazada"); onSave(); }
        catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible resolver la solicitud"); }
        finally { setIsSaving(false); }
    };
    return <AnimatePresence>{solicitud && decision && <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-overlay/70" onClick={onClose} /><motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="relative z-10 w-full max-w-md rounded-xl bg-primary p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold text-primary">{decision === "APROBADA" ? "Aprobar corrección" : "Rechazar corrección"}</h2><p className="mt-1 text-sm text-tertiary">{solicitud.colaboradorNombre} · {solicitud.fecha}</p></div><Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} /></div><div className="mt-5 rounded-lg bg-secondary p-3 text-sm text-secondary"><p className="font-medium text-primary">Motivo solicitado</p><p className="mt-1">{solicitud.motivo}</p></div><div className="mt-4"><TextArea label="Motivo de resolución" size="sm" rows={3} isRequired value={reason} onChange={setReason} /></div><div className="mt-6 flex justify-end gap-3"><Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button><Button size="sm" color={decision === "APROBADA" ? "primary" : "primary-destructive"} iconLeading={Check} isLoading={isSaving} onClick={() => void save()}>{decision === "APROBADA" ? "Aprobar" : "Rechazar"}</Button></div></motion.div></div>}</AnimatePresence>;
};

