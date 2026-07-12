import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { ChevronLeft, ChevronRight, Save01 } from "@untitledui/icons";

export interface ColumnDef {
    key: string;
    header: string;
    width?: string;
    render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
}

interface InlineEstadoConfig {
    idEstadoKey: string;
    onSave: (rowId: number, newIdEstado: number) => Promise<void>;
}

interface DataTableProps {
    columns: ColumnDef[];
    data: Record<string, unknown>[];
    isLoading: boolean;
    page: number;
    totalPages: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    emptyMessage?: string;
    emptyDescription?: string;
    renderActions?: (row: Record<string, unknown>, isDirty: boolean, onSaveClick: (row: Record<string, unknown>) => void) => ReactNode;
    renderEmptyState?: () => ReactNode;
    inlineEstado?: InlineEstadoConfig;
}

const rowVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
};

const PAGE_SIZE_OPTIONS = [
    { id: 20, label: "20 por página" },
    { id: 50, label: "50 por página" },
    { id: 100, label: "100 por página" },
];

export const DataTable = ({
    columns,
    data,
    isLoading,
    page,
    totalPages,
    pageSize,
    onPageChange,
    onPageSizeChange,
    emptyMessage = "No se encontraron registros",
    emptyDescription = "No hay datos disponibles en este momento.",
    renderActions,
    renderEmptyState,
    inlineEstado,
}: DataTableProps) => {
    const hasData = data.length > 0;
    const pageSizeItems = useMemo(() => PAGE_SIZE_OPTIONS, []);
    const { estados } = useSessionCache();
    const { addToast } = useToast();

    const [dirtyRows, setDirtyRows] = useState<Record<string | number, number>>({});
    const [savingRows, setSavingRows] = useState<Record<string | number, boolean>>({});

    const estadoItems = useMemo(
        () => (estados || []).map((e) => ({ id: e.id as string | number, label: e.nombre as string })),
        [estados],
    );

    const handleEstadoChange = useCallback((rowId: string | number, newIdEstado: number) => {
        setDirtyRows((prev) => {
            if (newIdEstado === (prev as Record<string | number, number>)[rowId]) return prev;
            return { ...prev, [rowId]: newIdEstado };
        });
    }, []);

    const handleSaveEstado = useCallback(
        async (row: Record<string, unknown>) => {
            if (!inlineEstado) return;
            const rowId = row.id as number;
            const newIdEstado = dirtyRows[rowId];
            if (newIdEstado === undefined) return;

            setSavingRows((prev) => ({ ...prev, [rowId]: true }));
            try {
                await inlineEstado.onSave(rowId, newIdEstado);
                addToast("success", "Estado actualizado correctamente");
                setDirtyRows((prev) => {
                    const next = { ...prev };
                    delete next[rowId];
                    return next;
                });
            } catch {
                addToast("error", "Error al actualizar el estado");
            } finally {
                setSavingRows((prev) => {
                    const next = { ...prev };
                    delete next[rowId];
                    return next;
                });
            }
        },
        [dirtyRows, inlineEstado, addToast],
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="flex flex-col overflow-hidden rounded-lg border border-secondary"
        >
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-secondary bg-secondary">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className="px-4 py-3 text-xs font-medium text-tertiary uppercase tracking-wider whitespace-nowrap"
                                    style={col.width ? { width: col.width } : undefined}
                                >
                                    {col.header}
                                </th>
                            ))}
                            {inlineEstado && (
                                <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase tracking-wider whitespace-nowrap whitespace-nowrap">
                                    Estado
                                </th>
                            )}
                            {(renderActions || inlineEstado) && (
                                <th className="px-4 py-3 text-xs font-medium text-tertiary uppercase tracking-wider whitespace-nowrap w-px">
                                    Acciones
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary">
                        <AnimatePresence mode="wait">
                            {isLoading ? (
                                <motion.tr key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <td colSpan={columns.length + (inlineEstado ? 1 : 0) + ((renderActions || inlineEstado) ? 1 : 0)} className="px-4 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <svg className="size-6 animate-spin text-fg-quaternary" viewBox="0 0 20 20" fill="none">
                                                <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                                                <circle className="origin-center animate-spin stroke-current" cx="10" cy="10" r="8" fill="none" strokeWidth="2" strokeDasharray="12.5 50" strokeLinecap="round" />
                                            </svg>
                                            <p className="text-sm text-tertiary">Cargando...</p>
                                        </div>
                                    </td>
                                </motion.tr>
                            ) : !hasData ? (
                                <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                                    <td colSpan={columns.length + (inlineEstado ? 1 : 0) + ((renderActions || inlineEstado) ? 1 : 0)} className="px-4 py-16 text-center">
                                        {renderEmptyState ? renderEmptyState() : (
                                            <div className="flex flex-col items-center gap-2">
                                                <svg className="size-10 text-fg-quaternary" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <path d="M17 15V5a2 2 0 00-2-2H9L5 7v10a2 2 0 002 2h8a2 2 0 002-2z" />
                                                    <path d="M7 7h.01M11 11h.01M7 11h.01M11 7h.01" />
                                                </svg>
                                                <p className="text-sm font-medium text-tertiary">{emptyMessage}</p>
                                                <p className="text-xs text-quaternary">{emptyDescription}</p>
                                            </div>
                                        )}
                                    </td>
                                </motion.tr>
                            ) : (
                                data.map((row, i) => {
                                    const rowId = row.id as number;
                                    const isDirty = dirtyRows[rowId] !== undefined;
                                    const isSaving = savingRows[rowId];

                                    return (
                                        <motion.tr
                                            key={rowId}
                                            variants={rowVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit="exit"
                                            transition={{ delay: i * 0.03, duration: 0.2 }}
                                            className="transition duration-100 ease-linear hover:bg-primary_hover"
                                        >
                                            {columns.map((col) => (
                                                <td key={col.key} className="px-4 py-3 text-primary whitespace-nowrap">
                                                    {col.render
                                                        ? col.render(row[col.key], row)
                                                        : (row[col.key] as ReactNode) ?? "-"}
                                                </td>
                                            ))}
                                            {inlineEstado && (
                                                <td className="px-4 py-3">
                                                    <div className="w-36">
                                                        <Select
                                                            size="sm"
                                                            placeholder="Estado"
                                                            items={estadoItems}
                                                            selectedKey={dirtyRows[rowId] !== undefined ? dirtyRows[rowId] : (row[inlineEstado.idEstadoKey] as number)}
                                                            onSelectionChange={(key) => {
                                                                if (key !== null) {
                                                                    handleEstadoChange(rowId, Number(key));
                                                                }
                                                            }}
                                                        >
                                                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                        </Select>
                                                    </div>
                                                </td>
                                            )}
                                            {(renderActions || inlineEstado) && (
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        {inlineEstado && (
                                                            <Button
                                                                size="xs"
                                                                color="tertiary"
                                                                iconLeading={Save01}
                                                                isDisabled={!isDirty}
                                                                isLoading={isSaving}
                                                                onClick={() => handleSaveEstado(row)}
                                                            />
                                                        )}
                                                        {renderActions && renderActions(row, isDirty, () => handleSaveEstado(row))}
                                                    </div>
                                                </td>
                                            )}
                                        </motion.tr>
                                    );
                                })
                            )}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.15 }}
                className="flex items-center justify-between gap-4 border-t border-secondary px-4 py-2.5"
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm text-tertiary">
                        Página {page} de {Math.max(1, totalPages)}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <Select
                        size="sm"
                        placeholder="20 por página"
                        items={pageSizeItems}
                        selectedKey={pageSize}
                        onSelectionChange={(key) => {
                            if (key !== null) onPageSizeChange(Number(key));
                        }}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <div className="flex items-center gap-1">
                        <Button size="sm" color="secondary" iconLeading={ChevronLeft} isDisabled={page <= 1} onClick={() => onPageChange(page - 1)} />
                        <Button size="sm" color="secondary" iconLeading={ChevronRight} isDisabled={page >= totalPages} onClick={() => onPageChange(page + 1)} />
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
