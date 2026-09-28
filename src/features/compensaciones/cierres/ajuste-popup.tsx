import { useEffect, useState } from "react";
import { Check, Plus, X, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useToast } from "@/providers/toast-provider";
import { cierresService } from "./cierres.service";
import type { AjusteCatalogo, AjusteCompensacion, AjusteCreateValues } from "./cierres.types";

interface PopupProps { isOpen: boolean; periodId: number; onClose: () => void; onSaved: () => void; }
const emptyForm = (periodId: number): AjusteCreateValues => ({ periodId, collaboratorId: 0, conceptId: 0, nature: "INGRESO", amount: 0, reason: "", evidenceUrl: "" });

export const AjustePopup = ({ isOpen, periodId, onClose, onSaved }: PopupProps) => {
    const { addToast } = useToast();
    const [catalog, setCatalog] = useState<AjusteCatalogo>({ colaboradores: [], conceptos: [] });
    const [form, setForm] = useState<AjusteCreateValues>(() => emptyForm(periodId));
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const setValue = <K extends keyof AjusteCreateValues>(key: K, value: AjusteCreateValues[K]) => setForm((current) => ({ ...current, [key]: value }));

    useEffect(() => {
        if (!isOpen || !periodId) return;
        setForm(emptyForm(periodId)); setIsLoading(true);
        cierresService.getAdjustmentCatalog(periodId).then((result) => setCatalog(result)).catch((error) => addToast("error", error instanceof Error ? error.message : "No fue posible cargar el catálogo")).finally(() => setIsLoading(false));
    }, [addToast, isOpen, periodId]);

    const selectConcept = (id: number) => { const concept = catalog.conceptos.find((item) => item.id === id); setForm((current) => ({ ...current, conceptId: id, nature: concept?.naturaleza ?? current.nature })); };
    const save = async () => {
        if (!form.collaboratorId || !form.conceptId || form.amount <= 0 || !form.reason.trim()) return addToast("error", "Colaborador, concepto, monto y motivo son obligatorios");
        setIsSaving(true);
        try { await cierresService.createAdjustment(form); addToast("success", "Ajuste enviado a revisión"); onSaved(); }
        catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible registrar el ajuste"); }
        finally { setIsSaving(false); }
    };

    return <AnimatePresence>{isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} /><motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.18 }} className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
        <div className="flex items-start justify-between border-b border-secondary px-6 py-5"><div><h2 className="text-lg font-semibold text-primary">Nuevo ajuste posterior</h2><p className="mt-1 text-sm text-tertiary">El ajuste será revisado antes de incorporarse a la liquidación.</p></div><Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} /></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {isLoading ? <p className="text-sm text-tertiary">Cargando catálogo...</p> : <div className="grid gap-4 sm:grid-cols-2"><Select label="Colaborador" size="sm" isRequired items={catalog.colaboradores.map((item) => ({ id: item.id, label: `${item.nombre} · ${item.documento} · ${item.sucursal}` }))} selectedKey={form.collaboratorId} onSelectionChange={(key) => setValue("collaboratorId", key ? Number(key) : 0)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select><Select label="Concepto" size="sm" isRequired items={catalog.conceptos.map((item) => ({ id: item.id, label: `${item.nombre} · ${item.naturaleza === "INGRESO" ? "Ingreso" : "Descuento"}` }))} selectedKey={form.conceptId} onSelectionChange={(key) => selectConcept(key ? Number(key) : 0)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select><Input label="Naturaleza" size="sm" value={form.nature === "INGRESO" ? "Ingreso" : "Descuento"} isDisabled /><Input label="Monto" size="sm" type="number" isRequired value={form.amount ? String(form.amount) : ""} onChange={(value) => setValue("amount", Number(value))} /><div className="sm:col-span-2"><Input label="Enlace de sustento" size="sm" type="url" value={form.evidenceUrl} onChange={(value) => setValue("evidenceUrl", value)} placeholder="https://..." /></div></div>}
            <TextArea label="Motivo" size="sm" rows={4} isRequired value={form.reason} onChange={(value) => setValue("reason", value)} placeholder="Explica el origen del ajuste y por qué debe aplicarse en este período" />
        </div>
        <div className="flex justify-end gap-3 border-t border-secondary px-6 py-4"><Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button><Button size="sm" color="primary" iconLeading={Plus} isLoading={isSaving} isDisabled={isLoading} onClick={() => void save()}>Registrar ajuste</Button></div>
    </motion.div></div>}</AnimatePresence>;
};

interface ActionProps { item: AjusteCompensacion | null; action: "APROBAR" | "RECHAZAR" | "ANULAR" | null; onClose: () => void; onSaved: () => void; }
export const AjusteActionModal = ({ item, action, onClose, onSaved }: ActionProps) => {
    const { addToast } = useToast(); const [comment, setComment] = useState(""); const [isSaving, setIsSaving] = useState(false);
    useEffect(() => { setComment(""); }, [item, action]);
    const execute = async () => { if (!item || !action) return; if (action !== "APROBAR" && !comment.trim()) return addToast("error", "El motivo es obligatorio"); setIsSaving(true); try { if (action === "ANULAR") await cierresService.annulAdjustment(item.id, comment); else await cierresService.decideAdjustment(item.id, action === "APROBAR" ? "APROBADO" : "RECHAZADO", comment); addToast("success", `Ajuste ${action === "APROBAR" ? "aprobado" : action === "RECHAZAR" ? "rechazado" : "anulado"}`); onSaved(); } catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible procesar el ajuste"); } finally { setIsSaving(false); } };
    return <AnimatePresence>{item && action && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} /><motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }} className="relative z-10 w-full max-w-lg rounded-xl bg-primary shadow-xl"><div className="flex items-start justify-between border-b border-secondary px-6 py-5"><div><h2 className="text-lg font-semibold text-primary">{action === "APROBAR" ? "Aprobar" : action === "RECHAZAR" ? "Rechazar" : "Anular"} ajuste #{item.id}</h2><p className="mt-1 text-sm text-tertiary">{item.colaboradorNombre} · {item.conceptoNombre}</p></div><Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} /></div><div className="p-6"><TextArea label={action === "APROBAR" ? "Comentario (opcional)" : "Motivo"} size="sm" rows={4} value={comment} onChange={setComment} /></div><div className="flex justify-end gap-3 border-t border-secondary px-6 py-4"><Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button><Button size="sm" color={action === "APROBAR" ? "primary" : "secondary-destructive"} iconLeading={action === "APROBAR" ? Check : XClose} isLoading={isSaving} onClick={() => void execute()}>{action === "APROBAR" ? "Aprobar" : action === "RECHAZAR" ? "Rechazar" : "Anular"}</Button></div></motion.div></div>}</AnimatePresence>;
};
