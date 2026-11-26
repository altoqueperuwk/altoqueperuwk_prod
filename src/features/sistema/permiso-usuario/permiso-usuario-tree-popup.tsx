import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { isAdministrator, isJefeTienda, useAuth } from "@/providers/auth-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { permisoMenuService } from "@/services/permiso-menu.service";
import { permisoUsuarioService } from "@/services/permiso-usuario.service";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { compensacionesMenuLabel } from "@/features/compensaciones/shared/compensaciones-navigation";
import { advisorRouteAllowed } from "@/features/compensaciones/shared/compensacion-perfil";

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
                nombre: compensacionesMenuLabel(String(row.nombre ?? "-"), String(row.ruta ?? "")),
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

const collectLeafIds = (node: MenuNode): number[] => (node.children.length === 0 ? [node.id] : node.children.flatMap(collectLeafIds));

const JEFE_TIENDA_ALLOWED_ROUTES = new Set(["/operaciones/pagodeuda", "/operaciones/linkpago", "/operaciones/pos", "/atencion/cliente"]);

const filterJefeTiendaMenuRows = (rows: Record<string, unknown>[]) => {
    const rowsById = new Map(rows.map((row) => [Number(row.id), row]));
    const visibleIds = new Set<number>();

    rows.forEach((row) => {
        if (!JEFE_TIENDA_ALLOWED_ROUTES.has(String(row.ruta ?? ""))) return;
        let current: Record<string, unknown> | undefined = row;
        while (current) {
            const id = Number(current.id);
            if (visibleIds.has(id)) break;
            visibleIds.add(id);
            const parentId: number | null = current.id_padre == null ? null : Number(current.id_padre);
            current = parentId == null ? undefined : rowsById.get(parentId);
        }
    });

    return rows.filter((row) => visibleIds.has(Number(row.id)));
};

export const filterAdvisorMenuRows = (rows: Record<string, unknown>[]) => {
    const byId = new Map(rows.map(row => [Number(row.id), row]));
    const parentIds = new Set(rows.map(row => Number(row.id_padre)));
    const visible = new Set<number>();
    for (const row of rows) {
        if (parentIds.has(Number(row.id)) || !row.ruta || !advisorRouteAllowed(String(row.ruta))) continue;
        let current: Record<string, unknown> | undefined = row;
        while (current && !visible.has(Number(current.id))) {
            visible.add(Number(current.id));
            current = current.id_padre == null ? undefined : byId.get(Number(current.id_padre));
        }
    }
    return rows.filter(row => visible.has(Number(row.id)));
};

export const PermisoUsuarioTreePopup = ({ isOpen, user, onClose, onSaved }: PermisoUsuarioTreePopupProps) => {
    const { estados } = useSessionCache();
    const { businessUser } = useAuth();
    const isBranchManager = isJefeTienda(businessUser) && !isAdministrator(businessUser);
    const targetIsAdvisor = Number(user?.id_rol) === 4 && user?.flag_super_admin !== true;
    const { addToast } = useToast();
    const [tree, setTree] = useState<MenuNode[]>([]);
    const [selectedLeaves, setSelectedLeaves] = useState<Set<number>>(new Set());
    const [preservedLeafIds, setPreservedLeafIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    const activeId = useMemo(() => {
        const active = getCoreEstadoItems(estados).find((item) => item.label.toLowerCase() === "activo");
        return active ? Number(active.id) : 1;
    }, [estados]);

    const loadPermissions = useCallback(async () => {
        if (!user?.id) return;
        setIsLoading(true);
        setLoadFailed(false);
        try {
            const [menuRows, permissionRows] = await Promise.all([
                permisoMenuService.getList({ p_id_estado: activeId }),
                permisoUsuarioService.getList({ p_id_usuario: Number(user.id), p_id_estado: activeId }),
            ]);
            const fullTree = buildTree(menuRows);
            const allowedRows = targetIsAdvisor ? filterAdvisorMenuRows(menuRows) : menuRows;
            const nextTree = buildTree(isBranchManager ? filterJefeTiendaMenuRows(allowedRows) : allowedRows);
            const availableLeafIds = new Set(nextTree.flatMap(collectLeafIds));
            const allActiveLeafIds = new Set(fullTree.flatMap(collectLeafIds));
            const currentPermissionIds = permissionRows.map((row) => Number(row.id_permiso_menu));
            const current = new Set(currentPermissionIds.filter((id) => availableLeafIds.has(id)));
            const preserved = isBranchManager ? currentPermissionIds.filter((id) => allActiveLeafIds.has(id) && !availableLeafIds.has(id)) : [];
            setTree(nextTree);
            setSelectedLeaves(current);
            setPreservedLeafIds(preserved);
        } catch {
            setLoadFailed(true);
            setTree([]);
            addToast("error", "No se pudieron cargar los permisos del usuario");
        } finally {
            setIsLoading(false);
        }
    }, [activeId, addToast, isBranchManager, targetIsAdvisor, user]);

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
        if (!user?.id || isLoading || loadFailed) return;
        setIsSaving(true);
        try {
            const idsToSave = Array.from(new Set([...preservedLeafIds, ...selectedLeaves]));
            await permisoUsuarioService.assignLote(Number(user.id), idsToSave, businessUser?.id ? Number(businessUser.id) : undefined);
            addToast("success", "Permisos guardados correctamente");
            onSaved();
        } catch (error) {
            addToast("error", error instanceof Error ? error.message : "No se pudieron guardar los permisos");
        } finally {
            setIsSaving(false);
        }
    };

    const renderNode = (node: MenuNode, depth = 0): ReactNode => {
        const state = getNodeState(node);
        return (
            <div key={node.id}>
                <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${depth * 24}px` }}>
                    <Checkbox aria-label={node.nombre} isSelected={state.selected} isIndeterminate={state.indeterminate} onChange={() => toggleNode(node)} />
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
                                <p className="mt-1 text-sm text-secondary">
                                    {String(user.nombre ?? "-")} ({String(user.email ?? "-")})
                                </p>
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
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} isDisabled={isLoading || loadFailed} onClick={handleSave}>
                                Guardar Permisos
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
