// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { } from "@/components/base/input/input";
import { X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { permisoUsuarioService } from "@/services/permiso-usuario.service";
import { usuarioService } from "@/services/usuario.service";
import { permisoMenuService } from "@/services/permiso-menu.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface PermisoUsuarioPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const PermisoUsuarioPopup = ({ isOpen, onClose, onSave, item }: PermisoUsuarioPopupProps) => {
  const { estados } = useSessionCache();
  const { businessUser } = useAuth();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [idUsuario, setIdUsuario] = useState<number>(0);
  const [idPermisoMenu, setIdPermisoMenu] = useState<number>(0);
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const [usuarios, setUsuarios] = useState<Record<string, unknown>[]>([]);
  const [menus, setMenus] = useState<Record<string, unknown>[]>([]);

  const [bulkUsuario, setBulkUsuario] = useState<number>(0);
  const [bulkMenus, setBulkMenus] = useState<Record<string, boolean>>({});
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  const usuarioItems = useMemo(
    () =>
      usuarios.map((u) => ({
        id: u.id as string | number,
        label: (u.nombre as string) || (u.username as string) || String(u.id),
      })),
    [usuarios],
  );

  const menuItems = useMemo(
    () =>
      menus.map((m) => ({
        id: m.id as string | number,
        label: m.nombre as string,
      })),
    [menus],
  );

  const loadCatalogs = useCallback(async () => {
    try {
      const [users, allMenus] = await Promise.all([
        usuarioService.getList(),
        permisoMenuService.getList(),
      ]);
      setUsuarios(users);
      setMenus(allMenus);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCatalogs();
      if (item) {
        { const v = Number(item.id_usuario ?? 0); setIdUsuario(v) };
        { const v = Number(item.id_permiso_menu ?? 0); setIdPermisoMenu(v) };
        { const v = Number(item.id_estado ?? 0); setIdEstado(v) };
      } else {
        setIdUsuario(0);
        setIdPermisoMenu(0);
        setIdEstado(getActivoId(estadoItems));
      }
      setBulkUsuario("");
      setBulkMenus({});
    }
  }, [isOpen, item, loadCatalogs]);

  const handleSave = async () => {
    if (!idUsuario) {
      addToast("error", "El usuario es obligatorio");
      return;
    }
    if (!idPermisoMenu) {
      addToast("error", "El menú es obligatorio");
      return;
    }
    if (!idEstado) {
      addToast("error", "El estado es obligatorio");
      return;
    }

    setIsSaving(true);
    try {
      const params: Record<string, unknown> = {
        p_id_usuario: idUsuario as number,
        p_id_permiso_menu: idPermisoMenu as number,
        p_id_estado: idEstado as number,
      };

      if (isEditing) {
        await permisoUsuarioService.update(item!.id as number, params);
        addToast("success", "Permiso de usuario actualizado correctamente");
      } else {
        await permisoUsuarioService.create(params as Required<typeof params>);
        addToast("success", "Permiso de usuario creado correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar el permiso de usuario");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkUsuario) {
      addToast("error", "Seleccione un usuario para la asignación masiva");
      return;
    }

    const selectedMenuIds = Object.entries(bulkMenus)
      .filter(([, selected]) => selected)
      .map(([id]) => Number(id));

    if (selectedMenuIds.length === 0) {
      addToast("error", "Seleccione al menos un menú para asignar");
      return;
    }

    setIsBulkSaving(true);
    try {
      await permisoUsuarioService.assignLote(
        bulkUsuario as number,
        selectedMenuIds,
        businessUser?.id ? Number(businessUser.id) : undefined,
      );
      addToast("success", "Permisos asignados correctamente");
      onSave();
    } catch {
      addToast("error", "Error al asignar los permisos");
    } finally {
      setIsBulkSaving(false);
    }
  };

  const toggleBulkMenu = (menuId: string) => {
    setBulkMenus((prev) => ({
      ...prev,
      [menuId]: !prev[menuId],
    }));
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
            className="relative z-10 w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="atk-modal-head flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-primary">
                {isEditing ? "Editar Permiso de Usuario" : "Nuevo Permiso de Usuario"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <Select
                label="Usuario"
                placeholder="Seleccione un usuario"
                size="sm"
                isRequired
                items={usuarioItems}
                selectedKey={idUsuario}
                onSelectionChange={(key) => { if (key !== null) setIdUsuario(Number(key)) }}
              >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
              </Select>
              <Select
                label="Menú"
                placeholder="Seleccione un menú"
                size="sm"
                isRequired
                items={menuItems}
                selectedKey={idPermisoMenu}
                onSelectionChange={(key) => { if (key !== null) setIdPermisoMenu(Number(key)) }}
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

            <div className="mt-8 pt-6 border-t border-secondary">
              <h3 className="text-base font-semibold text-primary mb-4">
                Asignación Masiva de Permisos
              </h3>
              <div className="flex flex-col gap-4">
                <Select
                  label="Usuario"
                  placeholder="Seleccione un usuario"
                  size="sm"
                  items={usuarioItems}
                  selectedKey={bulkUsuario}
                  onSelectionChange={(key) => {
                    setBulkUsuario(key);
                    setBulkMenus({});
                  }}
                >
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                {bulkUsuario && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-secondary">Menús disponibles</p>
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg border border-secondary p-3">
                      {menuItems.map((menu) => (
                        <Checkbox
                          key={menu.id}
                          label={menu.label}
                          isSelected={bulkMenus[String(menu.id)] ?? false}
                          onChange={() => toggleBulkMenu(String(menu.id))}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    color="primary"
                    iconLeading={Check}
                    isLoading={isBulkSaving}
                    isDisabled={!bulkUsuario || Object.values(bulkMenus).every((v) => !v)}
                    onClick={handleBulkAssign}
                  >
                    Asignar Lote
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
