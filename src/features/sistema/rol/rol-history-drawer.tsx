// @ts-nocheck
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { X } from "@untitledui/icons";
import { useToast } from "@/providers/toast-provider";
import { rolService } from "@/services/rol.service";

interface RolHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: number | null;
}

export const RolHistoryDrawer = ({ isOpen, onClose, itemId }: RolHistoryDrawerProps) => {
  const { addToast } = useToast();
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!itemId) return;
    setIsLoading(true);
    try {
      const result = await rolService.getHistory(itemId);
      setHistory(result);
    } catch {
      addToast("error", "Error al cargar el historial");
    } finally {
      setIsLoading(false);
    }
  }, [itemId, addToast]);

  useEffect(() => {
    if (isOpen && itemId) {
      loadHistory();
    }
  }, [isOpen, itemId, loadHistory]);

  useEffect(() => {
    if (!isOpen) {
      setHistory([]);
    }
  }, [isOpen]);

  const formatDate = (value: unknown) => {
    if (!value) return "-";
    const date = new Date(value as string);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getChangedFields = (entry: Record<string, unknown>) => {
    const excludeFields = ["id", "fecha_registro", "id_usuario"];
    const changed: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(entry)) {
      if (!excludeFields.includes(key) && value != null) {
        changed.push({ key, value: String(value) });
      }
    }
    return changed;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-overlay/70"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="relative z-10 flex h-full w-full max-w-md flex-col bg-primary shadow-xl"
          >
            <div className="atk-modal-head-drawer flex items-center justify-between border-b border-secondary px-6 py-5">
              <h2 className="text-lg font-semibold text-primary">Historial de Rol</h2>
              <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <p className="text-sm text-tertiary">Cargando historial...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-tertiary">No hay registros de historial.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {history.map((entry, index) => (
                    <div
                      key={entry.id as number ?? index}
                      className="rounded-lg border border-secondary p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-tertiary">
                          {formatDate(entry.fecha_registro)}
                        </span>
                        <span className="text-xs text-tertiary">
                          ID Usuario: {(entry.id_usuario as string) ?? "-"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {getChangedFields(entry).map(({ key, value }) => (
                          <div key={key} className="flex items-baseline gap-2">
                            <span className="text-xs font-medium text-secondary capitalize">
                              {key.replace(/_/g, " ")}:
                            </span>
                            <span className="text-sm text-primary">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
