// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { sucursalService } from "@/services/sucursal.service";

interface SucursalPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const SucursalPopup = ({ isOpen, onClose, onSave, item }: SucursalPopupProps) => {
  const { estados } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [celular, setCelular] = useState("");

  const handleCelularChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    setCelular(digits);
  };
  const [email, setEmail] = useState("");
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const estadoItems = useMemo(
    () =>
      (estados || []).map((e) => ({
        id: e.id as string | number,
        label: e.nombre as string,
      })),
    [estados],
  );

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setNombre((item.nombre as string) ?? "");
        setDireccion((item.direccion as string) ?? "");
        setCelular((item.celular as string) ?? "");
        setEmail((item.email as string) ?? "");
        { const v = Number(item.id_estado ?? 0); setIdEstado(v) };
      } else {
        setNombre("");
        setDireccion("");
        setCelular("");
        setEmail("");
        setIdEstado(getActivoId(estadoItems));
      }
    }
  }, [isOpen, item]);

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
      if (isEditing) {
        await sucursalService.update(item!.id as number, {
          p_nombre: nombre.trim(),
          p_direccion: direccion.trim() || undefined,
          p_celular: celular.trim() || undefined,
          p_email: email.trim() || undefined,
          p_id_estado: idEstado as number,
        });
        addToast("success", "Sucursal actualizada correctamente");
      } else {
        await sucursalService.create({
          p_nombre: nombre.trim(),
          p_direccion: direccion.trim() || undefined,
          p_celular: celular.trim() || undefined,
          p_email: email.trim() || undefined,
          p_id_estado: idEstado as number,
        });
        addToast("success", "Sucursal creada correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar la sucursal");
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
                {isEditing ? "Editar Sucursal" : "Nueva Sucursal"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Nombre"
                placeholder="Ingrese el nombre de la sucursal"
                size="sm"
                isRequired
                value={nombre}
                onChange={setNombre}
              />
              <Input
                label="Dirección"
                placeholder="Ingrese la dirección"
                size="sm"
                value={direccion}
                onChange={setDireccion}
              />
              <Input
                label="Celular"
                placeholder="Ingrese el celular"
                size="sm"
                value={celular}
                onChange={handleCelularChange}
              />
              <Input
                label="Email"
                placeholder="Ingrese el email"
                size="sm"
                value={email}
                onChange={setEmail}
              />
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
