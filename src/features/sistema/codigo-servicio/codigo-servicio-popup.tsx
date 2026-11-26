// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { codigoServicioService } from "@/services/codigo-servicio.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface CodigoServicioPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const TIPO_OPTIONS = [
  { id: "Efectivizacion", label: "Efectivizacion" },
  { id: "Pago Deuda", label: "Pago Deuda" },
];

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const CodigoServicioPopup = ({ isOpen, onClose, onSave, item }: CodigoServicioPopupProps) => {
  const { estados } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setNombre((item.nombre as string) ?? "");
        setTipo((item.tipo as string) ?? "");
        setIdEstado(Number(item.id_estado ?? 0));
      } else {
        setNombre("");
        setTipo("");
        setIdEstado(getActivoId(estadoItems));
      }
    }
  }, [isOpen, item]);

  const handleSave = async () => {
    if (!nombre.trim()) { addToast("error", "El nombre es obligatorio"); return; }
    if (!tipo) { addToast("error", "El tipo es obligatorio"); return; }
    if (!idEstado) { addToast("error", "El estado es obligatorio"); return; }

    setIsSaving(true);
    try {
      if (isEditing) {
        await codigoServicioService.update(item!.id as number, {
          p_nombre: nombre.trim(),
          p_tipo: tipo,
          p_id_estado: idEstado as number,
        });
        addToast("success", "Código de servicio actualizado correctamente");
      } else {
        await codigoServicioService.create({
          p_nombre: nombre.trim(),
          p_tipo: tipo,
          p_id_estado: idEstado as number,
        });
        addToast("success", "Código de servicio creado correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar el código de servicio");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose}
          />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-md rounded-xl bg-primary p-6 shadow-xl"
          >
            <div className="atk-modal-head flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-primary">
                {isEditing ? "Editar Código de Servicio" : "Nuevo Código de Servicio"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <Input label="Nombre" placeholder="Ingrese el nombre" size="sm" isRequired value={nombre} onChange={setNombre} />
              <Select label="Tipo" placeholder="Seleccione el tipo" size="sm" isRequired
                items={TIPO_OPTIONS} selectedKey={tipo}
                onSelectionChange={(key) => { if (key !== null) setTipo(String(key)); }}>
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>
              <Select label="Estado" placeholder="Seleccione un estado" size="sm" isRequired
                items={estadoItems} selectedKey={idEstado}
                onSelectionChange={(key) => { if (key !== null) setIdEstado(Number(key)) }}>
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button>
              <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave}>Guardar</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
