import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { observeElementOffset, useVirtualizer } from "@tanstack/react-virtual";

export const getVirtualRowOverscan = (viewportHeight: number, rowHeight: number) =>
    viewportHeight > 0 && rowHeight > 0
        ? Math.max(12, Math.min(32, Math.ceil(viewportHeight / rowHeight) * 2))
        : 24;

const observeTableOffset: typeof observeElementOffset = (instance, onChange) => {
    if (instance.scrollElement) onChange(instance.scrollElement.scrollTop, false);
    return observeElementOffset(instance, onChange);
};

export const useVirtualTableRows = <T extends { id: number }, E extends HTMLElement = HTMLDivElement>(
    rows: T[],
    enabled: boolean,
    estimatedRowHeight: number,
) => {
    const scrollRef = useRef<E>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const [overscan, setOverscan] = useState(24);
    const getScrollElement = useCallback(
        () => enabled ? scrollRef.current?.closest("main") as HTMLElement | null : null,
        [enabled],
    );
    const getItemKey = useCallback((index: number) => rows[index]?.id ?? index, [rows]);
    const estimateSize = useCallback(() => estimatedRowHeight, [estimatedRowHeight]);
    const virtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
        enabled,
        count: enabled ? rows.length : 0,
        getScrollElement,
        observeElementOffset: observeTableOffset,
        getItemKey,
        estimateSize,
        scrollMargin,
        overscan,
    });

    useLayoutEffect(() => {
        if (!enabled || !scrollRef.current) return;
        const scrollElement = scrollRef.current.closest("main");
        if (!scrollElement) return;

        const tableBody = scrollRef.current.tagName === "TBODY"
            ? scrollRef.current : scrollRef.current.querySelector("tbody");
        if (!tableBody) return;
        const measure = () => {
            const margin = tableBody.getBoundingClientRect().top
                - scrollElement.getBoundingClientRect().top
                + scrollElement.scrollTop - scrollElement.clientTop;
            setScrollMargin((current) => Math.abs(current - margin) > 1 ? margin : current);
            setOverscan(getVirtualRowOverscan(scrollElement.clientHeight, estimatedRowHeight));
        };
        measure();
        // Observe layout changes, not every scroll render. Ancestors cover
        // forms/headers above the table changing height without a window resize.
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        let element: HTMLElement | null = tableBody;
        while (element) {
            observer?.observe(element);
            if (element === scrollElement) break;
            element = element.parentElement;
        }
        window.addEventListener("resize", measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [enabled, estimatedRowHeight, rows]);

    const items = virtualizer.getVirtualItems();
    const paddingTop = items.length ? Math.max(0, items[0].start - scrollMargin) : 0;
    const paddingBottom = items.length
        ? Math.max(0, virtualizer.getTotalSize() - (items[items.length - 1].end - scrollMargin))
        : 0;

    return { scrollRef, virtualizer, items, paddingTop, paddingBottom };
};
