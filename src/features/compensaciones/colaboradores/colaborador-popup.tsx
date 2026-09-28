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
import type { CatalogItem, Colaborador, ColaboradorFormValues, UsuarioElegible } from "./colaboradores.types";

interface ColaboradorPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    item: Colaborador | null;
    cargos: CatalogItem[];
    jornadas: CatalogItem[];
    planes: CatalogItem[];
    sucursales: CatalogItem[];
}

const today = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Lima", year: "numeric" }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
};

const emptyForm = (): ColaboradorFormValues => ({
    idUsuario: 0,
    tipoDocumento: "DNI",
    numeroDocumento: "",
    nombres: "",
    apellidoPaterno: "",
    apellidoMaterno: "",
    email: "",
    celular: "",
    codigoHuellero: "",
    fechaIngreso: today(),
    fechaCese: "",
    motivoCese: "",
    idEstado: 0,
    idCargo: 0,
    idSucursal: 0,
    idJornada: 0,
    idPlan: 0,
    modalidad: "PRESENCIAL",
});

export const ColaboradorPopup = ({ isOpen, onClose, onSave, item, cargos, jornadas, planes, sucursales }: ColaboradorPopupProps) => {
    const { estados } = useSessionCache();
    const { addToast } = useToast();
    const [form, setForm] = useState<ColaboradorFormValues>(emptyForm);
    const [users, setUsers] = useState<UsuarioElegible[]>([]);
    const [isUsersLoading, setIsUsersLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const isEditing = item !== null;
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const activoId = Number(estadoItems.find((state) => state.label.toLocaleLowerCase("es-PE") === "activo")?.id ?? 0);
    const catalogItems = (items: CatalogItem[]) => items.map((entry) => ({ id: entry.id, label: entry.nombre }));

    useEffect(() => {
        if (!isOpen) return;
        if (!item) {
            setForm({ ...emptyForm(), idEstado: activoId });
            return;
        }
        setForm({
            idUsuario: item.idUsuario ?? 0,
            tipoDocumento: item.tipoDocumento || "DNI",
            numeroDocumento: item.numeroDocumento,
            nombres: item.nombres,
            apellidoPaterno: item.apellidoPaterno,
            apellidoMaterno: item.apellidoMaterno,
            email: item.email,
            celular: item.celular,
            codigoHuellero: item.codigoHuellero,
            fechaIngreso: item.fechaIngreso,
            fechaCese: item.fechaCese ?? "",
            motivoCese: item.motivoCese,
            idEstado: item.idEstado,
            idCargo: item.asignacion?.idCargo ?? 0,
            idSucursal: item.asignacion?.idSucursal ?? 0,
            idJornada: item.asignacion?.idJornada ?? 0,
            idPlan: item.asignacion?.idPlan ?? 0,
            modalidad: item.asignacion?.modalidad ?? "PRESENCIAL",
        });
    }, [activoId, isOpen, item]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setIsUsersLoading(true);
        colaboradoresService
            .getEligibleUsers(item?.id)
            .then((rows) => {
                if (!cancelled) setUsers(rows);
            })
            .catch((error) => {
                if (!cancelled) addToast("error", error instanceof Error ? error.message : "No fue posible cargar los usuarios del sistema");
            })
            .finally(() => {
                if (!cancelled) setIsUsersLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [addToast, isOpen, item?.id]);

    const setValue = <K extends keyof ColaboradorFormValues>(key: K, value: ColaboradorFormValues[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const handleUserChange = (id: number) => {
        const user = users.find((candidate) => candidate.id === id);
        setForm((current) => ({
            ...current,
            idUsuario: id,
            email: user?.email || current.email,
            nombres: !isEditing && user?.nombre ? user.nombre : current.nombres,
            idSucursal: !isEditing && user?.idSucursal ? user.idSucursal : current.idSucursal,
        }));
    };

    const handleSave = async () => {
        if (!form.idUsuario) return addToast("error", "Selecciona el usuario del sistema que corresponde al colaborador");
        if (!form.numeroDocumento.trim()) return addToast("error", "El número de documento es obligatorio");
        if (!form.nombres.trim()) return addToast("error", "Los nombres son obligatorios");
        if (!form.fechaIngreso) return addToast("error", "La fecha de ingreso es obligatoria");
        if (!form.idEstado) return addToast("error", "El estado es obligatorio");
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return addToast("error", "El correo no tiene un formato válido");
        if (!isEditing && (!form.idCargo || !form.idSucursal || !form.idJornada || !form.idPlan)) {
            return addToast("error", "Cargo, sede, jornada y plan son obligatorios");
        }
        if (form.fechaCese && form.fechaCese < form.fechaIngreso) return addToast("error", "La fecha de cese no puede ser anterior al ingreso");

        setIsSaving(true);
        try {
            if (item) {
                await colaboradoresService.update(item.id, form);
                addToast("success", "Ficha laboral actualizada correctamente");
            } else {
                await colaboradoresService.create(form);
                addToast("success", "Colaborador registrado correctamente");
            }
            onSave();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No fue posible guardar el colaborador");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl"
                    >
                        <div className="flex items-start justify-between border-b border-secondary px-6 py-5">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">{isEditing ? "Editar colaborador" : "Nuevo colaborador"}</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    {isEditing ? "Actualiza los datos de su ficha laboral." : "Registra los datos personales y su asignación inicial."}
                                </p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} />
                        </div>

                        <div className="flex-1 space-y-6 overflow-y-auto p-6">
                            <section>
                                <h3 className="text-sm font-semibold text-primary">Datos personales</h3>
                                <div className="mt-4">
                                    <Select
                                        label="Usuario del sistema"
                                        size="sm"
                                        isRequired
                                        isDisabled={isUsersLoading}
                                        items={users.map((user) => ({
                                            id: user.id,
                                            label: `${user.nombre} · ${user.username}${user.rolNombre ? ` · ${user.rolNombre}` : ""}`,
                                        }))}
                                        selectedKey={form.idUsuario || null}
                                        onSelectionChange={(key) => key !== null && handleUserChange(Number(key))}
                                    >
                                        {(user) => <Select.Item id={user.id}>{user.label}</Select.Item>}
                                    </Select>
                                    <p className="mt-1 text-xs text-tertiary">
                                        La actividad operativa se atribuirá mediante este usuario. Solo se muestran usuarios activos sin otra ficha laboral.
                                    </p>
                                </div>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    <Select
                                        label="Tipo de documento"
                                        size="sm"
                                        items={[
                                            { id: "DNI", label: "DNI" },
                                            { id: "CE", label: "Carné de extranjería" },
                                            { id: "PASAPORTE", label: "Pasaporte" },
                                        ]}
                                        selectedKey={form.tipoDocumento}
                                        onSelectionChange={(key) => key !== null && setValue("tipoDocumento", String(key))}
                                    >
                                        {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                    </Select>
                                    <Input
                                        label="Número de documento"
                                        size="sm"
                                        isRequired
                                        value={form.numeroDocumento}
                                        onChange={(value) => setValue("numeroDocumento", value)}
                                    />
                                    <Input
                                        label="Código de huellero"
                                        size="sm"
                                        value={form.codigoHuellero}
                                        onChange={(value) => setValue("codigoHuellero", value)}
                                    />
                                    <Input label="Nombres" size="sm" isRequired value={form.nombres} onChange={(value) => setValue("nombres", value)} />
                                    <Input
                                        label="Apellido paterno"
                                        size="sm"
                                        value={form.apellidoPaterno}
                                        onChange={(value) => setValue("apellidoPaterno", value)}
                                    />
                                    <Input
                                        label="Apellido materno"
                                        size="sm"
                                        value={form.apellidoMaterno}
                                        onChange={(value) => setValue("apellidoMaterno", value)}
                                    />
                                    <Input label="Correo" size="sm" type="email" value={form.email} onChange={(value) => setValue("email", value)} />
                                    <Input label="Celular" size="sm" value={form.celular} onChange={(value) => setValue("celular", value)} />
                                    <Input
                                        label="Fecha de ingreso"
                                        size="sm"
                                        type="date"
                                        isRequired
                                        value={form.fechaIngreso}
                                        onChange={(value) => setValue("fechaIngreso", value)}
                                    />
                                    <Select
                                        label="Estado"
                                        size="sm"
                                        items={estadoItems}
                                        selectedKey={form.idEstado}
                                        onSelectionChange={(key) => key !== null && setValue("idEstado", Number(key))}
                                    >
                                        {(state) => <Select.Item id={state.id}>{state.label}</Select.Item>}
                                    </Select>
                                </div>
                            </section>

                            {!isEditing && (
                                <section className="border-t border-secondary pt-6">
                                    <h3 className="text-sm font-semibold text-primary">Asignación inicial</h3>
                                    <p className="mt-1 text-xs text-tertiary">La vigencia comienza en la fecha de ingreso.</p>
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        <Select
                                            label="Cargo"
                                            size="sm"
                                            isRequired
                                            items={catalogItems(cargos)}
                                            selectedKey={form.idCargo}
                                            onSelectionChange={(key) => key !== null && setValue("idCargo", Number(key))}
                                        >
                                            {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                        </Select>
                                        <Select
                                            label="Sede"
                                            size="sm"
                                            isRequired
                                            items={catalogItems(sucursales)}
                                            selectedKey={form.idSucursal}
                                            onSelectionChange={(key) => key !== null && setValue("idSucursal", Number(key))}
                                        >
                                            {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                        </Select>
                                        <Select
                                            label="Jornada"
                                            size="sm"
                                            isRequired
                                            items={catalogItems(jornadas)}
                                            selectedKey={form.idJornada}
                                            onSelectionChange={(key) => key !== null && setValue("idJornada", Number(key))}
                                        >
                                            {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                        </Select>
                                        <Select
                                            label="Plan de compensación"
                                            size="sm"
                                            isRequired
                                            items={catalogItems(planes)}
                                            selectedKey={form.idPlan}
                                            onSelectionChange={(key) => key !== null && setValue("idPlan", Number(key))}
                                        >
                                            {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                        </Select>
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
                                            {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                                        </Select>
                                    </div>
                                </section>
                            )}

                            {isEditing && (
                                <section className="border-t border-secondary pt-6">
                                    <h3 className="text-sm font-semibold text-primary">Cese laboral</h3>
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <Input
                                            label="Fecha de cese"
                                            size="sm"
                                            type="date"
                                            value={form.fechaCese}
                                            onChange={(value) => setValue("fechaCese", value)}
                                        />
                                        <TextArea
                                            label="Motivo de cese"
                                            size="sm"
                                            rows={3}
                                            value={form.motivoCese}
                                            onChange={(value) => setValue("motivoCese", value)}
                                        />
                                    </div>
                                </section>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 border-t border-secondary px-6 py-4">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void handleSave()}>
                                Guardar
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
