// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { clienteService } from "@/services/cliente.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface ClienteWhatsappPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const TIPO_DOCUMENTO_OPTIONS = [
  { id: 1, label: "DNI" },
  { id: 2, label: "CE" },
];

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const ClienteWhatsappPopup = ({ isOpen, onClose, onSave, item }: ClienteWhatsappPopupProps) => {
  const { estados, comunidades } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [tipoDocumento, setTipoDocumento] = useState<number>(1);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [idComunidad, setIdComunidad] = useState<number>(0);
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
  const comunidadItems = useMemo(
    () => (comunidades || []).map((c) => ({ id: c.id as string | number, label: c.nombre as string })),
    [comunidades],
  );

  useEffect(() => {
    if (!isOpen) return;

    if (item) {
      setTipoDocumento(Number(item.tipo_documento) || 1);
      setNumeroDocumento((item.numero_documento as string) ?? "");
      setNombre((item.nombre as string) ?? "");
      setWhatsapp(item.celular ? String(item.celular) : "");
      setIdComunidad(Number(item.id_comunidad ?? 0));
      setIdEstado(Number(item.id_estado ?? 0));
      return;
    }

    setTipoDocumento(1);
    setNumeroDocumento("");
    setNombre("");
    setWhatsapp("");
    setIdComunidad(0);
    setIdEstado(getActivoId(estadoItems));
  }, [isOpen, item, estadoItems]);

  const handleNumeroDocumentoChange = (value: string) => {
    setNumeroDocumento(value.replace(/\D/g, "").slice(0, tipoDocumento === 1 ? 8 : 9));
  };

  const handleWhatsappChange = (value: string) => {
    setWhatsapp(value.replace(/\D/g, "").slice(0, 9));
  };

  const handleSave = async () => {
    const doc = numeroDocumento.replace(/\D/g, "");
    if (!doc) {
      addToast("error", "El numero de documento es obligatorio");
      return;
    }
    if (tipoDocumento === 1 && doc.length !== 8) {
      addToast("error", "El DNI debe tener exactamente 8 digitos");
      return;
    }
    if (tipoDocumento === 2 && doc.length !== 9) {
      addToast("error", "El CE debe tener exactamente 9 digitos");
      return;
    }
    if (!idEstado) {
      addToast("error", "El estado es obligatorio");
      return;
    }

    setIsSaving(true);
    try {
      const params: Record<string, unknown> = {
        p_tipo_documento: tipoDocumento,
        p_numero_documento: doc,
        p_nombre: nombre.trim(),
        p_celular: whatsapp ? Number(whatsapp) : null,
        p_id_estado: idEstado,
      };
      if (isEditing && !whatsapp) params.p_flag_limpiar_celular = true;
      if (idComunidad) params.p_id_comunidad = idComunidad;

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
            <div className="atk-modal-head mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary">{isEditing ? "Editar Cliente" : "Nuevo Cliente"}</h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-end gap-2">
                <div className="w-24">
                  <Select
                    label="Tipo Doc."
                    placeholder="DNI"
                    size="sm"
                    items={TIPO_DOCUMENTO_OPTIONS}
                    selectedKey={tipoDocumento}
                    onSelectionChange={(key) => {
                      if (key !== null) {
                        setTipoDocumento(Number(key));
                        setNumeroDocumento("");
                      }
                    }}
                  >
                    {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    label="Nro. Documento"
                    placeholder={tipoDocumento === 1 ? "8 digitos" : "9 digitos"}
                    size="sm"
                    isRequired
                    value={numeroDocumento}
                    onChange={handleNumeroDocumentoChange}
                  />
                </div>
              </div>

              <Input label="Nombre" placeholder="Ingrese el nombre" size="sm" value={nombre} onChange={setNombre} />
              <Input label="Whatsapp" placeholder="9 digitos" size="sm" value={whatsapp} onChange={handleWhatsappChange} />

              <Select
                label="Comunidad"
                placeholder="Seleccione una comunidad"
                size="sm"
                items={comunidadItems}
                selectedKey={idComunidad}
                onSelectionChange={(key) => {
                  if (key !== null) setIdComunidad(Number(key));
                }}
              >
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>

              <Select
                label="Estado"
                placeholder="Seleccione un estado"
                size="sm"
                isRequired
                items={estadoItems}
                selectedKey={idEstado}
                onSelectionChange={(key) => {
                  if (key !== null) setIdEstado(Number(key));
                }}
              >
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>
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
