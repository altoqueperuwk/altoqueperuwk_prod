// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Plus, Trash01, X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { clienteService } from "@/services/cliente.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface ClientePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const TIPO_DOCUMENTO_OPTIONS = [
  { id: 1, label: "DNI" },
  { id: 2, label: "CE" },
];

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

export const ClientePopup = ({ isOpen, onClose, onSave, item }: ClientePopupProps) => {
  const { estados, comunidades } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [tipoDocumento, setTipoDocumento] = useState<number>(1);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [nombre, setNombre] = useState("");
  const [celulares, setCelulares] = useState<string[]>([]);
  const [nuevoCelular, setNuevoCelular] = useState("");
  const [idComunidad, setIdComunidad] = useState<number>(0);
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  const comunidadItems = useMemo(
    () => (comunidades || []).map((c) => ({ id: c.id as string | number, label: c.nombre as string })),
    [comunidades],
  );

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setTipoDocumento(Number(item.tipo_documento) || 1);
        setNumeroDocumento((item.numero_documento as string) ?? "");
        setNombre((item.nombre as string) ?? "");
        setCelulares(parseJsonArray(item.celular));
        setNuevoCelular("");
        setIdComunidad(Number(item.id_comunidad ?? 0));
        setIdEstado(Number(item.id_estado ?? 0));
      } else {
        setTipoDocumento(1);
        setNumeroDocumento("");
        setNombre("");
        setCelulares([]);
        setNuevoCelular("");
        setIdComunidad(0);
        setIdEstado(getActivoId(estadoItems));
      }
    }
  }, [isOpen, item]);

  const handleNuevoCelularChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    setNuevoCelular(digits);
  };

  const handleAddCelular = () => {
    if (!nuevoCelular) return;
    if (celulares.includes(nuevoCelular)) return;
    setCelulares((prev) => [...prev, nuevoCelular]);
    setNuevoCelular("");
  };

  const handleRemoveCelular = (idx: number) => {
    setCelulares((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const doc = numeroDocumento.replace(/\D/g, "");
    if (!doc) { addToast("error", "El número de documento es obligatorio"); return; }

    if (tipoDocumento === 1 && doc.length !== 8) {
      addToast("error", "El DNI debe tener exactamente 8 dígitos");
      return;
    }
    if (tipoDocumento === 2 && doc.length !== 9) {
      addToast("error", "El CE debe tener exactamente 9 dígitos");
      return;
    }
    if (!idEstado) { addToast("error", "El estado es obligatorio"); return; }

    setIsSaving(true);
    try {
      const params: Record<string, unknown> = {
        p_tipo_documento: tipoDocumento as number,
        p_numero_documento: doc,
        p_nombre: nombre.trim(),
        p_celular: celulares.length > 0 ? celulares : null,
        p_id_estado: idEstado as number,
      };
      if (idComunidad) params.p_id_comunidad = idComunidad as number;

      if (isEditing) {
        await clienteService.update(item!.id as number, params);
        addToast("success", "Cliente actualizado correctamente");
      } else {
        await clienteService.create(params);
        addToast("success", "Cliente creado correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar el cliente");
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
              <h2 className="text-lg font-semibold text-primary">{isEditing ? "Editar Cliente" : "Nuevo Cliente"}</h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex gap-2 items-end">
                <div className="w-24">
                  <Select label="Tipo Doc." placeholder="DNI" size="sm"
                    items={TIPO_DOCUMENTO_OPTIONS} selectedKey={tipoDocumento}
                    onSelectionChange={(key) => { if (key !== null) setTipoDocumento(Number(key)); }}>
                    {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                  </Select>
                </div>
                <div className="flex-1">
                  <Input label="Número Documento"
                    placeholder={tipoDocumento === 1 ? "8 dígitos" : "9 dígitos"}
                    size="sm" isRequired value={numeroDocumento} onChange={setNumeroDocumento} />
                </div>
              </div>

              <Input label="Nombre" placeholder="Ingrese el nombre" size="sm" value={nombre} onChange={setNombre} />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-secondary">Celulares</label>
                <div className="flex gap-2">
                  <Input placeholder="Agregar número celular"
                    size="sm" value={nuevoCelular} onChange={handleNuevoCelularChange}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCelular(); }}}
                  />
                  <Button size="sm" color="secondary" iconLeading={Plus} onClick={handleAddCelular}
                    isDisabled={!nuevoCelular.trim()} />
                </div>
                {celulares.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {celulares.map((cel, idx) => (
                      <span key={idx}
                        className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-sm text-secondary"
                      >
                        {cel}
                        <button onClick={() => handleRemoveCelular(idx)}
                          className="ml-0.5 cursor-pointer text-fg-quaternary hover:text-fg-error-primary">
                          <Trash01 className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Select label="Comunidad" placeholder="Seleccione una comunidad" size="sm"
                items={comunidadItems} selectedKey={idComunidad}
                onSelectionChange={(key) => { if (key !== null) setIdComunidad(Number(key)) }}>
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
