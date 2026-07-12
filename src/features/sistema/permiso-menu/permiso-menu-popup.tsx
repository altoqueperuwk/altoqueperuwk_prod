// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { permisoMenuService } from "@/services/permiso-menu.service";

interface PermisoMenuPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const PermisoMenuPopup = ({ isOpen, onClose, onSave, item }: PermisoMenuPopupProps) => {
  const { estados } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [nombre, setNombre] = useState("");
  const [ruta, setRuta] = useState("");
  const [icono, setIcono] = useState("");
  const [orden, setOrden] = useState("");
  const [idPadre, setIdPadre] = useState<number>(0);
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const [menus, setMenus] = useState<Record<string, unknown>[]>([]);

  const estadoItems = useMemo(
    () =>
      (estados || []).map((e) => ({
        id: e.id as string | number,
        label: e.nombre as string,
      })),
    [estados],
  );

  const menuPadreItems = useMemo(
    () =>
      menus.map((m) => ({
        id: m.id as string | number,
        label: m.nombre as string,
      })),
    [menus],
  );

  const loadMenus = useCallback(async () => {
    try {
      const result = await permisoMenuService.getList();
      setMenus(result);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadMenus();
      if (item) {
        setNombre((item.nombre as string) ?? "");
        setRuta((item.ruta as string) ?? "");
        setIcono((item.icono as string) ?? "");
        setOrden(item.orden != null ? String(item.orden) : "");
        { const v = Number(item.id_padre ?? 0); setIdPadre(v) };
        { const v = Number(item.id_estado ?? 0); setIdEstado(v) };
      } else {
        setNombre("");
        setRuta("");
        setIcono("");
        setOrden("");
        setIdPadre(0);
        setIdEstado(getActivoId(estadoItems));
      }
    }
  }, [isOpen, item, loadMenus]);

  const handleSave = async () => {
    if (!nombre.trim()) {
      addToast("error", "El nombre es obligatorio");
      return;
    }
    if (!idEstado) {
      addToast("error", "El estado es obligatorio");
      return;
    }

    setIsSaving(true);
    try {
      const params: Record<string, unknown> = {
        p_nombre: nombre.trim(),
        p_id_estado: idEstado as number,
      };
      if (ruta.trim()) params.p_ruta = ruta.trim();
      if (icono.trim()) params.p_icono = icono.trim();
      if (orden) params.p_orden = Number(orden);
      if (idPadre) params.p_id_padre = idPadre as number;

      if (isEditing) {
        await permisoMenuService.update(item!.id as number, params);
        addToast("success", "Permiso de menú actualizado correctamente");
      } else {
        await permisoMenuService.create(params as Required<typeof params>);
        addToast("success", "Permiso de menú creado correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar el permiso de menú");
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
                {isEditing ? "Editar Permiso de Menú" : "Nuevo Permiso de Menú"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Nombre"
                placeholder="Ingrese el nombre"
                size="sm"
                isRequired
                value={nombre}
                onChange={setNombre}
              />
              <Input
                label="Ruta"
                placeholder="Ingrese la ruta"
                size="sm"
                value={ruta}
                onChange={setRuta}
              />
              <Input
                label="Icono"
                placeholder="Ingrese el icono"
                size="sm"
                value={icono}
                onChange={setIcono}
              />
              <Input
                label="Orden"
                placeholder="Ingrese el orden"
                size="sm"
                type="number"
                value={orden}
                onChange={setOrden}
              />
              <Select
                label="Menú Padre"
                placeholder="(Sin padre)"
                size="sm"
                items={menuPadreItems}
                selectedKey={idPadre}
                onSelectionChange={(key) => { if (key !== null) setIdPadre(Number(key)) }}
              >
                {(menuItem) => <Select.Item id={menuItem.id}>{menuItem.label}</Select.Item>}
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
                {(estadoItem) => <Select.Item id={estadoItem.id}>{estadoItem.label}</Select.Item>}
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
