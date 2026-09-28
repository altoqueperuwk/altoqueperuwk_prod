import { useEffect, useMemo, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { colaboradoresService } from "./colaboradores.service";
import type { AsignacionFormValues, CatalogItem, Colaborador } from "./colaboradores.types";

interface AsignacionPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    colaborador: Colaborador;
    cargos: CatalogItem[];
    jornadas: CatalogItem[];
    planes: CatalogItem[];
    sucursales: CatalogItem[];
}

const limaToday = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
};

export const AsignacionPopup = ({ isOpen, onClose, onSave, colaborador, cargos, jornadas, planes, sucursales }: AsignacionPopupProps) => {
    const { estados } = useSessionCache();
    const { addToast } = useToast();
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const activoId = Number(estadoItems.find((state) => state.label.toLocaleLowerCase("es-PE") === "activo")?.id ?? 0);
    const current = colaborador.asignacion;
    const [form, setForm] = useState<AsignacionFormValues>({
        idCargo: 0,
        idSucursal: 0,
        idJornada: 0,
        idPlan: 0,
        fechaInicio: limaToday(),
        modalidad: "PRESENCIAL",
        observacion: "",
        idEstado: 0,
    });
    const [isSaving, setIsSaving] = useState(false);
    const options = (items: CatalogItem[]) => items.map((item) => ({ id: item.id, label: item.nombre }));

    useEffect(() => {
        if (!isOpen) return;
        setForm({
            idCargo: current?.idCargo ?? 0,
            idSucursal: current?.idSucursal ?? 0,
            idJornada: current?.idJornada ?? 0,
            idPlan: current?.idPlan ?? 0,
            fechaInicio: limaToday(),
            modalidad: current?.modalidad ?? "PRESENCIAL",
            observacion: "",
            idEstado: activoId,
        });
    }, [activoId, current, isOpen]);

    const setValue = <K extends keyof AsignacionFormValues>(key: K, value: AsignacionFormValues[K]) => setForm((state) => ({ ...state, [key]: value }));

    const handleSave = async () => {
        if (!form.idCargo || !form.idSucursal || !form.idJornada || !form.idPlan || !form.fechaInicio)
            return addToast("error", "Completa los datos obligatorios de la asignación");
        setIsSaving(true);
        try {
            await colaboradoresService.saveAssignment(colaborador.id, form);
            addToast("success", "Cambio de asignación registrado correctamente");
            onSave();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible registrar la asignación");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-overlay/70"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="relative z-10 w-full max-w-xl rounded-xl bg-primary p-6 shadow-xl"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Cambiar asignación</h2>
                                <p className="mt-1 text-sm text-tertiary">{colaborador.nombreCompleto}</p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} />
                        </div>
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            <Select
                                label="Cargo"
                                size="sm"
                                isRequired
                                items={options(cargos)}
                                selectedKey={form.idCargo}
                                onSelectionChange={(key) => key !== null && setValue("idCargo", Number(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Sede"
                                size="sm"
                                isRequired
                                items={options(sucursales)}
                                selectedKey={form.idSucursal}
                                onSelectionChange={(key) => key !== null && setValue("idSucursal", Number(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Jornada"
                                size="sm"
                                isRequired
                                items={options(jornadas)}
                                selectedKey={form.idJornada}
                                onSelectionChange={(key) => key !== null && setValue("idJornada", Number(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Plan"
                                size="sm"
                                isRequired
                                items={options(planes)}
                                selectedKey={form.idPlan}
                                onSelectionChange={(key) => key !== null && setValue("idPlan", Number(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Input
                                label="Inicio de vigencia"
                                size="sm"
                                type="date"
                                isRequired
                                value={form.fechaInicio}
                                onChange={(value) => setValue("fechaInicio", value)}
                            />
                            <Select
                                label="Modalidad"
                                size="sm"
                                items={[
                                    { id: "PRESENCIAL", label: "Presencial" },
                                    { id: "REMOTO", label: "Remoto" },
                                    { id: "HIBRIDO", label: "Híbrido" },
                                ]}
                                selectedKey={form.modalidad}
                                onSelectionChange={(key) => key !== null && setValue("modalidad", String(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <div className="sm:col-span-2">
                                <TextArea
                                    label="Observación"
                                    size="sm"
                                    rows={3}
                                    value={form.observacion}
                                    onChange={(value) => setValue("observacion", value)}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void handleSave()}>
                                Registrar cambio
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
