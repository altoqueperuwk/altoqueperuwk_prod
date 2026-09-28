import { useEffect, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useToast } from "@/providers/toast-provider";
import { asistenciaService } from "./asistencia.service";
import type { AsistenciaJornada } from "./asistencia.types";

interface AsistenciaCorrectionModalProps { isOpen: boolean; onClose: () => void; onSave: () => void; jornada: AsistenciaJornada | null; }

const toLocalInput = (value: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
const toLimaIso = (value: string) => value ? `${value}:00-05:00` : null;

export const AsistenciaCorrectionModal = ({ isOpen, onClose, onSave, jornada }: AsistenciaCorrectionModalProps) => {
    const { addToast } = useToast();
    const [entry, setEntry] = useState("");
    const [exit, setExit] = useState("");
    const [status, setStatus] = useState("PENDIENTE");
    const [observation, setObservation] = useState("");
    const [reason, setReason] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !jornada) return;
        setEntry(toLocalInput(jornada.entradaReal));
        setExit(toLocalInput(jornada.salidaReal));
        setStatus(jornada.estadoDia);
        setObservation(jornada.observacion ?? "");
        setReason("");
    }, [isOpen, jornada]);

    const save = async () => {
        if (!jornada) return;
        if (!reason.trim()) return addToast("error", "El motivo de la corrección es obligatorio");
        setIsSaving(true);
        try {
            await asistenciaService.createSolicitud(jornada.id, { entrada_real: toLimaIso(entry), salida_real: toLimaIso(exit), estado_dia: status, observacion: observation || null }, reason.trim());
            addToast("success", "Solicitud de corrección registrada");
            onSave();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible registrar la corrección");
        } finally { setIsSaving(false); }
    };

    return <AnimatePresence>{isOpen && jornada && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70" onClick={onClose} /><motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.15 }} className="relative z-10 w-full max-w-xl rounded-xl bg-primary p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold text-primary">Solicitar corrección</h2><p className="mt-1 text-sm text-tertiary">{jornada.colaboradorNombre} · {jornada.fecha}</p></div><Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Input label="Entrada" type="datetime-local" size="sm" value={entry} onChange={setEntry} /><Input label="Salida" type="datetime-local" size="sm" value={exit} onChange={setExit} /><Select label="Estado del día" size="sm" items={["COMPLETO", "FALTA_ENTRADA", "FALTA_SALIDA", "AUSENTE", "DESCANSO", "VACACIONES", "LICENCIA", "JUSTIFICADO", "PENDIENTE"].map((value) => ({ id: value, label: value.replaceAll("_", " ") }))} selectedKey={status} onSelectionChange={(key) => key !== null && setStatus(String(key))}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select><div className="sm:col-span-2"><TextArea label="Observación solicitada" size="sm" rows={2} value={observation} onChange={setObservation} /></div><div className="sm:col-span-2"><TextArea label="Motivo" size="sm" rows={3} isRequired value={reason} onChange={setReason} /></div></div><div className="mt-6 flex justify-end gap-3"><Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button><Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void save()}>Enviar solicitud</Button></div></motion.div></div>}</AnimatePresence>;
};
