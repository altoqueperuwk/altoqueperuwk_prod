import { useEffect, useMemo, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { useSessionCache } from "@/providers/session-cache-provider";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { ColaboradorFichaLayout } from "./colaborador-ficha-layout";
import { colaboradoresService } from "./colaboradores.service";
import type { CatalogItem, Colaborador, ColaboradorFormValues, UsuarioElegible } from "./colaboradores.types";
import { planOperativoId } from "./plan-operativo";

interface ColaboradorPopupProps {
    inline?: boolean;
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    item: Colaborador | null;
    cargos: CatalogItem[];
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
    nombreCompleto: "",
    fechaIngreso: today(),
    fechaCese: "",
    motivoCese: "",
    idEstado: 0,
    idCargo: 0,
    idSucursal: 0,
    idPlan: 0,
    modalidad: "PRESENCIAL",
});

export const ColaboradorPopup = ({ isOpen, onClose, onSave, item, cargos, planes, sucursales, inline = false }: ColaboradorPopupProps) => {
    const { estados } = useSessionCache();
    const notify = useAlert();
    const [attempted, setAttempted] = useState(false);
    const [form, setForm] = useState<ColaboradorFormValues>(emptyForm);
    const [users, setUsers] = useState<UsuarioElegible[]>([]);
    const [usersError, setUsersError] = useState("");
    const [isUsersLoading, setIsUsersLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [asignacionLoading, setAsignacionLoading] = useState(false);
    const [asignacionError, setAsignacionError] = useState("");
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setAsignacionError("");
        setAsignacionLoading(Boolean(item));
        if (item)
            colaboradoresService
                .getAssignments(item.id)
                .then((assignments) => {
                    if (cancelled) return;
                    const active = assignments.find((assignment) => assignment.esVigente);
                    if (active)
                        setForm((current) => ({
                            ...current,
                            idCargo: active.idCargo,
                            idSucursal: active.idSucursal,
                            idPlan: active.idPlan,
                            modalidad: active.modalidad,
                        }));
                })
                .catch(() => {
                    if (!cancelled) setAsignacionError("No se pudo cargar la asignación vigente. Cierra y vuelve a abrir la ficha.");
                })
                .finally(() => {
                    if (!cancelled) setAsignacionLoading(false);
                });
        return () => {
            cancelled = true;
        };
    }, [isOpen, item?.id]);
    const isEditing = item !== null;
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const activoId = Number(estadoItems.find((state) => state.label.toLocaleLowerCase("es-PE") === "activo")?.id ?? 0);
    const catalogItems = (items: CatalogItem[]) => items.map((entry) => ({ id: entry.id, label: entry.nombre }));
    useEffect(() => {
        if (!isOpen) return;
        setAttempted(false);
        if (!item) {
            setForm({ ...emptyForm(), idEstado: activoId, idPlan: planOperativoId(planes) });
            return;
        }
        setForm({
            idUsuario: item.idUsuario ?? 0,
            tipoDocumento: item.tipoDocumento || "DNI",
            numeroDocumento: item.numeroDocumento,
            nombreCompleto: item.nombreCompleto || [item.nombres, item.apellidoPaterno, item.apellidoMaterno].filter(Boolean).join(" "),
            fechaIngreso: item.fechaIngreso,
            fechaCese: item.fechaCese ?? "",
            motivoCese: item.motivoCese,
            idEstado: item.idEstado,
            idCargo: item.asignacion?.idCargo ?? 0,
            idSucursal: item.asignacion?.idSucursal ?? 0,
            idPlan: item.asignacion?.idPlan ?? 0,
            modalidad: item.asignacion?.modalidad || "PRESENCIAL",
        });
    }, [activoId, isOpen, item, planes]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setIsUsersLoading(true);
        setUsers([]);
        setUsersError("");
        colaboradoresService
            .getEligibleUsers(item?.id)
            .then((rows) => {
                if (!cancelled) setUsers(rows);
            })
            .catch((error) => {
                if (!cancelled) setUsersError(error instanceof Error ? error.message : "No fue posible cargar los usuarios del sistema");
            })
            .finally(() => {
                if (!cancelled) setIsUsersLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [notify, isOpen, item?.id]);

    const setValue = <K extends keyof ColaboradorFormValues>(key: K, value: ColaboradorFormValues[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const handleUserChange = (id: number) => {
        if (isEditing) return;
        const user = users.find((candidate) => candidate.id === id);
        setForm((current) => ({
            ...current,
            idUsuario: id,
            nombreCompleto: !isEditing && user?.nombre ? user.nombre : current.nombreCompleto,
        }));
    };

    const handleSave = async () => {
        if (isSaving) return;
        if (isUsersLoading || usersError) return notify("error", usersError || "Espera a que carguen los usuarios");
        if (asignacionLoading || asignacionError) return notify("error", asignacionError || "Espera a que cargue la asignación");
        setAttempted(true);
        const problemasDeCampos1: string[] = [];
        if (!form.idUsuario) problemasDeCampos1.push("Selecciona el usuario del sistema que corresponde al colaborador.");
        if (!form.numeroDocumento.trim()) problemasDeCampos1.push("El número de documento es obligatorio.");
        else if (form.tipoDocumento === "DNI" && !/^\d{8}$/.test(form.numeroDocumento.trim())) problemasDeCampos1.push("El DNI debe tener 8 dígitos.");
        if (!form.nombreCompleto.trim()) problemasDeCampos1.push("El nombre completo es obligatorio.");
        if (!form.fechaIngreso) problemasDeCampos1.push("La fecha de ingreso es obligatoria.");
        if (!form.idEstado) problemasDeCampos1.push("El estado es obligatorio.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        if (!isEditing && !form.idPlan) return notify("notice", "La configuración general no está disponible; solicita su revisión a Administración.");
        if (!isEditing && (!form.idCargo || !form.idSucursal)) {
            return notify("validation", "Selecciona cargo y sede.");
        }
        if (form.fechaCese && form.fechaCese < form.fechaIngreso) return notify("validation", "La fecha de cese no puede ser anterior al ingreso.");

        setIsSaving(true);
        try {
            if (item) {
                await colaboradoresService.update(item.id, { ...form, idUsuario: item.idUsuario ?? 0 });
                setAttempted(false);
                notify("success", "Ficha laboral actualizada.");
            } else {
                await colaboradoresService.create(form);
                setAttempted(false);
                notify("success", "Colaborador registrado.");
            }
            onSave();
        } catch (error) {
            notify("error", error && typeof error === "object" && "message" in error ? String(error.message) : "No fue posible guardar el colaborador");
        } finally {
            setIsSaving(false);
        }
    };

    const fields = {
        usuario: (
            <Select
                isInvalid={attempted && !form.idUsuario}
                label="Usuario del Sistema"
                placeholder="Seleccionar usuario"
                size="sm"
                isRequired
                isDisabled={isEditing || isUsersLoading || isSaving}
                items={users.map((user) => ({
                    id: user.id,
                    label: user.nombre,
                }))}
                selectedKey={form.idUsuario || null}
                onSelectionChange={(key) => key !== null && handleUserChange(Number(key))}
            >
                {(user) => <Select.Item id={user.id}>{user.label}</Select.Item>}
            </Select>
        ),
        nombre: (
            <Input
                isInvalid={attempted && !form.nombreCompleto.trim()}
                label="Nombre Completo"
                size="sm"
                isRequired
                value={form.nombreCompleto}
                onChange={(value) => setValue("nombreCompleto", value)}
            />
        ),
        tipoDocumento: (
            <Select
                label="Tipo Doc."
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
        ),
        documento: (
            <Input
                isInvalid={attempted && (!form.numeroDocumento.trim() || (form.tipoDocumento === "DNI" && !/^\d{8}$/.test(form.numeroDocumento.trim())))}
                label="Nro. Documento"
                size="sm"
                isRequired
                value={form.numeroDocumento}
                onChange={(value) => setValue("numeroDocumento", value)}
            />
        ),
        fechaIngreso: (
            <CompensacionDatePicker
                label="Fecha de Ingreso"

                isRequired
                value={form.fechaIngreso}
                onChange={(value) => setValue("fechaIngreso", value)}
            />
        ),
        cargo: (
            <Select
                isInvalid={attempted && !form.idCargo}
                label="Cargo"
                placeholder="Seleccionar cargo"
                size="sm"
                isRequired
                isDisabled={asignacionLoading || isSaving}
                items={catalogItems(cargos)}
                selectedKey={form.idCargo}
                onSelectionChange={(key) => key !== null && setValue("idCargo", Number(key))}
            >
                {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
            </Select>
        ),
        sede: (
            <Select
                isInvalid={attempted && !form.idSucursal}
                label="Sede"
                placeholder="Seleccionar sede"
                size="sm"
                isRequired
                isDisabled={asignacionLoading || isSaving}
                items={catalogItems(sucursales)}
                selectedKey={form.idSucursal}
                onSelectionChange={(key) => key !== null && setValue("idSucursal", Number(key))}
            >
                {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
            </Select>
        ),
        modalidad: (
            <Select
                label="Modalidad"
                isDisabled={asignacionLoading || isSaving}
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
        ),
    };
    const formActions = (
        <div className="flex shrink-0 flex-wrap items-end justify-end gap-2">
            <Button size="sm" color="secondary" iconLeading={XClose} className={inline ? "h-9 gap-1 px-2" : "h-9"} isDisabled={isSaving} onClick={onClose}>
                Cancelar
            </Button>
            <Button
                size="sm"
                color="primary"
                iconLeading={Save01}
                className={inline ? "h-9 gap-1 px-2" : "h-9"}
                isLoading={isSaving}
                isDisabled={isUsersLoading || Boolean(usersError) || asignacionLoading || Boolean(asignacionError)}
                onClick={() => void handleSave()}
            >
                Guardar
            </Button>
        </div>
    );
    return (
        <AnimatePresence>
            {isOpen && (
                <CompensacionSurface title="Ficha del colaborador" onClose={onClose} busy={isSaving} inline={inline} fullWidth={inline} maxWidth="4xl">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className={
                            inline
                                ? "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs"
                                : "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden! rounded-xl bg-primary shadow-xl ring-1 ring-secondary"
                        }
                    >
                        {inline ? (
                            <CompensacionDialogHeader title="Nuevo Colaborador" inline />
                        ) : (
                            <CompensacionDialogHeader title={isEditing ? "Editar Colaborador" : "Nuevo Colaborador"} onClose={onClose} busy={isSaving} />
                        )}

                        {inline ? (
                            <div className="grid min-w-0 grid-cols-1 items-end gap-2 bg-primary p-4 sm:grid-cols-2 md:grid-cols-12 lg:flex lg:flex-col lg:items-stretch [&_label]:whitespace-nowrap [&>div]:min-w-0">
                                <div className="contents lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-2">
                                    <div className="md:col-span-4 lg:col-span-1">{fields.usuario}</div>
                                    <div className="md:col-span-4 lg:col-span-1">{fields.nombre}</div>
                                    <div className="md:col-span-4 lg:col-span-1">{fields.documento}</div>
                                    <div className="md:col-span-3 lg:col-span-1">{fields.cargo}</div>
                                    <div className="md:col-span-3 lg:col-span-1">{fields.sede}</div>
                                    <div className="md:col-span-3 lg:col-span-1">{fields.modalidad}</div>
                                </div>
                                <div className="contents lg:grid lg:grid-cols-[9rem_auto] lg:items-end lg:gap-2">
                                    <div className="md:col-span-3 lg:col-span-1">{fields.fechaIngreso}</div>
                                    <div className="sm:col-span-2 md:col-span-9 lg:col-span-1">{formActions}</div>
                                </div>
                                {usersError && <AlertMessage tone="error">{usersError}</AlertMessage>}
                            </div>
                        ) : (
                            <ColaboradorFichaLayout
                                personal={{
                                    usuario: fields.usuario,
                                    nombre: fields.nombre,
                                    tipoDocumento: isEditing ? fields.tipoDocumento : undefined,
                                    documento: fields.documento,
                                    fechaIngreso: fields.fechaIngreso,
                                    estado: isEditing ? (
                                        <Select
                                            label="Estado"
                                            size="sm"
                                            items={estadoItems}
                                            selectedKey={form.idEstado}
                                            onSelectionChange={(key) => key !== null && setValue("idEstado", Number(key))}
                                        >
                                            {(state) => <Select.Item id={state.id}>{state.label}</Select.Item>}
                                        </Select>
                                    ) : undefined,
                                }}
                                laboral={{ cargo: fields.cargo, sede: fields.sede, modalidad: fields.modalidad }}
                                avisos={
                                    usersError || asignacionError ? (
                                        <>
                                            {usersError && <AlertMessage tone="error">{usersError}</AlertMessage>}
                                            {asignacionError && <AlertMessage tone="error">{asignacionError}</AlertMessage>}
                                        </>
                                    ) : undefined
                                }
                                cese={
                                    isEditing ? (
                                        <div className="grid items-end gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
                                            <CompensacionDatePicker
                                                label="Fecha de Cese"

                                                value={form.fechaCese}
                                                onChange={(value) => setValue("fechaCese", value)}
                                            />
                                            <CompensacionNoteField
                                                label="Motivo de Cese"
                                                isDisabled={isSaving}
                                                placeholder="Escribe el motivo del cese"
                                                value={form.motivoCese}
                                                onChange={(value) => setValue("motivoCese", value)}
                                            />
                                            <Button
                                                size="sm"
                                                color="secondary"
                                                iconLeading={XClose}
                                                isDisabled={isSaving || !form.fechaCese}
                                                onClick={() => setValue("fechaCese", "")}
                                            >
                                                Quitar Fecha de Cese
                                            </Button>
                                        </div>
                                    ) : undefined
                                }
                            />
                        )}

                        {!inline && <CompensacionDialogFooter>{formActions}</CompensacionDialogFooter>}
                    </motion.div>
                </CompensacionSurface>
            )}
        </AnimatePresence>
    );
};
