import { useEffect, useMemo, useState } from "react";
import { Check, Send01, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { useToast } from "@/providers/toast-provider";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaCatalogo, IncidenciaCreateValues } from "./incidencias.types";

interface IncidenciaPopupProps { isOpen: boolean; onClose: () => void; onSave: () => void; catalog: IncidenciaCatalogo; }
const localDateTime = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const emptyForm = (): IncidenciaCreateValues => ({ idTipoEvento: 0, idPenalidadTipo: 0, idReportante: null, idResponsable: 0, fechaEvento: localDateTime(), titulo: "", motivo: "", evidenciaUrl: "", clienteId: null, clienteDocumento: "", clienteNombre: "", operacionId: null });

export const IncidenciaPopup = ({ isOpen, onClose, onSave, catalog }: IncidenciaPopupProps) => {
    const { addToast } = useToast();
    const [form, setForm] = useState<IncidenciaCreateValues>(emptyForm);
    const [penalties, setPenalties] = useState(catalog.penalidades);
    const [isLoadingPenalties, setIsLoadingPenalties] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { result: client, isLoading: isClientLoading } = useClienteLookup(form.clienteDocumento);
    const selectedType = catalog.tipos.find((item) => item.id === form.idTipoEvento) ?? null;
    const availablePenalties = useMemo(() => selectedType?.categoria === "AUDITORIA_PAGO" ? penalties.filter((item) => item.montoBonoReportante !== null) : penalties, [penalties, selectedType?.categoria]);
    const people = (items: IncidenciaCatalogo["responsables"]) => items.map((item) => ({ id: item.id, label: `${item.nombre} · ${item.documento} · ${item.sucursal}` }));
    const setValue = <K extends keyof IncidenciaCreateValues>(key: K, value: IncidenciaCreateValues[K]) => setForm((current) => ({ ...current, [key]: value }));

    useEffect(() => { if (isOpen) { setForm({ ...emptyForm(), idTipoEvento: catalog.tipos[0]?.id ?? 0, idReportante: catalog.reportantes.length === 1 ? catalog.reportantes[0].id : null }); setPenalties([]); } }, [catalog.reportantes, catalog.tipos, isOpen]);
    useEffect(() => { setForm((current) => ({ ...current, clienteId: client?.id ?? null, clienteNombre: client?.nombre ?? (client ? current.clienteNombre : "") })); }, [client]);

    const loadPenalties = async (responsibleId: number, dateTime: string) => {
        setValue("idPenalidadTipo", 0);
        setPenalties([]);
        if (!responsibleId || !dateTime) return;
        setIsLoadingPenalties(true);
        try { const result = await incidenciasService.getCatalog(responsibleId, dateTime.slice(0, 10)); setPenalties(result.penalidades); }
        catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible consultar las penalidades aplicables"); }
        finally { setIsLoadingPenalties(false); }
    };

    const save = async (sendAfterSave: boolean) => {
        if (!selectedType || !form.idPenalidadTipo || !form.idResponsable || !form.idReportante) return addToast("error", "Tipo, penalidad, reportante y responsable son obligatorios");
        if (form.idReportante === form.idResponsable) return addToast("error", "El reportante y el responsable deben ser personas diferentes");
        if (!form.fechaEvento || !form.motivo.trim()) return addToast("error", "La fecha y el motivo son obligatorios");
        if (sendAfterSave && !form.evidenciaUrl.trim()) return addToast("error", "Adjunta un enlace de evidencia antes de enviar");
        if (selectedType.requiereCliente && !form.clienteId) return addToast("error", "Ingresa el DNI de un cliente registrado");
        if (selectedType.requiereOperacion && !form.operacionId) return addToast("error", "La operación relacionada es obligatoria");
        setIsSaving(true);
        try { const id = await incidenciasService.create(form); if (sendAfterSave) await incidenciasService.send(id); addToast("success", sendAfterSave ? "Incidencia enviada a la sede responsable" : "Incidencia guardada como borrador"); onSave(); }
        catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible registrar la incidencia"); }
        finally { setIsSaving(false); }
    };

    return <AnimatePresence>{isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.18 }} className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
            <div className="flex items-start justify-between border-b border-secondary px-6 py-5"><div><h2 className="text-lg font-semibold text-primary">Nueva incidencia</h2><p className="mt-1 text-sm text-tertiary">Reporta una penalidad o auditoría a la sede responsable.</p></div><Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} /></div>
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Tipo de incidencia" size="sm" isRequired items={catalog.tipos.map((item) => ({ id: item.id, label: item.nombre }))} selectedKey={form.idTipoEvento} onSelectionChange={(key) => { if (key !== null) { setValue("idTipoEvento", Number(key)); setValue("idPenalidadTipo", 0); } }}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>
                    <Input label="Fecha y hora" size="sm" type="datetime-local" isRequired value={form.fechaEvento} onChange={(value) => { setValue("fechaEvento", value); void loadPenalties(form.idResponsable, value); }} />
                    <Select label="Reportante" size="sm" isRequired items={people(catalog.reportantes)} selectedKey={form.idReportante ?? 0} onSelectionChange={(key) => setValue("idReportante", key ? Number(key) : null)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>
                    <Select label="Responsable" size="sm" isRequired items={people(catalog.responsables)} selectedKey={form.idResponsable} onSelectionChange={(key) => { const id = key ? Number(key) : 0; setValue("idResponsable", id); void loadPenalties(id, form.fechaEvento); }}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>
                    <Select label="Penalidad aplicable" size="sm" isRequired isDisabled={!form.idResponsable || isLoadingPenalties} placeholder={isLoadingPenalties ? "Consultando..." : "Seleccionar"} items={availablePenalties.map((item) => ({ id: item.id, label: `${item.nombre} · S/ ${item.montoReferencia.toFixed(2)}` }))} selectedKey={form.idPenalidadTipo} onSelectionChange={(key) => setValue("idPenalidadTipo", key ? Number(key) : 0)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>
                    <Input label="Título" size="sm" value={form.titulo} onChange={(value) => setValue("titulo", value)} placeholder="Opcional; se usará el nombre de la penalidad" />
                </div>
                {selectedType && (selectedType.requiereCliente || selectedType.requiereOperacion) && <section className="rounded-lg border border-secondary bg-secondary p-4"><h3 className="text-sm font-semibold text-primary">Referencia operativa</h3><div className="mt-3 grid gap-4 sm:grid-cols-2">{selectedType.requiereCliente && <><Input label="DNI del cliente" size="sm" isRequired value={form.clienteDocumento} onChange={(value) => setValue("clienteDocumento", value.replace(/\D/g, "").slice(0, 8))} hint={isClientLoading ? "Buscando cliente..." : client ? `Cliente encontrado: ${client.nombre}` : form.clienteDocumento.length === 8 ? "Cliente no encontrado" : undefined} /><Input label="Cliente" size="sm" value={form.clienteNombre} onChange={(value) => setValue("clienteNombre", value)} isDisabled={Boolean(client)} /></>}{selectedType.requiereOperacion && <Input label="Código de operación" size="sm" type="number" isRequired value={form.operacionId?.toString() ?? ""} onChange={(value) => setValue("operacionId", value ? Number(value) : null)} />}</div></section>}
                <Input label="Enlace de evidencia" size="sm" type="url" value={form.evidenciaUrl} onChange={(value) => setValue("evidenciaUrl", value)} hint="Es obligatorio para enviar la incidencia a revisión." />
                <TextArea label="Motivo" size="sm" rows={4} isRequired value={form.motivo} onChange={(value) => setValue("motivo", value)} placeholder="Describe el error, contexto y criterio aplicado" />
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-secondary px-6 py-4"><Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button><Button size="sm" color="secondary" iconLeading={Check} isLoading={isSaving} onClick={() => void save(false)}>Guardar borrador</Button><Button size="sm" color="primary" iconLeading={Send01} isLoading={isSaving} onClick={() => void save(true)}>Guardar y enviar</Button></div>
        </motion.div>
    </div>}</AnimatePresence>;
};
