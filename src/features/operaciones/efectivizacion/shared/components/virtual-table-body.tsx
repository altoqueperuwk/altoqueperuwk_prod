import { Fragment, memo, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { useVirtualTableRows } from "../hooks/use-virtual-table-rows";

type MeasureRow = (element: HTMLTableRowElement | null) => void;
interface RenderedRowProps<T> {
    row: T;
    index: number;
    measureRow?: MeasureRow;
    renderRow: (row: T, index: number, measureRow?: MeasureRow) => ReactNode;
}

function RenderedRow<T>({ row, index, measureRow, renderRow }: RenderedRowProps<T>) {
    return renderRow(row, index, measureRow);
}
const MemoRow = memo(RenderedRow) as typeof RenderedRow;

interface VirtualTableBodyProps<T extends { id: number }> {
    rows: T[];
    enabled: boolean;
    columnCount: number;
    isLoading: boolean;
    loading: ReactNode;
    empty: ReactNode;
    renderRow: RenderedRowProps<T>["renderRow"];
}

/** Scroll updates stay here, not in the table's forms, rules and modals. */
export function VirtualTableBody<T extends { id: number }>({
    rows, enabled, columnCount, isLoading, loading, empty, renderRow,
}: VirtualTableBodyProps<T>) {
    const { scrollRef, virtualizer, items, paddingTop, paddingBottom } =
        useVirtualTableRows<T, HTMLTableSectionElement>(rows, enabled && !isLoading, 64);
    const Wrapper = enabled ? Fragment : AnimatePresence;
    const rendered = enabled ? items.map((item) => ({ row: rows[item.index], index: item.index }))
        : rows.map((row, index) => ({ row, index }));
    return (
        <tbody ref={scrollRef} className="divide-y divide-secondary bg-primary">
            {isLoading ? loading : rows.length ? (
                <Wrapper {...(!enabled ? { initial: false } : {})}>
                    {enabled && paddingTop > 0 && (
                        <tr key="virtual-spacer-top" aria-hidden="true"><td colSpan={columnCount} className="border-0 p-0" style={{ height: paddingTop }} /></tr>
                    )}
                    {rendered.map(({ row, index }) => (
                        <MemoRow key={row.id} row={row} index={index} renderRow={renderRow}
                            measureRow={enabled ? virtualizer.measureElement : undefined} />
                    ))}
                    {enabled && paddingBottom > 0 && (
                        <tr key="virtual-spacer-bottom" aria-hidden="true"><td colSpan={columnCount} className="border-0 p-0" style={{ height: paddingBottom }} /></tr>
                    )}
                </Wrapper>
            ) : empty}
        </tbody>
    );
}
