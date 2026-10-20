import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualTableBody } from "./virtual-table-body";

const virtual = vi.hoisted(() => ({ indices: [0, 1], measure: vi.fn() }));
vi.mock("../hooks/use-virtual-table-rows", () => ({
    useVirtualTableRows: () => ({
        scrollRef: { current: null }, virtualizer: { measureElement: virtual.measure },
        items: virtual.indices.map((index) => ({ index })), paddingTop: 0, paddingBottom: 0,
    }),
}));
const rows = Array.from({ length: 800 }, (_, index) => ({ id: index + 1, amount: index }));
beforeEach(() => { virtual.indices = [0, 1]; virtual.measure.mockClear(); });

describe("isolated virtual table body", () => {
    it("retains overlapping rows without rerendering them when the range moves", () => {
        const renderRow = vi.fn((row: typeof rows[number], index: number) => <tr data-index={index}><td>{row.id}</td></tr>);
        const props = { rows, enabled: true, columnCount: 1, isLoading: false, loading: null, empty: null, renderRow };
        const { rerender } = render(<table><VirtualTableBody {...props} /></table>);
        expect(renderRow).toHaveBeenCalledTimes(2);
        virtual.indices = [1, 2];
        rerender(<table><VirtualTableBody {...props} /></table>);
        expect(renderRow).toHaveBeenCalledTimes(3);
        expect(screen.getAllByRole("row")).toHaveLength(2);
        expect(renderRow.mock.calls[2][0].id).toBe(3);
    });

    it("does not preserve stale row data or handlers after parent changes", () => {
        const click = vi.fn();
        const renderRow = (row: typeof rows[number]) => <tr><td><button onClick={() => click(row.amount)}>{row.amount}</button></td></tr>;
        const props = { rows, enabled: true, columnCount: 1, isLoading: false, loading: null, empty: null, renderRow };
        const { rerender } = render(<table><VirtualTableBody {...props} /></table>);
        const next = [...rows]; next[0] = { ...next[0], amount: 900 };
        rerender(<table><VirtualTableBody {...props} rows={next} /></table>);
        fireEvent.click(screen.getByRole("button", { name: "900" }));
        expect(click).toHaveBeenCalledWith(900);
        const nextClick = vi.fn();
        rerender(<table><VirtualTableBody {...props} rows={next} renderRow={(row) => <tr><td><button onClick={() => nextClick(row.id)}>Nueva acción {row.id}</button></td></tr>} /></table>);
        fireEvent.click(screen.getByRole("button", { name: "Nueva acción 1" }));
        expect(nextClick).toHaveBeenCalledWith(1);
    });

    it("supports nonvirtual rows, loading and empty states", () => {
        const props = { rows: rows.slice(0, 3), enabled: false, columnCount: 1, isLoading: false,
            loading: <tr><td>Cargando</td></tr>, empty: <tr><td>Sin filas</td></tr>,
            renderRow: (row: typeof rows[number]) => <tr><td>Fila {row.id}</td></tr> };
        const { rerender } = render(<table><VirtualTableBody {...props} /></table>);
        expect(screen.getAllByRole("row")).toHaveLength(3);
        rerender(<table><VirtualTableBody {...props} isLoading /></table>);
        expect(screen.getByText("Cargando")).toBeTruthy();
        rerender(<table><VirtualTableBody {...props} rows={[]} /></table>);
        expect(screen.getByText("Sin filas")).toBeTruthy();
    });
});
