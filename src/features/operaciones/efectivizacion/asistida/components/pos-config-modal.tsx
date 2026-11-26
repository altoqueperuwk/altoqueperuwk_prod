// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClockRewind, Edit03, Plus, X } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Modal, ModalOverlay, Dialog } from "@/components/application/modals/modal";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { posService } from "@/services/pos.service";
import { PosHistoryDrawer } from "./pos-history-drawer";

interface PosConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const PosConfigModal = ({ isOpen, onClose, onSaved }: PosConfigModalProps) => {
  const { estados } = useSessionCache();
  const { businessUser } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [nombre, setNombre] = useState("");
  const [idEstado, setIdEstado] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [historyId, setHistoryId] = useState<number | null>(null);

  const estadoItems = useMemo(
    () => (estados ?? []).filter((item) => Number(item.id) === 1 || Number(item.id) === 2).map((item) => ({ id: item.id, label: item.nombre })),
    [estados],
  );

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await posService.getList(filter.trim() ? { p_nombre: filter.trim() } : {}));
    } catch {
      addToast("error", "Error al cargar el catálogo POS.");
    } finally {
      setIsLoading(false);
    }
  }, [addToast, filter]);

  useEffect(() => {
    if (isOpen) void loadItems();
  }, [isOpen, loadItems]);

  useEffect(() => {
    if (!isOpen) {
      setEditing(null);
      setNombre("");
      setFilter("");
    }
  }, [isOpen]);

  const handleNew = () => {
    setEditing(null);
    setNombre("");
    setIdEstado(Number(estadoItems.find((item) => String(item.label).toUpperCase() === "ACTIVO")?.id ?? 1));
  };

  const handleEdit = (item: Record<string, unknown>) => {
    setEditing(item);
    setNombre(String(item.nombre ?? ""));
    setIdEstado(Number(item.id_estado ?? 1));
  };

  const handleSave = async () => {
    if (!nombre.trim()) {
      addToast("error", "El nombre del POS es obligatorio.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        p_nombre: nombre.trim(),
        p_id_estado: idEstado,
        p_id_usuario: businessUser?.id ? Number(businessUser.id) : null,
      };
      const saved = editing ? await posService.update(Number(editing.id), payload) : await posService.create(payload);
      if (saved && "error" in saved && saved.error) throw new Error(String(saved.error));
      addToast("success", editing ? "POS actualizado correctamente." : "POS creado correctamente.");
      handleNew();
      await loadItems();
      onSaved?.();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "No se pudo guardar el POS.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStateChange = async (item: Record<string, unknown>, key: string | number | null) => {
    if (key === null) return;
    try {
      const saved = await posService.update(Number(item.id), {
        p_id_estado: Number(key),
        p_id_usuario: businessUser?.id ? Number(businessUser.id) : null,
      });
      if (saved && "error" in saved && saved.error) throw new Error(String(saved.error));
      await loadItems();
      onSaved?.();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "No se pudo actualizar el estado del POS.");
    }
  };

  return (
    <>
      <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
        <Modal className="max-w-2xl">
          <Dialog>
            <div className="flex max-h-[85vh] flex-col gap-5 rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
              <div className="atk-modal-head flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-primary">Configuración POS</h2>
                  <p className="mt-1 text-sm text-tertiary">Administra los POS disponibles para las solicitudes.</p>
                </div>
                <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Input size="sm" label="Buscar" placeholder="Nombre del POS" value={filter} onChange={setFilter} className="min-w-0 flex-1" />
                <Button size="sm" color="secondary" iconLeading={Plus} onClick={handleNew}>Nuevo POS</Button>
              </div>

              <div className="overflow-auto rounded-lg border border-secondary">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-secondary bg-secondary text-xs text-secondary">
                    <tr><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Acciones</th></tr>
                  </thead>
                  <tbody className="divide-y divide-secondary">
                    {isLoading ? <tr><td colSpan={3} className="px-3 py-5 text-center text-tertiary">Cargando...</td></tr> : items.length === 0 ? <tr><td colSpan={3} className="px-3 py-5 text-center text-tertiary">No hay POS registrados.</td></tr> : items.map((item) => (
                      <tr key={String(item.id)}>
                        <td className="px-3 py-2 font-medium text-primary">{String(item.nombre ?? "-")}</td>
                        <td className="px-3 py-2 text-secondary">
                          <Select
                            aria-label={`Estado de ${String(item.nombre ?? "POS")}`}
                            size="sm"
                            items={estadoItems}
                            selectedKey={Number(item.id_estado ?? 0)}
                            onSelectionChange={(key) => void handleStateChange(item, key)}
                          >
                            {(state) => <Select.Item id={state.id}>{state.label}</Select.Item>}
                          </Select>
                        </td>
                        <td className="px-3 py-2"><div className="flex justify-end gap-1"><Button size="xs" color="tertiary" iconLeading={Edit03} onClick={() => handleEdit(item)} /><Button size="xs" color="tertiary" iconLeading={ClockRewind} onClick={() => setHistoryId(Number(item.id))} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 border-t border-secondary pt-4 sm:grid-cols-2">
                <Input size="sm" label={editing ? "Editar POS" : "Nuevo POS"} isRequired value={nombre} onChange={setNombre} placeholder="Nombre del POS" />
                <Select size="sm" label="Estado" isRequired items={estadoItems} selectedKey={idEstado} onSelectionChange={(key) => key !== null && setIdEstado(Number(key))}>
                  {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
              </div>
              <div className="flex justify-end gap-2"><Button size="sm" color="secondary" onClick={onClose}>Cerrar</Button><Button size="sm" color="primary" isLoading={isSaving} onClick={handleSave}>Guardar</Button></div>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
      <PosHistoryDrawer isOpen={historyId !== null} itemId={historyId} onClose={() => setHistoryId(null)} />
    </>
  );
};
