import { createElement } from "react";
import { fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getVirtualRowOverscan, useVirtualTableRows } from "./use-virtual-table-rows";

const capture = vi.hoisted(() => ({ options: {} as Record<string, unknown> }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
vi.mock("@tanstack/react-virtual", () => ({
    observeElementOffset: vi.fn(),
    useVirtualizer: (options: Record<string, unknown>) => {
        capture.options = options;
        return { getVirtualItems: () => [], getTotalSize: () => 0 };
    },
}));

describe("virtual table configuration", () => {
    it("prepares about two screens, bounded to 12–32 rows", () => {
        expect(getVirtualRowOverscan(805, 64)).toBe(26);
        expect(getVirtualRowOverscan(200, 64)).toBe(12);
        expect(getVirtualRowOverscan(4000, 64)).toBe(32);
        expect(getVirtualRowOverscan(0, 64)).toBe(24);
    });
    it("keeps measurement/key callbacks stable unless their inputs change", () => {
        const rows = [{ id: 1 }, { id: 2 }];
        const { rerender } = renderHook(({ data }) => useVirtualTableRows(data, true, 64), { initialProps: { data: rows } });
        const previous = { ...capture.options };
        rerender({ data: rows });
        for (const key of ["getItemKey", "getScrollElement", "observeElementOffset", "estimateSize"]) {
            expect(capture.options[key]).toBe(previous[key]);
        }
        rerender({ data: [rows[1], rows[0]] });
        expect((capture.options.getItemKey as (index: number) => number)(0)).toBe(2);
    });
    it("does not remeasure layout on every render and cleans up resize observers", () => {
        const disconnect = vi.fn();
        vi.stubGlobal("ResizeObserver", class { observe() {} disconnect = disconnect; });
        const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
        const rows = [{ id: 1 }];
        function Harness() {
            const { scrollRef } = useVirtualTableRows<typeof rows[number], HTMLTableSectionElement>(rows, true, 64);
            return createElement("main", null, createElement("table", null, createElement("tbody", { ref: scrollRef })));
        }
        const { rerender, unmount } = render(createElement(Harness));
        const initialMeasurements = measure.mock.calls.length;
        expect(initialMeasurements).toBeGreaterThan(0);
        rerender(createElement(Harness));
        expect(measure).toHaveBeenCalledTimes(initialMeasurements);
        fireEvent(window, new Event("resize"));
        expect(measure.mock.calls.length).toBeGreaterThan(initialMeasurements);
        unmount();
        expect(disconnect).toHaveBeenCalled();
    });
});
