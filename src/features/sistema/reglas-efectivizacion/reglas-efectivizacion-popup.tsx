// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface ReglasEfectivizacionPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
}

const TIPO_DEPOSITO_OPTIONS = [
  { id: "Mismo Día", label: "Mismo Día" },
  { id: "Día Siguiente", label: "Día Siguiente" },
];

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

export const ReglasEfectivizacionPopup = ({ isOpen, onClose, onSave, item }: ReglasEfectivizacionPopupProps) => {
  const { estados, bancos, comunidades, codigosServicio } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [idCodigoServicio, setIdCodigoServicio] = useState<number>(0);
  const [idBanco, setIdBanco] = useState<number>(0);
  const [idComunidad, setIdComunidad] = useState<number>(0);
  const [comisionServicio, setComisionServicio] = useState("");
  const [montoMinimoDepositoServicio, setMontoMinimoDepositoServicio] = useState("");
  const [comisionMinimaServicio, setComisionMinimaServicio] = useState("");
  const [tipoDeposito, setTipoDeposito] = useState<string>("");
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  const bancoItems = useMemo(
    () => (bancos || []).map((b) => ({ id: b.id as string | number, label: b.nombre as string })),
    [bancos],
  );

  const comunidadItems = useMemo(
    () => (comunidades || []).map((c) => ({ id: c.id as string | number, label: c.nombre as string })),
    [comunidades],
  );

  const codigoServicioItems = useMemo(
    () => (codigosServicio || []).map((cs) => ({ id: cs.id as string | number, label: cs.nombre as string })),
    [codigosServicio],
  );

  const parseNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const num = Number(trimmed);
    return isNaN(num) ? null : num;
  };

  useEffect(() => {
    if (isOpen) {
      if (item) {
        { const v = Number(item.id_codigo_servicio ?? 0); setIdCodigoServicio(v) };
        { const v = Number(item.id_banco ?? 0); setIdBanco(v) };
        { const v = Number(item.id_comunidad ?? 0); setIdComunidad(v) };
        setComisionServicio(item.comision_servicio != null ? String(item.comision_servicio) : "");
        setMontoMinimoDepositoServicio(item.monto_minimo_deposito_servicio != null ? String(item.monto_minimo_deposito_servicio) : "");
        setComisionMinimaServicio(item.comision_minima_servicio != null ? String(item.comision_minima_servicio) : "");
        setTipoDeposito(item.tipo_deposito != null ? String(item.tipo_deposito) : "");
        { const v = Number(item.id_estado ?? 0); setIdEstado(v) };
      } else {
        setIdCodigoServicio(0);
        setIdBanco(0);
        setIdComunidad(0);
        setComisionServicio("");
        setMontoMinimoDepositoServicio("");
        setComisionMinimaServicio("");
        setTipoDeposito("");
        setIdEstado(getActivoId(estadoItems));
      }
    }
  }, [isOpen, item]);

  const handleSave = async () => {
    if (!idCodigoServicio) { addToast("error", "El código de servicio es obligatorio"); return; }
    if (!idBanco) { addToast("error", "El banco es obligatorio"); return; }
    if (!idComunidad) { addToast("error", "La comunidad es obligatoria"); return; }
    if (!idEstado) { addToast("error", "El estado es obligatorio"); return; }

    setIsSaving(true);
    try {
      const params: Record<string, unknown> = {
        p_id_codigo_servicio: idCodigoServicio as number,
        p_id_banco: idBanco as number,
        p_id_comunidad: idComunidad as number,
        p_comision_servicio: parseNumber(comisionServicio),
        p_monto_minimo_deposito_servicio: parseNumber(montoMinimoDepositoServicio),
        p_comision_minima_servicio: parseNumber(comisionMinimaServicio),
        p_tipo_deposito: tipoDeposito || null,
        p_id_estado: idEstado as number,
      };

      if (isEditing) {
        await reglasEfectivizacionService.update(item!.id as number, params);
        addToast("success", "Regla de efectivización actualizada correctamente");
      } else {
        await reglasEfectivizacionService.create(params);
        addToast("success", "Regla de efectivización creada correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar la regla de efectivización");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-[640px] rounded-xl bg-primary p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-primary">
                {isEditing ? "Editar Regla de Efectivización" : "Nueva Regla de Efectivización"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <Select label="Código Servicio" placeholder="Seleccione" size="sm" isRequired
                  items={codigoServicioItems} selectedKey={idCodigoServicio}
                  onSelectionChange={(key) => { if (key !== null) setIdCodigoServicio(Number(key)) }}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Select label="Banco" placeholder="Seleccione" size="sm" isRequired
                  items={bancoItems} selectedKey={idBanco}
                  onSelectionChange={(key) => { if (key !== null) setIdBanco(Number(key)) }}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Select label="Comunidad" placeholder="Seleccione" size="sm" isRequired
                  items={comunidadItems} selectedKey={idComunidad}
                  onSelectionChange={(key) => { if (key !== null) setIdComunidad(Number(key)) }}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input label="Comisión Servicio" placeholder="% 0.0" size="sm" type="number"
                  value={comisionServicio} onChange={setComisionServicio} />
                <Input label="Monto Mínimo Depósito" placeholder="S/ 0.00" size="sm" type="number"
                  value={montoMinimoDepositoServicio} onChange={setMontoMinimoDepositoServicio} />
                <Input label="Comisión Mínima" placeholder="S/ 0.00" size="sm" type="number"
                  value={comisionMinimaServicio} onChange={setComisionMinimaServicio} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select label="Tipo Depósito" placeholder="Seleccione" size="sm"
                  items={TIPO_DEPOSITO_OPTIONS} selectedKey={tipoDeposito}
                  onSelectionChange={(key) => { if (key !== null) setTipoDeposito(String(key)) }}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Select label="Estado" placeholder="Seleccione un estado" size="sm" isRequired
                  items={estadoItems} selectedKey={idEstado}
                  onSelectionChange={(key) => { if (key !== null) setIdEstado(Number(key)) }}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button>
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
