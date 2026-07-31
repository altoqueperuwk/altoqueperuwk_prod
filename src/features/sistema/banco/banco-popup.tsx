// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Plus, Trash01, X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface BancoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const parseJsonArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string") as string[];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed.filter((v: unknown) => typeof v === "string") as string[];
  } catch { /* ignore */ }
  return [];
};

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const BancoPopup = ({ isOpen, onClose, onSave, item }: BancoPopupProps) => {
  const { estados } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [nombre, setNombre] = useState("");
  const [nombreAbreviatura, setNombreAbreviatura] = useState("");
  const [equivalencias, setEquivalencias] = useState<string[]>([]);
  const [nuevaEquivalencia, setNuevaEquivalencia] = useState("");
  const [tipo, setTipo] = useState("");
  const [flagPermiteDeposito, setFlagPermiteDeposito] = useState(false);
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setNombre((item.nombre as string) ?? "");
        setNombreAbreviatura((item.nombre_abreviatura as string) ?? "");
        setEquivalencias(parseJsonArray(item.nombre_equivalencia));
        setNuevaEquivalencia("");
        setTipo((item.tipo as string) ?? "");
        setFlagPermiteDeposito(!!item.flag_permite_deposito);
        setIdEstado(Number(item.id_estado ?? 0));
      } else {
        setNombre("");
        setNombreAbreviatura("");
        setEquivalencias([]);
        setNuevaEquivalencia("");
        setTipo("");
        setFlagPermiteDeposito(false);
        setIdEstado(getActivoId(estadoItems));
      }
    }
  }, [isOpen, item]);

  const handleAddEquivalencia = () => {
    const trimmed = nuevaEquivalencia.trim();
    if (!trimmed) return;
    if (equivalencias.includes(trimmed)) return;
    setEquivalencias((prev) => [...prev, trimmed]);
    setNuevaEquivalencia("");
  };

  const handleRemoveEquivalencia = (idx: number) => {
    setEquivalencias((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!nombre.trim()) { addToast("error", "El nombre es obligatorio"); return; }
    if (!idEstado) { addToast("error", "El estado es obligatorio"); return; }

    setIsSaving(true);
    try {
      const params: Record<string, unknown> = {
        p_nombre: nombre.trim(),
        p_nombre_abreviatura: nombreAbreviatura.trim(),
        p_nombre_equivalencia: equivalencias.length > 0 ? equivalencias : null,
        p_tipo: tipo || null,
        p_flag_permite_deposito: flagPermiteDeposito,
        p_id_estado: idEstado as number,
      };

      if (isEditing) {
        await bancoService.update(item!.id as number, params);
        addToast("success", "Banco actualizado correctamente");
      } else {
        await bancoService.create(params);
        addToast("success", "Banco creado correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar el banco");
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-primary">{isEditing ? "Editar Banco" : "Nuevo Banco"}</h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <Input label="Nombre" placeholder="Ingrese el nombre del banco" size="sm" isRequired value={nombre} onChange={setNombre} />
              <Input label="Abreviatura" placeholder="Ingrese la abreviatura" size="sm" value={nombreAbreviatura} onChange={setNombreAbreviatura} />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-secondary">Equivalencias</label>
                <div className="flex gap-2">
                  <Input placeholder="Agregar equivalencia"
                    size="sm" value={nuevaEquivalencia} onChange={setNuevaEquivalencia}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddEquivalencia(); }}}
                  />
                  <Button size="sm" color="secondary" iconLeading={Plus} onClick={handleAddEquivalencia}
                    isDisabled={!nuevaEquivalencia.trim()} />
                </div>
                {equivalencias.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {equivalencias.map((eq, idx) => (
                      <span key={idx}
                        className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-sm text-secondary"
                      >
                        {eq}
                        <button onClick={() => handleRemoveEquivalencia(idx)}
                          className="ml-0.5 cursor-pointer text-fg-quaternary hover:text-fg-error-primary">
                          <Trash01 className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Select label="Tipo" placeholder="Seleccione el tipo" size="sm"
                items={[
                  { id: "Tarjeta Crédito", label: "Tarjeta Crédito" },
                  { id: "Tarjeta Comercial", label: "Tarjeta Comercial" },
                  { id: "Recaudación", label: "Recaudación" },
                  { id: "Billeteras Digitales", label: "Billeteras Digitales" },
                ]} selectedKey={tipo}
                onSelectionChange={(key) => { if (key !== null) setTipo(String(key)); }}>
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>
              <Checkbox label="Permite Depósito" isSelected={flagPermiteDeposito} onChange={setFlagPermiteDeposito} />
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
