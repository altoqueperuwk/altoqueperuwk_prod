import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { NativeSelect } from "@/components/base/select/select-native";
import { isInteractiveElement } from "@/features/operaciones/efectivizacion/shared/utils/row-selection";
import { useVirtualTableRows } from "@/features/operaciones/efectivizacion/shared/hooks/use-virtual-table-rows";
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
    isRefreshing?: boolean;
    hidePagination?: boolean;
    virtualizeRows?: boolean;
    onToggleRow?: (id: number) => void;
    onToggleRows?: (ids: number[], selected: boolean) => void;
    renderActions?: (row: T) => ReactNode;
    selectedIds?: number[];
    serverPagination?: {
        page: number;
        totalPages: number;
        pageSize: number;
        onPageChange: (page: number) => void;
        onPageSizeChange: (pageSize: number) => void;
    };
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

const getVirtualColumnWidth = <T extends { id: number }>(column: Column<T>) => {
    const label = column.label.toLowerCase();
    if (label.includes("pasos")) return 160;
    if (label.includes("atencion")) return 170;
    if (label.includes("empresa cuenta")) return 190;
    if (label.includes("cuenta cliente")) return 125;
    if (label.includes("monto") || label.includes("transferencia")) return 140;
    if (label.includes("hora") || label.includes("fecha")) return 110;
    if (label.includes("dni")) return 125;
    if (label.includes("estado")) return 120;
    if (label.includes("acciones")) return 90;
    return 130;
};

export const OperationTable = <T extends { id: number }>({
    columns,
    data,
    emptyText,
    isLoading = false,
    isRefreshing = false,
    hidePagination = false,
    virtualizeRows = false,
    onToggleRow,
    onToggleRows,
    renderActions,
    selectedIds = [],
    serverPagination,
}: OperationTableProps<T>) => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const hasSelection = Boolean(onToggleRow);
    const activePage = serverPagination?.page ?? page;
    const activePageSize = serverPagination?.pageSize ?? pageSize;
    const totalPages = hidePagination ? 1 : serverPagination?.totalPages ?? Math.max(1, Math.ceil(data.length / activePageSize));
    const paginatedData = useMemo(() => {
        if (serverPagination || hidePagination) return data;
        const start = (activePage - 1) * activePageSize;
        return data.slice(start, start + activePageSize);
    }, [activePage, activePageSize, data, hidePagination, serverPagination]);
    const isVirtualized = virtualizeRows && hidePagination && paginatedData.length > 60;
    const { scrollRef, virtualizer, items, paddingTop, paddingBottom } = useVirtualTableRows(paginatedData, isVirtualized, 64);
    const renderedRows = isVirtualized
        ? items.map((item) => ({ row: paginatedData[item.index], index: item.index }))
        : paginatedData.map((row, index) => ({ row, index }));
    const RowComponent = virtualizeRows ? "tr" : motion.tr;
    const RowsWrapper = isVirtualized ? Fragment : AnimatePresence;
    const virtualTableWidth = columns.reduce((total, column) => total + getVirtualColumnWidth(column), (hasSelection ? 36 : 0) + (renderActions ? 70 : 0));
    const skeletonRows = Array.from({ length: Math.min(activePageSize, 5) });

    useEffect(() => {
        if (!serverPagination && !hidePagination) setPage((current) => Math.min(current, totalPages));
    }, [hidePagination, serverPagination, totalPages]);

    useEffect(() => {
        if (!serverPagination && !hidePagination) setPage(1);
    }, [data, hidePagination, pageSize, serverPagination]);

    const visibleIds = paginatedData.map((row) => row.id);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIdSet.has(id));
    const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, rowId: number) => {
        if (!onToggleRow || isLoading || isInteractiveElement(event.target)) return;
        onToggleRow(rowId);
    };

    const handleToggleVisible = () => {
        if (!onToggleRow || isLoading) return;

        if (onToggleRows) {
            onToggleRows(visibleIds, !allVisibleSelected);
            return;
        }

        if (allVisibleSelected) {
            visibleIds.forEach((id) => onToggleRow(id));
            return;
        }

        visibleIds
            .filter((id) => !selectedIdSet.has(id))
            .forEach((id) => onToggleRow(id));
    };

    return (
        <div className="overflow-hidden border-t border-secondary" data-copy-table="cierre-caja" aria-busy={isLoading || isRefreshing}>
            <div ref={scrollRef} className="overflow-x-auto">
                <table
                    className={cx("w-full divide-y divide-secondary", isVirtualized ? "table-fixed" : "min-w-max table-auto")}
                    style={isVirtualized ? { minWidth: virtualTableWidth } : undefined}
                >
                    {isVirtualized && <colgroup>
                        {hasSelection && <col style={{ width: 36 }} />}
                        {columns.map((column) => <col key={String(column.key)} style={{ width: getVirtualColumnWidth(column) }} />)}
                            {renderActions && <col style={{ width: 70 }} />}
                    </colgroup>}
                    <thead className="sticky top-0 z-10 bg-secondary">
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
                                        className={cx("whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-tertiary", classes.header, column.headerClassName, isVirtualized && column.label === "Acciones" && "sticky right-0 z-20 bg-secondary")}
                                    >
                                        {column.label}
                                    </th>
                                );
                            })}
                            {renderActions ? <th className={cx("w-14 px-2 py-2 text-center text-xs font-semibold text-tertiary", isVirtualized && "sticky right-0 z-20 bg-secondary")}>Acciones</th> : null}
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
                                        <td key={`${String(column.key)}-${columnIndex}`} className={cx("px-2 py-2", column.cellClassName)}>
                                            <div className="h-4 w-full min-w-16 max-w-32 animate-pulse rounded bg-secondary" />
                                        </td>
                                    ))}
                                    {renderActions ? <td className="px-2 py-2"><div className="mx-auto h-4 w-8 animate-pulse rounded bg-secondary" /></td> : null}
                                </tr>
                            ))
                        ) : data.length ? (
                            <RowsWrapper {...(!isVirtualized ? { initial: false } : {})}>
                                {isVirtualized && paddingTop > 0 && (
                                    <tr key="virtual-spacer-top" aria-hidden="true"><td colSpan={columns.length + (hasSelection ? 1 : 0) + (renderActions ? 1 : 0)} className="border-0 p-0" style={{ height: paddingTop }} /></tr>
                                )}
                                {renderedRows.map(({ row, index }) => (
                                    <RowComponent
                                        key={row.id}
                                        data-index={isVirtualized ? index : undefined}
                                        ref={isVirtualized ? virtualizer.measureElement : undefined}
                                        className={cx(
                                            hasSelection && "cursor-pointer transition-colors hover:bg-primary_hover",
                                            selectedIdSet.has(row.id) && "bg-warning-primary/20 hover:bg-warning-primary/30",
                                        )}
                                        {...(!virtualizeRows ? {
                                            layout: true,
                                            initial: { opacity: 0, y: 4 },
                                            animate: { opacity: 1, y: 0 },
                                            exit: { opacity: 0, height: 0 },
                                            transition: { duration: 0.2 },
                                        } : {})}
                                        onClick={(event) => handleRowClick(event, row.id)}
                                    >
                                        {hasSelection && (
                                            <td className="px-2 py-2 align-middle">
                                                <Checkbox
                                                    aria-label={`Seleccionar ${row.id}`}
                                                    data-prevent-row-select
                                                    isSelected={selectedIdSet.has(row.id)}
                                                    onChange={() => onToggleRow?.(row.id)}
                                                />
                                            </td>
                                        )}
                                    {columns.map((column) => {
                                            const classes = getColumnClasses(column);

                                            return (
                                            <td key={String(column.key)} className={cx("whitespace-nowrap px-2 py-2 text-sm text-secondary", classes.cell, column.cellClassName, isVirtualized && column.label === "Acciones" && "sticky right-0 z-10 bg-primary")}>
                                                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                                                </td>
                                            );
                                        })}
                                        {renderActions ? <td className={cx("w-14 px-2 py-2 text-center", isVirtualized && "sticky right-0 z-10 bg-primary")}>{renderActions(row)}</td> : null}
                                    </RowComponent>
                                ))}
                                {isVirtualized && paddingBottom > 0 && (
                                    <tr key="virtual-spacer-bottom" aria-hidden="true"><td colSpan={columns.length + (hasSelection ? 1 : 0) + (renderActions ? 1 : 0)} className="border-0 p-0" style={{ height: paddingBottom }} /></tr>
                                )}
                            </RowsWrapper>
                        ) : (
                            <tr>
                                <td colSpan={columns.length + (hasSelection ? 1 : 0) + (renderActions ? 1 : 0)} className="px-4 py-10 text-center text-sm text-tertiary">
                                    {emptyText}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {!hidePagination && <div className="flex flex-wrap items-center justify-center gap-3 border-t border-secondary px-4 py-3">
                <Button
                    aria-label="Pagina anterior"
                    size="sm"
                    color="secondary"
                    iconLeading={ChevronLeft}
                    isDisabled={isLoading || activePage <= 1}
                    onClick={() => serverPagination ? serverPagination.onPageChange(Math.max(1, activePage - 1)) : setPage((current) => Math.max(1, current - 1))}
                />
                <span className="text-sm text-tertiary">
                    Pagina {activePage} de {totalPages}
                </span>
                <Button
                    aria-label="Pagina siguiente"
                    size="sm"
                    color="secondary"
                    iconLeading={ChevronRight}
                    isDisabled={isLoading || activePage >= totalPages}
                    onClick={() => serverPagination ? serverPagination.onPageChange(Math.min(totalPages, activePage + 1)) : setPage((current) => Math.min(totalPages, current + 1))}
                />
                <NativeSelect
                    aria-label="Filas por pagina"
                    size="sm"
                    className="w-28"
                    selectClassName="h-8 py-1.5 pl-2 pr-7 text-xs"
                    value={String(activePageSize)}
                    onChange={(event) => serverPagination ? serverPagination.onPageSizeChange(Number(event.currentTarget.value)) : setPageSize(Number(event.currentTarget.value))}
                    options={[
                        { label: "20", value: "20" },
                        { label: "50", value: "50" },
                        { label: "100", value: "100" },
                    ]}
                />
            </div>}
        </div>
    );
};
