import { useEffect, useMemo, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useAlert } from "@/components/shared/alert-center";
import { useSessionCache } from "@/providers/session-cache-provider";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { colaboradoresService } from "./colaboradores.service";
import type { AsignacionFormValues, CatalogItem, Colaborador } from "./colaboradores.types";
import { planOperativoId } from "./plan-operativo";

interface AsignacionPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    colaborador: Colaborador;
    cargos: CatalogItem[];
    planes: CatalogItem[];
    sucursales: CatalogItem[];
}

const limaToday = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
};

export const AsignacionPopup = ({ isOpen, onClose, onSave, colaborador, cargos, planes, sucursales }: AsignacionPopupProps) => {
    const { estados } = useSessionCache();
    const notify = useAlert();
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const activoId = Number(estadoItems.find((state) => state.label.toLocaleLowerCase("es-PE") === "activo")?.id ?? 0);
    const current = colaborador.asignacion;
    const [form, setForm] = useState<AsignacionFormValues>({
        idCargo: 0,
        idSucursal: 0,
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
            idPlan: planOperativoId(planes, current?.idPlan),
            fechaInicio: limaToday(),
            modalidad: current?.modalidad ?? "PRESENCIAL",
            observacion: "",
            idEstado: activoId,
        });
    }, [activoId, current, isOpen, planes]);

    const setValue = <K extends keyof AsignacionFormValues>(key: K, value: AsignacionFormValues[K]) => setForm((state) => ({ ...state, [key]: value }));

    const handleSave = async () => {
        if (isSaving) return;
        if (!form.idPlan) return notify("notice", "La configuración general no está disponible; solicita su revisión a Administración.");
        if (!form.idCargo || !form.idSucursal || !form.fechaInicio) return notify("validation", "Completa los datos obligatorios de la asignación.");
        setIsSaving(true);
        try {
            await colaboradoresService.saveAssignment(colaborador.id, form);
            notify("success", "Cambio de asignación registrado.");
            onSave();
        } catch (error) {
            notify("error", error instanceof Error ? error.message : "No fue posible registrar la asignación");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <CompensacionSurface title="Asignación laboral" onClose={onClose} busy={isSaving}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl"
                    >
                        <CompensacionDialogHeader title={<>Cambiar cargo y horario</>} onClose={onClose} busy={isSaving}>
                            <div>
                                <p className="mt-1 text-sm text-tertiary">{colaborador.nombreCompleto}</p>
                            </div>
                        </CompensacionDialogHeader>
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                            <div className="mt-6 grid gap-4 sm:grid-cols-2">
                                <Select
                                    label="Cargo"
                                    placeholder="Selecciona un cargo"
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
                                    placeholder="Selecciona una sede"
                                    size="sm"
                                    isRequired
                                    items={options(sucursales)}
                                    selectedKey={form.idSucursal}
                                    onSelectionChange={(key) => key !== null && setValue("idSucursal", Number(key))}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <CompensacionDatePicker
                                    label="Aplicar desde"

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
                        </div>
                        <CompensacionDialogFooter>
                            <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={isSaving} onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Save01} isLoading={isSaving} onClick={() => void handleSave()}>
                                Registrar cambio
                            </Button>
                        </CompensacionDialogFooter>
                    </motion.div>
                </CompensacionSurface>
            )}
        </AnimatePresence>
    );
};
