// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { Plus, X, Check } from "@untitledui/icons";
import { empresaCuentaBancariaService } from "@/services/empresa-cuenta-bancaria.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface EmpresaCuentasModalProps {
  isOpen: boolean;
  onClose: () => void;
  empresa: Record<string, unknown> | null;
}

interface CuentaRow {
  key: string;
  id?: number;
  id_banco: number;
  flag_por_sol: boolean;
  comision_itf_ingreso_salida: string;
  comision_banco_ingreso: string;
  comision_minimo_banco_ingreso: string;
  comision_igv_banco_ingreso: string;
  comision_transf_banco_salida: string;
  comision_transf_inter_banco_salida: string;
  id_estado: number;
}

const COMISION_TIPO_OPTIONS = [
  { id: false, label: "Porcentaje" },
  { id: true, label: "Soles" },
];

const EMPTY_ROW: CuentaRow = {
  key: "",
  id_banco: 0,
  flag_por_sol: false,
  comision_itf_ingreso_salida: "0.005",
  comision_banco_ingreso: "",
  comision_minimo_banco_ingreso: "",
  comision_igv_banco_ingreso: "",
  comision_transf_banco_salida: "",
  comision_transf_inter_banco_salida: "",
  id_estado: 0,
};

const getActivoId = (estados: { id: string | number; label: string }[]) => {
  const activo = estados.find((e) => e.label.toLowerCase() === "activo");
  return activo ? Number(activo.id) : 0;
};

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return isNaN(num) ? null : num;
};

let rowKeyCounter = 0;

export const EmpresaCuentasModal = ({ isOpen, onClose, empresa }: EmpresaCuentasModalProps) => {
  const { addToast } = useToast();
  const { estados, bancos } = useSessionCache();
  const empresaId = empresa?.id as number;
  const empresaNombre = empresa?.nombre as string;
  const [rows, setRows] = useState<CuentaRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

  const bancoItems = useMemo(
    () => (bancos || []).map((b) => ({ id: b.id as string | number, label: b.nombre as string })),
    [bancos],
  );

  const activoId = useMemo(() => getActivoId(estadoItems), [estadoItems]);

  useEffect(() => {
    if (!isOpen || !empresaId) return;
    const loadCuentas = async () => {
      try {
        const result = await empresaCuentaBancariaService.getList({ p_id_empresa: empresaId });
        const loadedRows: CuentaRow[] = (result as Record<string, unknown>[]).map((r) => ({
          key: `cuenta-${r.id}`,
          id: r.id as number,
          id_banco: (r.id_banco as number) || 0,
          flag_por_sol: !!r.flag_por_sol_comision_banco_ingreso,
          comision_itf_ingreso_salida: r.comision_itf_ingreso_salida != null ? String(r.comision_itf_ingreso_salida) : "",
          comision_banco_ingreso: r.comision_banco_ingreso != null ? String(r.comision_banco_ingreso) : "",
          comision_minimo_banco_ingreso: r.comision_minimo_banco_ingreso != null ? String(r.comision_minimo_banco_ingreso) : "",
          comision_igv_banco_ingreso: r.comision_igv_banco_ingreso != null ? String(r.comision_igv_banco_ingreso) : "",
          comision_transf_banco_salida: r.comision_transf_banco_salida != null ? String(r.comision_transf_banco_salida) : "",
          comision_transf_inter_banco_salida: r.comision_transf_inter_banco_salida != null ? String(r.comision_transf_inter_banco_salida) : "",
          id_estado: (r.id_estado as number) || 0,
        }));
        setRows(loadedRows);
      } catch {
        addToast("error", "Error al cargar las cuentas bancarias");
      }
    };
    loadCuentas();
  }, [isOpen, empresaId]);

  const handleAddRow = () => {
    const newRow: CuentaRow = { ...EMPTY_ROW, key: `new-${++rowKeyCounter}`, id_estado: activoId || 0 };
    setRows((prev) => [...prev, newRow]);
  };

  const handleUpdateRow = (key: string, field: keyof CuentaRow, value: unknown) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const row of rows) {
        const params: Record<string, unknown> = {
          p_id_empresa: empresaId,
          p_id_banco: row.id_banco,
          p_flag_por_sol_comision_banco_ingreso: row.flag_por_sol,
          p_comision_itf_ingreso_salida: parseNumber(row.comision_itf_ingreso_salida),
          p_comision_banco_ingreso: parseNumber(row.comision_banco_ingreso),
          p_comision_minimo_banco_ingreso: parseNumber(row.comision_minimo_banco_ingreso),
          p_comision_igv_banco_ingreso: parseNumber(row.comision_igv_banco_ingreso),
          p_comision_transf_banco_salida: parseNumber(row.comision_transf_banco_salida),
          p_comision_transf_inter_banco_salida: parseNumber(row.comision_transf_inter_banco_salida),
          p_id_estado: row.id_estado || activoId || 0,
        };

        if (row.id) {
          await empresaCuentaBancariaService.update(row.id, params);
        } else {
          await empresaCuentaBancariaService.create(params);
        }
      }
      addToast("success", "Cuentas bancarias guardadas correctamente");
      onClose();
    } catch {
      addToast("error", "Error al guardar las cuentas bancarias");
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
            className="relative z-10 w-full max-w-6xl max-h-[85vh] flex flex-col rounded-xl bg-primary p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold text-primary">Cuentas Bancarias — {empresaNombre || ""}</h2>
                <p className="text-sm text-tertiary mt-0.5">Gestión de cuentas bancarias de la empresa.</p>
              </div>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex-1 overflow-y-auto mt-4">
              <div className="overflow-x-auto rounded-lg border border-secondary">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-secondary bg-secondary">
                    <tr>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Banco</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Tipo Com.</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Com. ITF</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Com. Banco</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Com. Mínima</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Com. IGV</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Com. Transf.</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Com. Transf. Inter.</th>
                      <th className="px-2 py-2.5 text-xs font-medium text-tertiary uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary">
                    {rows.length === 0 ? (
                      <tr>
                          <td colSpan={9} className="px-4 py-12 text-center">
                          <p className="text-sm text-tertiary">No hay cuentas bancarias asociadas.</p>
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.key}>
                          <td className="px-2 py-2">
                            <Select size="sm" placeholder="Banco"
                              items={bancoItems} selectedKey={row.id_banco}
                              onSelectionChange={(key) => { if (key !== null) handleUpdateRow(row.key, "id_banco", Number(key)); }}>
                              {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <Select size="sm" placeholder="Tipo"
                              items={COMISION_TIPO_OPTIONS} selectedKey={row.flag_por_sol}
                              onSelectionChange={(key) => { if (key !== null) handleUpdateRow(row.key, "flag_por_sol", Boolean(key)); }}>
                              {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                            </Select>
                          </td>
                          <td className="px-2 py-2">
                            <Input size="sm" placeholder="% 0.0" type="number"
                              value={row.comision_itf_ingreso_salida}
                              onChange={(v) => handleUpdateRow(row.key, "comision_itf_ingreso_salida", v)} />
                          </td>
                          <td className="px-2 py-2">
                            <Input size="sm" placeholder={row.flag_por_sol ? "S/ 0.00" : "% 0.0"} type="number"
                              value={row.comision_banco_ingreso}
                              onChange={(v) => handleUpdateRow(row.key, "comision_banco_ingreso", v)} />
                          </td>
                          <td className="px-2 py-2">
                            <Input size="sm" placeholder="S/ 0.00" type="number"
                              value={row.comision_minimo_banco_ingreso}
                              onChange={(v) => handleUpdateRow(row.key, "comision_minimo_banco_ingreso", v)} />
                          </td>
                          <td className="px-2 py-2">
                            <Input size="sm" placeholder="% 0.0" type="number"
                              value={row.comision_igv_banco_ingreso}
                              onChange={(v) => handleUpdateRow(row.key, "comision_igv_banco_ingreso", v)} />
                          </td>
                          <td className="px-2 py-2">
                            <Input size="sm" placeholder="S/ 0.00" type="number"
                              value={row.comision_transf_banco_salida}
                              onChange={(v) => handleUpdateRow(row.key, "comision_transf_banco_salida", v)} />
                          </td>
                          <td className="px-2 py-2">
                            <Input size="sm" placeholder="S/ 0.00" type="number"
                              value={row.comision_transf_inter_banco_salida}
                              onChange={(v) => handleUpdateRow(row.key, "comision_transf_inter_banco_salida", v)} />
                          </td>
                          <td className="px-2 py-2">
                            <Select size="sm" placeholder="Estado"
                              items={estadoItems} selectedKey={row.id_estado}
                              onSelectionChange={(key) => { if (key !== null) handleUpdateRow(row.key, "id_estado", Number(key)); }}>
                              {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                            </Select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <Button size="sm" color="link-color" iconLeading={Plus} onClick={handleAddRow}>
                  Agregar cuenta bancaria
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-secondary">
              <Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button>
              <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave}>Guardar</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
