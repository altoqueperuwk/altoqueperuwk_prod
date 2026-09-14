import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { isAdministrator, useAuth } from "@/providers/auth-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { rolService } from "@/services/rol.service";
import { sucursalService } from "@/services/sucursal.service";
import { usuarioService } from "@/services/usuario.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface UsuarioPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    item: Record<string, unknown> | null;
}

interface CatalogItem {
    id: string | number;
    label: string;
}

const getActivoId = (items: CatalogItem[]) => {
    const activo = items.find((item) => item.label.toLowerCase() === "activo");
    return activo ? Number(activo.id) : 0;
};

export const UsuarioPopup = ({ isOpen, onClose, onSave, item }: UsuarioPopupProps) => {
    const { estados } = useSessionCache();
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const isEditing = item !== null;
    const creatorIsAdministrator = isAdministrator(businessUser);
    const creatorIsJefeTienda = !creatorIsAdministrator && Number(businessUser?.id_rol) === 3;

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [nombre, setNombre] = useState("");
    const [idRol, setIdRol] = useState(0);
    const [idEstado, setIdEstado] = useState(0);
    const [idSucursal, setIdSucursal] = useState(0);
    const [flagSuperAdmin, setFlagSuperAdmin] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [roles, setRoles] = useState<Record<string, unknown>[]>([]);
    const [sucursales, setSucursales] = useState<Record<string, unknown>[]>([]);

    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const activoId = useMemo(() => getActivoId(estadoItems), [estadoItems]);
    const rolItems = useMemo<CatalogItem[]>(
        () =>
            roles
                .filter((role) => (creatorIsJefeTienda ? Number(role.id) === 4 : creatorIsAdministrator || [2, 3, 4].includes(Number(role.id))))
                .map((role) => ({ id: role.id as number, label: String(role.nombre) })),
        [creatorIsAdministrator, creatorIsJefeTienda, roles],
    );
    const sucursalItems = useMemo<CatalogItem[]>(() => sucursales.map((branch) => ({ id: branch.id as number, label: String(branch.nombre) })), [sucursales]);

    const loadCatalogs = useCallback(async () => {
        try {
            const filter = activoId ? { p_id_estado: activoId } : {};
            const [rolesResult, sucursalesResult] = await Promise.all([rolService.getList(filter), sucursalService.getList(filter)]);
            setRoles(rolesResult);
            setSucursales(sucursalesResult);
        } catch {
            addToast("error", "No se pudieron cargar los roles y sucursales");
        }
    }, [activoId, addToast]);

    useEffect(() => {
        if (!isOpen) return;
        void loadCatalogs();
        setUsername(String(item?.username ?? ""));
        setEmail(String(item?.email ?? ""));
        setNombre(String(item?.nombre ?? ""));
        setIdRol(creatorIsJefeTienda ? 4 : Number(item?.id_rol ?? 0));
        setIdEstado(Number(item?.id_estado ?? activoId));
        setIdSucursal(creatorIsJefeTienda ? Number(businessUser?.id_sucursal ?? 0) : Number(item?.id_sucursal ?? 0));
        setFlagSuperAdmin(Boolean(item?.flag_super_admin ?? false));
    }, [activoId, businessUser?.id_sucursal, creatorIsJefeTienda, isOpen, item, loadCatalogs]);

    const handleSave = async () => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!username.trim()) return addToast("error", "El username es obligatorio");
        if (!nombre.trim()) return addToast("error", "El nombre es obligatorio");
        if (!normalizedEmail) return addToast("error", "El email es obligatorio");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return addToast("error", "El email no tiene un formato valido");
        if (!idRol) return addToast("error", "El rol es obligatorio");
        if (!idSucursal) return addToast("error", "La sucursal es obligatoria");
        if (!idEstado) return addToast("error", "El estado es obligatorio");

        setIsSaving(true);
        try {
            const params = {
                p_username: username.trim(),
                p_email: normalizedEmail,
                p_nombre: nombre.trim(),
                p_id_estado: idEstado,
                p_id_sucursal: creatorIsJefeTienda ? Number(businessUser?.id_sucursal) : idSucursal,
                p_id_rol: creatorIsJefeTienda ? 4 : idRol,
                p_flag_super_admin: creatorIsAdministrator && flagSuperAdmin,
            };
            if (isEditing) {
                await usuarioService.update(Number(item.id), params);
                addToast("success", "Usuario actualizado correctamente");
            } else {
                await usuarioService.create(params);
                addToast("success", "Usuario creado. Supabase envio la invitacion a su correo");
            }
            onSave();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "Error al guardar el usuario");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="relative z-10 w-full max-w-md rounded-xl bg-primary p-6 shadow-xl"
                    >
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">{isEditing ? "Editar Usuario" : "Nuevo Usuario"}</h2>
                            <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
                        </div>

                        <div className="flex flex-col gap-4">
                            <Input label="Username" placeholder="Ingrese el username" size="sm" isRequired value={username} onChange={setUsername} />
                            <Input label="Email" placeholder="usuario@correo.com" size="sm" type="email" isRequired value={email} onChange={setEmail} />
                            <Input label="Nombre" placeholder="Ingrese el nombre" size="sm" isRequired value={nombre} onChange={setNombre} />
                            {!isEditing && <p className="text-xs text-tertiary">El usuario recibira un correo para definir su propia contrasena.</p>}
                            <Select
                                label="Rol"
                                placeholder="Seleccione un rol"
                                size="sm"
                                isRequired
                                items={rolItems}
                                selectedKey={idRol}
                                isDisabled={creatorIsJefeTienda}
                                onSelectionChange={(key) => key !== null && setIdRol(Number(key))}
                            >
                                {(role) => <Select.Item id={role.id}>{role.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Sucursal"
                                placeholder="Seleccione una sucursal"
                                size="sm"
                                isRequired
                                items={sucursalItems}
                                selectedKey={idSucursal}
                                isDisabled={creatorIsJefeTienda}
                                onSelectionChange={(key) => key !== null && setIdSucursal(Number(key))}
                            >
                                {(branch) => <Select.Item id={branch.id}>{branch.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Estado"
                                placeholder="Seleccione un estado"
                                size="sm"
                                isRequired
                                items={estadoItems}
                                selectedKey={idEstado}
                                onSelectionChange={(key) => key !== null && setIdEstado(Number(key))}
                            >
                                {(state) => <Select.Item id={state.id}>{state.label}</Select.Item>}
                            </Select>
                            {creatorIsAdministrator && <Checkbox label="Super Admin" isSelected={flagSuperAdmin} onChange={setFlagSuperAdmin} />}
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-3">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave}>
                                Guardar
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
