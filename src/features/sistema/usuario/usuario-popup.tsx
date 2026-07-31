// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { usuarioService } from "@/services/usuario.service";
import { rolService } from "@/services/rol.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface UsuarioPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const UsuarioPopup = ({ isOpen, onClose, onSave, item }: UsuarioPopupProps) => {
  const { estados } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [idRol, setIdRol] = useState<number>(0);
  const [idEstado, setIdEstado] = useState<number>(0);
  const [flagSuperAdmin, setFlagSuperAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [roles, setRoles] = useState<Record<string, unknown>[]>([]);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  const rolItems = useMemo(
    () =>
      roles.map((r) => ({
        id: r.id as string | number,
        label: r.nombre as string,
      })),
    [roles],
  );

  const loadRoles = useCallback(async () => {
    try {
      const result = await rolService.getList();
      setRoles(result);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRoles();
      if (item) {
        setUsername((item.username as string) ?? "");
        setPassword("");
        setEmail((item.email as string) ?? "");
        setNombre((item.nombre as string) ?? "");
        { const v = Number(item.id_rol ?? 0); setIdRol(v) };
        { const v = Number(item.id_estado ?? 0); setIdEstado(v) };
        setFlagSuperAdmin((item.flag_super_admin as boolean) ?? false);
      } else {
        setUsername("");
        setPassword("");
        setEmail("");
        setNombre("");
        setIdRol(0);
        setIdEstado(getActivoId(estadoItems));
        setFlagSuperAdmin(false);
      }
    }
  }, [isOpen, item, loadRoles]);

  const handleSave = async () => {
    if (!username.trim()) {
      addToast("error", "El username es obligatorio");
      return;
    }
    if (!nombre.trim()) {
      addToast("error", "El nombre es obligatorio");
      return;
    }
    if (!email.trim()) {
      addToast("error", "El email es obligatorio");
      return;
    }
    if (!idRol) {
      addToast("error", "El rol es obligatorio");
      return;
    }
    if (!idEstado) {
      addToast("error", "El estado es obligatorio");
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        const params: Record<string, unknown> = {
          p_username: username.trim(),
          p_email: email.trim(),
          p_nombre: nombre.trim(),
          p_id_rol: idRol as number,
          p_id_estado: idEstado as number,
          p_flag_super_admin: flagSuperAdmin,
        };
        if (password) {
          params.p_password = password;
        }
        await usuarioService.update(item!.id as number, params);
        addToast("success", "Usuario actualizado correctamente");
      } else {
        if (!password) {
          addToast("error", "La contraseña es obligatoria");
          setIsSaving(false);
          return;
        }
        await usuarioService.create({
          p_username: username.trim(),
          p_password: password,
          p_email: email.trim(),
          p_nombre: nombre.trim(),
          p_id_rol: idRol as number,
          p_id_estado: idEstado as number,
          p_flag_super_admin: flagSuperAdmin,
        });
        addToast("success", "Usuario creado correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar el usuario");
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-primary">
                {isEditing ? "Editar Usuario" : "Nuevo Usuario"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Username"
                placeholder="Ingrese el username"
                size="sm"
                isRequired
                value={username}
                onChange={setUsername}
              />
              <Input
                label="Contraseña"
                placeholder={isEditing ? "Dejar vacío para no cambiar" : "Ingrese la contraseña"}
                size="sm"
                isRequired={!isEditing}
                type="password"
                value={password}
                onChange={setPassword}
              />
              <Input
                label="Email"
                placeholder="Ingrese el email"
                size="sm"
                isRequired
                value={email}
                onChange={setEmail}
              />
              <Input
                label="Nombre"
                placeholder="Ingrese el nombre"
                size="sm"
                isRequired
                value={nombre}
                onChange={setNombre}
              />
              <Select
                label="Rol"
                placeholder="Seleccione un rol"
                size="sm"
                isRequired
                items={rolItems}
                selectedKey={idRol}
                onSelectionChange={(key) => { if (key !== null) setIdRol(Number(key)) }}
              >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
              </Select>
              <Select
                label="Estado"
                placeholder="Seleccione un estado"
                size="sm"
                isRequired
                items={estadoItems}
                selectedKey={idEstado}
                onSelectionChange={(key) => { if (key !== null) setIdEstado(Number(key)) }}
              >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
              </Select>
              <Checkbox
                label="Super Admin"
                isSelected={flagSuperAdmin}
                onChange={setFlagSuperAdmin}
              />
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <Button size="sm" color="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                color="primary"
                iconLeading={Check}
                isLoading={isSaving}
                onClick={handleSave}
              >
                Guardar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
