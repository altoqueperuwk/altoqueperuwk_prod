// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { X } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useToast } from "@/providers/toast-provider";
import { posService } from "@/services/pos.service";

interface PosHistoryDrawerProps {
  isOpen: boolean;
  itemId: number | null;
  onClose: () => void;
}

const formatDate = (value: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("es-PE");
};

export const PosHistoryDrawer = ({ isOpen, itemId, onClose }: PosHistoryDrawerProps) => {
  const { addToast } = useToast();
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!itemId) return;
    setIsLoading(true);
    try {
      setHistory(await posService.getHistory(itemId));
    } catch {
      addToast("error", "Error al cargar el historial del POS.");
    } finally {
      setIsLoading(false);
    }
  }, [addToast, itemId]);

  useEffect(() => {
    if (isOpen && itemId) void loadHistory();
    if (!isOpen) setHistory([]);
  }, [isOpen, itemId, loadHistory]);

  return isOpen ? (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-overlay/70"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.2 }}
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-primary shadow-xl"
      >
        <div className="atk-modal-head-drawer flex items-center justify-between border-b border-secondary px-6 py-5">
          <h2 className="text-lg font-semibold text-primary">Historial de POS</h2>
          <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? <p className="text-sm text-tertiary">Cargando historial...</p> : history.length === 0 ? (
            <p className="text-sm text-tertiary">No hay registros de historial.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {history.map((entry, index) => (
                <div key={`${String(entry.id ?? "entry")}-${index}`} className="rounded-lg border border-secondary p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-tertiary">{formatDate(entry.fecha_registro)}</span>
                    <span className="text-xs text-tertiary">Usuario: {String(entry.id_usuario ?? "-")}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-primary">{String(entry.nombre ?? "-")}</span>
                    <span className="text-xs text-secondary">Estado: {String(entry.estado_nombre ?? entry.id_estado ?? "-")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.aside>
    </div>
  ) : null;
};
