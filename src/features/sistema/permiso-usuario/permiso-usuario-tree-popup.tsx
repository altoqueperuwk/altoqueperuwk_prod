import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { permisoMenuService } from "@/services/permiso-menu.service";
import { permisoUsuarioService } from "@/services/permiso-usuario.service";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface MenuNode {
  id: number;
  id_padre: number | null;
  nombre: string;
  orden: number;
  children: MenuNode[];
}

interface PermisoUsuarioTreePopupProps {
  isOpen: boolean;
  user: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: () => void;
}

const buildTree = (rows: Record<string, unknown>[]) => {
  const nodes = new Map<number, MenuNode>();
  rows.forEach((row) => {
    const id = Number(row.id);
    if (Number.isFinite(id)) {
      nodes.set(id, {
        id,
        id_padre: row.id_padre == null ? null : Number(row.id_padre),
        nombre: String(row.nombre ?? "-"),
        orden: Number(row.orden ?? 0),
        children: [],
      });
    }
  });

  const roots: MenuNode[] = [];
  nodes.forEach((node) => {
    const parent = node.id_padre == null ? null : nodes.get(node.id_padre);
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const sortNodes = (items: MenuNode[]) => {
    items.sort((a, b) => a.orden - b.orden || a.id - b.id);
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
};

const collectLeafIds = (node: MenuNode): number[] =>
  node.children.length === 0 ? [node.id] : node.children.flatMap(collectLeafIds);

export const PermisoUsuarioTreePopup = ({ isOpen, user, onClose, onSaved }: PermisoUsuarioTreePopupProps) => {
  const { estados } = useSessionCache();
  const { businessUser } = useAuth();
  const { addToast } = useToast();
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [selectedLeaves, setSelectedLeaves] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const activeId = useMemo(() => {
    const active = getCoreEstadoItems(estados).find((item) => item.label.toLowerCase() === "activo");
    return active ? Number(active.id) : 1;
  }, [estados]);

  const loadPermissions = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const [menuRows, permissionRows] = await Promise.all([
        permisoMenuService.getList({ p_id_estado: activeId }),
        permisoUsuarioService.getList({ p_id_usuario: Number(user.id) }),
      ]);
      const nextTree = buildTree(menuRows);
      const availableLeafIds = new Set(nextTree.flatMap(collectLeafIds));
      const current = new Set(
        permissionRows
          .map((row) => Number(row.id_permiso_menu))
          .filter((id) => availableLeafIds.has(id)),
      );
      setTree(nextTree);
      setSelectedLeaves(current);
    } catch {
      addToast("error", "No se pudieron cargar los permisos del usuario");
    } finally {
      setIsLoading(false);
    }
  }, [activeId, addToast, user]);

  useEffect(() => {
    if (isOpen) void loadPermissions();
  }, [isOpen, loadPermissions]);

  const getNodeState = (node: MenuNode) => {
    const leaves = collectLeafIds(node);
    const selectedCount = leaves.filter((id) => selectedLeaves.has(id)).length;
    return {
      selected: selectedCount === leaves.length,
      indeterminate: selectedCount > 0 && selectedCount < leaves.length,
      leaves,
    };
  };

  const toggleNode = (node: MenuNode) => {
    const state = getNodeState(node);
    setSelectedLeaves((previous) => {
      const next = new Set(previous);
      state.leaves.forEach((id) => {
        if (state.selected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      await permisoUsuarioService.assignLote(
        Number(user.id),
        Array.from(selectedLeaves),
        businessUser?.id ? Number(businessUser.id) : undefined,
      );
      addToast("success", "Permisos guardados correctamente");
      onSaved();
    } catch {
      addToast("error", "No se pudieron guardar los permisos");
    } finally {
      setIsSaving(false);
    }
  };

  const renderNode = (node: MenuNode, depth = 0): ReactNode => {
    const state = getNodeState(node);
    return (
      <div key={node.id}>
        <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${depth * 24}px` }}>
          <Checkbox
            aria-label={node.nombre}
            isSelected={state.selected}
            isIndeterminate={state.indeterminate}
            onChange={() => toggleNode(node)}
          />
          <span className="text-sm text-primary">{node.nombre}</span>
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-primary shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-secondary px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-primary">Permisos de Menú</h2>
                <p className="mt-1 text-sm text-secondary">{String(user.nombre ?? "-")} ({String(user.email ?? "-")})</p>
              </div>
              <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {isLoading ? (
                <p className="py-8 text-center text-sm text-tertiary">Cargando permisos...</p>
              ) : tree.length > 0 ? (
                tree.map((node) => renderNode(node))
              ) : (
                <p className="py-8 text-center text-sm text-tertiary">No hay menús activos para asignar.</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-secondary px-6 py-4">
              <Button size="sm" color="secondary" onClick={onClose}>Cancelar</Button>
              <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave}>
                Guardar Permisos
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
