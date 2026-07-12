// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { X, Check } from "@untitledui/icons";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { empresaCuentaBancariaService } from "@/services/empresa-cuenta-bancaria.service";

interface EmpresaCuentaBancariaPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  item: Record<string, unknown> | null;
  defaultIdEmpresa?: number;
}

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
  const activo = estadosList.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

const COMISION_TIPO_OPTIONS = [
  { id: false, label: "Porcentaje" },
  { id: true, label: "Por Sol" },
];

export const EmpresaCuentaBancariaPopup = ({ isOpen, onClose, onSave, item, defaultIdEmpresa }: EmpresaCuentaBancariaPopupProps) => {
  const { estados, empresas, bancos } = useSessionCache();
  const { addToast } = useToast();
  const isEditing = item !== null;

  const [idEmpresa, setIdEmpresa] = useState<number>(0);
  const [idBanco, setIdBanco] = useState<number>(0);
  const [flagPorSolComisionBancoIngreso, setFlagPorSolComisionBancoIngreso] = useState(false);
  const [comisionItfIngresoSalida, setComisionItfIngresoSalida] = useState("");
  const [comisionBancoIngreso, setComisionBancoIngreso] = useState("");
  const [comisionMinimoBancoIngreso, setComisionMinimoBancoIngreso] = useState("");
  const [comisionIgvBancoIngreso, setComisionIgvBancoIngreso] = useState("");
  const [comisionTransfBancoSalida, setComisionTransfBancoSalida] = useState("");
  const [comisionTransfInterBancoSalida, setComisionTransfInterBancoSalida] = useState("");
  const [idEstado, setIdEstado] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const comisionBancoPlaceholder = flagPorSolComisionBancoIngreso ? "S/ 0.00" : "% 0.0";

  const estadoItems = useMemo(
    () => (estados || []).map((e) => ({ id: e.id as string | number, label: e.nombre as string })),
    [estados],
  );

  const empresaItems = useMemo(
    () => (empresas || []).map((e) => ({ id: e.id as string | number, label: e.nombre as string })),
    [empresas],
  );

  const bancoItems = useMemo(
    () => (bancos || []).map((b) => ({ id: b.id as string | number, label: b.nombre as string })),
    [bancos],
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
        setIdEmpresa(Number(item.id_empresa ?? 0));
        setIdBanco(Number(item.id_banco ?? 0));
        setFlagPorSolComisionBancoIngreso(!!item.flag_por_sol_comision_banco_ingreso);
        setComisionItfIngresoSalida(item.comision_itf_ingreso_salida != null ? String(item.comision_itf_ingreso_salida) : "");
        setComisionBancoIngreso(item.comision_banco_ingreso != null ? String(item.comision_banco_ingreso) : "");
        setComisionMinimoBancoIngreso(item.comision_minimo_banco_ingreso != null ? String(item.comision_minimo_banco_ingreso) : "");
        setComisionIgvBancoIngreso(item.comision_igv_banco_ingreso != null ? String(item.comision_igv_banco_ingreso) : "");
        setComisionTransfBancoSalida(item.comision_transf_banco_salida != null ? String(item.comision_transf_banco_salida) : "");
        setComisionTransfInterBancoSalida(item.comision_transf_inter_banco_salida != null ? String(item.comision_transf_inter_banco_salida) : "");
        setIdEstado(Number(item.id_estado ?? 0));
      } else {
        setIdEmpresa(defaultIdEmpresa || 0);
        setIdBanco(0);
        setFlagPorSolComisionBancoIngreso(false);
        setComisionItfIngresoSalida("0.005");
        setComisionBancoIngreso("");
        setComisionMinimoBancoIngreso("");
        setComisionIgvBancoIngreso("");
        setComisionTransfBancoSalida("");
        setComisionTransfInterBancoSalida("");
        setIdEstado(getActivoId(estadoItems));
      }
    }
  }, [isOpen, item]);

  const handleSave = async () => {
    if (!idEmpresa) { addToast("error", "La empresa es obligatoria"); return; }
    if (!idBanco) { addToast("error", "El banco es obligatorio"); return; }
    if (!idEstado) { addToast("error", "El estado es obligatorio"); return; }

    setIsSaving(true);
    try {
      const params: Record<string, unknown> = {
        p_id_empresa: idEmpresa as number,
        p_id_banco: idBanco as number,
        p_flag_por_sol_comision_banco_ingreso: flagPorSolComisionBancoIngreso,
        p_comision_itf_ingreso_salida: parseNumber(comisionItfIngresoSalida),
        p_comision_banco_ingreso: parseNumber(comisionBancoIngreso),
        p_comision_minimo_banco_ingreso: parseNumber(comisionMinimoBancoIngreso),
        p_comision_igv_banco_ingreso: parseNumber(comisionIgvBancoIngreso),
        p_comision_transf_banco_salida: parseNumber(comisionTransfBancoSalida),
        p_comision_transf_inter_banco_salida: parseNumber(comisionTransfInterBancoSalida),
        p_id_estado: idEstado as number,
      };

      if (isEditing) {
        await empresaCuentaBancariaService.update(item!.id as number, params);
        addToast("success", "Cuenta bancaria actualizada correctamente");
      } else {
        await empresaCuentaBancariaService.create(params);
        addToast("success", "Cuenta bancaria creada correctamente");
      }
      onSave();
    } catch {
      addToast("error", "Error al guardar la cuenta bancaria");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose}
          />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
            className="relative z-10 w-full max-w-md rounded-xl bg-primary p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-primary">
                {isEditing ? "Editar Cuenta Bancaria" : "Nueva Cuenta Bancaria"}
              </h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
              {!defaultIdEmpresa && (
                <Select label="Empresa" placeholder="Seleccione una empresa" size="sm" isRequired
                  items={empresaItems} selectedKey={idEmpresa}
                  onSelectionChange={(key) => { if (key !== null) setIdEmpresa(Number(key)) }}>
                  {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                </Select>
              )}
              <Select label="Banco" placeholder="Seleccione un banco" size="sm" isRequired
                items={bancoItems} selectedKey={idBanco}
                onSelectionChange={(key) => { if (key !== null) setIdBanco(Number(key)) }}>
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>

              <Select label="Tipo Comisión Banco" placeholder="Seleccione" size="sm"
                items={COMISION_TIPO_OPTIONS} selectedKey={flagPorSolComisionBancoIngreso}
                onSelectionChange={(key) => { if (key !== null) setFlagPorSolComisionBancoIngreso(Boolean(key)); }}>
                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
              </Select>

              <Input label="Comisión ITF Ingreso/Salida" placeholder="% 0.0" size="sm" type="number"
                value={comisionItfIngresoSalida} onChange={setComisionItfIngresoSalida} />
              <Input label="Comisión Banco Ingreso" placeholder={comisionBancoPlaceholder} size="sm" type="number"
                value={comisionBancoIngreso} onChange={setComisionBancoIngreso} />
              <Input label="Comisión Mínima Banco Ingreso" placeholder="S/ 0.00" size="sm" type="number"
                value={comisionMinimoBancoIngreso} onChange={setComisionMinimoBancoIngreso} />
              <Input label="Comisión IGV Banco Ingreso" placeholder="% 0.0" size="sm" type="number"
                value={comisionIgvBancoIngreso} onChange={setComisionIgvBancoIngreso} />
              <Input label="Comisión Transf. Banco Salida" placeholder="S/ 0.00" size="sm" type="number"
                value={comisionTransfBancoSalida} onChange={setComisionTransfBancoSalida} />
              <Input label="Comisión Transf. Interbancaria Salida" placeholder="S/ 0.00" size="sm" type="number"
                value={comisionTransfInterBancoSalida} onChange={setComisionTransfInterBancoSalida} />

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
