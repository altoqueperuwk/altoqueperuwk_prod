import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";

interface Column<T> {
    key: keyof T | string;
    label: string;
    render?: (row: T) => ReactNode;
    headerClassName?: string;
    cellClassName?: string;
}

interface OperationTableProps<T extends { id: number }> {
    columns: Column<T>[];
    data: T[];
    emptyText: string;
    isLoading?: boolean;
    onToggleRow?: (id: number) => void;
    selectedIds?: number[];
}

const getColumnClasses = <T extends { id: number }>(column: Column<T>) => {
    const key = String(column.key).toLowerCase();
    const label = column.label.toLowerCase();
    const token = `${key} ${label}`;

    if (key.includes("monto") || key.includes("comision") || key.includes("resultado_comision")) {
        return { header: "", cell: "tabular-nums" };
    }

    if (token.includes("cuenta empresa") || token.includes("cuenta cliente")) return { header: "w-32", cell: "max-w-32 truncate" };
    if (token.includes("hora")) return { header: "w-24", cell: "" };
    if (token.includes("acciones")) return { header: "w-14 text-center", cell: "text-center" };
    if (token.includes("codigo") || token.includes("cod.") || token.includes("dni")) return { header: "", cell: "font-medium text-primary" };
    if (token.includes("cliente") || token.includes("motivo")) return { header: "", cell: "max-w-56 truncate" };
    if (
        token.includes("empresa") ||
        token.includes("banco") ||
        token.includes("solicita") ||
        token.includes("gestor") ||
        token.includes("deriva") ||
        token.includes("retiene") ||
        token.includes("origen") ||
        token.includes("destino") ||
        token.includes("movimiento")
    ) return { header: "", cell: "max-w-40 truncate" };

    return { header: "", cell: "" };
};

export const OperationTable = <T extends { id: number }>({
    columns,
    data,
    emptyText,
    isLoading = false,
    onToggleRow,
    selectedIds = [],
}: OperationTableProps<T>) => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const hasSelection = Boolean(onToggleRow);
    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    const paginatedData = useMemo(() => {
        const start = (page - 1) * pageSize;
        return data.slice(start, start + pageSize);
    }, [data, page, pageSize]);
    const skeletonRows = Array.from({ length: Math.min(pageSize, 5) });

    useEffect(() => {
        setPage((current) => Math.min(current, totalPages));
    }, [totalPages]);

    useEffect(() => {
        setPage(1);
    }, [data, pageSize]);

    const visibleIds = paginatedData.map((row) => row.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    const handleToggleVisible = () => {
        if (!onToggleRow || isLoading) return;

        if (allVisibleSelected) {
            visibleIds.forEach((id) => onToggleRow(id));
            return;
        }

        visibleIds
            .filter((id) => !selectedIds.includes(id))
            .forEach((id) => onToggleRow(id));
    };

    return (
        <div className="overflow-hidden border-t border-secondary" aria-busy={isLoading}>
            <div className="overflow-x-auto">
                <table className="w-full min-w-max table-auto divide-y divide-secondary">
                    <thead className="bg-secondary">
                        <tr>
                            {hasSelection && (
                                <th className="w-9 px-2 py-2">
                                    <Checkbox
                                        aria-label="Seleccionar pagina"
                                        isSelected={allVisibleSelected}
                                        isDisabled={isLoading}
                                        onChange={handleToggleVisible}
                                    />
                                </th>
                            )}
                            {columns.map((column) => {
                                const classes = getColumnClasses(column);

                                return (
                                    <th
                                        key={String(column.key)}
                                        className={cx("whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-tertiary", classes.header, column.headerClassName)}
                                    >
                                        {column.label}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary bg-primary">
                        {isLoading ? (
                            skeletonRows.map((_, rowIndex) => (
                                <tr key={`loading-${rowIndex}`}>
                                    {hasSelection && (
                                        <td className="px-2 py-2">
                                            <div className="size-4 animate-pulse rounded border border-secondary bg-secondary" />
                                        </td>
                                    )}
                                    {columns.map((column, columnIndex) => (
                                        <td key={`${String(column.key)}-${columnIndex}`} className="px-2 py-2">
                                            <div className="h-4 w-full min-w-16 max-w-32 animate-pulse rounded bg-secondary" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : data.length ? (
                            <AnimatePresence initial={false}>
                                {paginatedData.map((row) => (
                                    <motion.tr
                                        key={row.id}
                                        layout
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {hasSelection && (
                                            <td className="px-2 py-2 align-middle">
                                                <Checkbox
                                                    aria-label={`Seleccionar ${row.id}`}
                                                    isSelected={selectedIds.includes(row.id)}
                                                    onChange={() => onToggleRow?.(row.id)}
                                                />
                                            </td>
                                        )}
                                        {columns.map((column) => {
                                            const classes = getColumnClasses(column);

                                            return (
                                                <td key={String(column.key)} className={cx("whitespace-nowrap px-2 py-2 text-sm text-secondary", classes.cell, column.cellClassName)}>
                                                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                                                </td>
                                            );
                                        })}
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        ) : (
                            <tr>
                                <td colSpan={columns.length + (hasSelection ? 1 : 0)} className="px-4 py-10 text-center text-sm text-tertiary">
                                    {emptyText}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-secondary px-4 py-3">
                <Button
                    aria-label="Pagina anterior"
                    size="sm"
                    color="secondary"
                    iconLeading={ChevronLeft}
                    isDisabled={isLoading || page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                />
                <span className="text-sm text-tertiary">
                    Pagina {page} de {totalPages}
                </span>
                <Button
                    aria-label="Pagina siguiente"
                    size="sm"
                    color="secondary"
                    iconLeading={ChevronRight}
                    isDisabled={isLoading || page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                />
                <NativeSelect
                    aria-label="Filas por pagina"
                    size="sm"
                    className="w-28"
                    selectClassName="h-8 py-1.5 pl-2 pr-7 text-xs"
                    value={String(pageSize)}
                    onChange={(event) => setPageSize(Number(event.currentTarget.value))}
                    options={[
                        { label: "20", value: "20" },
                        { label: "50", value: "50" },
                        { label: "100", value: "100" },
                    ]}
                />
            </div>
        </div>
    );
};
