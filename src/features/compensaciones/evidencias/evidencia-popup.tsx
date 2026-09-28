import { useEffect, useMemo, useState } from "react";
import { Check, Send01, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { useToast } from "@/providers/toast-provider";
import type { Colaborador } from "../colaboradores/colaboradores.types";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaCreateValues, EvidenciaTipo } from "./evidencias.types";

interface EvidenciaPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    types: EvidenciaTipo[];
    collaborators: Colaborador[];
}

const localDateTime = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
};

const emptyForm = (): EvidenciaCreateValues => ({
    idTipoEvento: 0,
    fechaEvento: localDateTime(),
    idBeneficiario: null,
    idResponsable: null,
    titulo: "",
    descripcion: "",
    clienteId: null,
    clienteDocumento: "",
    clienteNombre: "",
    operacionId: null,
    evidenciaUrl: "",
    estrellas: null,
});

export const EvidenciaPopup = ({ isOpen, onClose, onSave, types, collaborators }: EvidenciaPopupProps) => {
    const { addToast } = useToast();
    const [form, setForm] = useState<EvidenciaCreateValues>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const { result: client, isLoading: isClientLoading } = useClienteLookup(form.clienteDocumento);
    const selectedType = types.find((item) => item.id === form.idTipoEvento) ?? null;
    const collaboratorItems = useMemo(() => collaborators.map((item) => ({ id: item.id, label: `${item.nombreCompleto} · ${item.numeroDocumento}` })), [collaborators]);

    useEffect(() => {
        if (!isOpen) return;
        setForm({ ...emptyForm(), idTipoEvento: types[0]?.id ?? 0 });
    }, [isOpen, types]);

    useEffect(() => {
        setForm((current) => ({
            ...current,
            clienteId: client?.id ?? null,
            clienteNombre: client?.nombre ?? (client ? current.clienteNombre : ""),
        }));
    }, [client]);

    const setValue = <K extends keyof EvidenciaCreateValues>(key: K, value: EvidenciaCreateValues[K]) => setForm((current) => ({ ...current, [key]: value }));

    const handleSave = async (sendAfterSave: boolean) => {
        if (!selectedType) return addToast("error", "Selecciona un tipo de evidencia");
        if (!form.fechaEvento) return addToast("error", "La fecha del evento es obligatoria");
        if (selectedType.requiereBeneficiario && !form.idBeneficiario) return addToast("error", "Selecciona al colaborador beneficiario");
        if (selectedType.requiereResponsable && !form.idResponsable) return addToast("error", "Selecciona al colaborador responsable");
        if (!form.idBeneficiario && !form.idResponsable) return addToast("error", "Vincula al menos un colaborador");
        if (selectedType.requiereCliente && !form.clienteId) return addToast("error", "Ingresa el DNI de un cliente registrado");
        if (selectedType.requiereOperacion && !form.operacionId && selectedType.categoria !== "REFERIDO") return addToast("error", "La operación vinculada es obligatoria");
        if (selectedType.categoria === "CALIFICACION" && (!form.estrellas || form.estrellas < 1 || form.estrellas > 5)) return addToast("error", "La calificación debe estar entre 1 y 5 estrellas");

        setIsSaving(true);
        try {
            const id = await evidenciasService.create(form);
            if (sendAfterSave) await evidenciasService.send(id);
            addToast("success", sendAfterSave ? "Evidencia registrada y enviada a revisión" : "Evidencia guardada como borrador");
            onSave();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible registrar la evidencia");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} />
                    <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.18 }} className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
                        <div className="flex items-start justify-between border-b border-secondary px-6 py-5">
                            <div><h2 className="text-lg font-semibold text-primary">Nueva evidencia</h2><p className="mt-1 text-sm text-tertiary">Registra el sustento y envíalo al flujo de revisión.</p></div>
                            <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} />
                        </div>
                        <div className="flex-1 space-y-5 overflow-y-auto p-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Select label="Tipo" size="sm" isRequired items={types.map((item) => ({ id: item.id, label: item.nombre }))} selectedKey={form.idTipoEvento} onSelectionChange={(key) => key !== null && setValue("idTipoEvento", Number(key))}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>
                                <Input label="Fecha y hora" size="sm" type="datetime-local" isRequired value={form.fechaEvento} onChange={(value) => setValue("fechaEvento", value)} />
                                {(selectedType?.requiereBeneficiario || !selectedType?.requiereResponsable) && <Select label="Beneficiario" size="sm" isRequired={selectedType?.requiereBeneficiario} items={[{ id: 0, label: "Sin beneficiario" }, ...collaboratorItems]} selectedKey={form.idBeneficiario ?? 0} onSelectionChange={(key) => setValue("idBeneficiario", key && Number(key) > 0 ? Number(key) : null)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>}
                                {selectedType?.requiereResponsable && <Select label="Responsable" size="sm" isRequired items={collaboratorItems} selectedKey={form.idResponsable ?? 0} onSelectionChange={(key) => setValue("idResponsable", key ? Number(key) : null)}>{(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}</Select>}
                                <Input label="Título" size="sm" placeholder="Resumen breve del evento" value={form.titulo} onChange={(value) => setValue("titulo", value)} />
                                {selectedType?.categoria === "CALIFICACION" && <Input label="Estrellas" size="sm" type="number" isRequired value={form.estrellas?.toString() ?? ""} onChange={(value) => setValue("estrellas", value ? Number(value) : null)} />}
                            </div>

                            {(selectedType?.requiereCliente || ["CALIFICACION", "LLAMADA", "TARJETA_TERCERO"].includes(selectedType?.categoria ?? "")) && <section className="rounded-lg border border-secondary bg-secondary p-4"><h3 className="text-sm font-semibold text-primary">Cliente relacionado</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><Input label="DNI" size="sm" isRequired={selectedType?.requiereCliente} value={form.clienteDocumento} onChange={(value) => setValue("clienteDocumento", value.replace(/\D/g, "").slice(0, 8))} hint={isClientLoading ? "Buscando cliente..." : client ? `Cliente encontrado: ${client.nombre}` : form.clienteDocumento.length === 8 ? "No se encontró un cliente registrado" : undefined} /><Input label="Nombre del cliente" size="sm" value={form.clienteNombre} onChange={(value) => setValue("clienteNombre", value)} isDisabled={Boolean(client)} /></div></section>}

                            {selectedType?.requiereOperacion && selectedType.categoria !== "REFERIDO" && <Input label="Código de operación" size="sm" type="number" isRequired value={form.operacionId?.toString() ?? ""} onChange={(value) => setValue("operacionId", value ? Number(value) : null)} />}
                            <Input label="Enlace de evidencia" size="sm" type="url" placeholder="https://..." value={form.evidenciaUrl} onChange={(value) => setValue("evidenciaUrl", value)} hint="Puede ser un enlace a una captura, archivo o formulario de respaldo." />
                            <TextArea label="Descripción" size="sm" rows={4} value={form.descripcion} onChange={(value) => setValue("descripcion", value)} placeholder="Contexto necesario para que el revisor tome una decisión" />
                        </div>
                        <div className="flex flex-wrap justify-end gap-3 border-t border-secondary px-6 py-4">
                            <Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button>
                            <Button size="sm" color="secondary" iconLeading={Check} isLoading={isSaving} onClick={() => void handleSave(false)}>Guardar borrador</Button>
                            <Button size="sm" color="primary" iconLeading={Send01} isLoading={isSaving} onClick={() => void handleSave(true)}>Guardar y enviar</Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
