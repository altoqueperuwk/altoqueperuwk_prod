// @ts-nocheck
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { X, Check } from "@untitledui/icons";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";

interface EstadoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

export const EstadoPopup = ({ isOpen, onClose, onSave, item }: EstadoPopupProps) => {
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [nombre, setNombre] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setNombre((item.nombre as string) ?? "");
      } else {
        setNombre("");
      }
    }
  }, [isOpen, item]);

  const handleSave = async () => {
    if (!nombre.trim()) {
      addToast("error", "El nombre es obligatorio");
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing) {
        await estadoService.update(item!.id as number, { p_nombre: nombre.trim() });
        addToast("success", "Estado actualizado correctamente");
      } else {
        await estadoService.create({ p_nombre: nombre.trim() });
        addToast("success", "Estado creado correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar el estado");
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
                {isEditing ? "Editar Estado" : "Nuevo Estado"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Nombre"
                placeholder="Ingrese el nombre del estado"
                size="sm"
                isRequired
                value={nombre}
                onChange={setNombre}
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
