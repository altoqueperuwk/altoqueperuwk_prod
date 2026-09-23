import { useLayoutEffect, useRef, useState } from "react";
import { observeElementOffset, useVirtualizer } from "@tanstack/react-virtual";

export const useVirtualTableRows = <T extends { id: number }>(
    rows: T[],
    enabled: boolean,
    estimatedRowHeight: number,
) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const offsetObserverRef = useRef<((offset: number, isScrolling: boolean) => void) | null>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const virtualizer = useVirtualizer({
        enabled,
        count: enabled ? rows.length : 0,
        getScrollElement: () => enabled ? scrollRef.current?.closest("main") as HTMLElement | null : null,
        observeElementOffset: (instance, onChange) => {
            offsetObserverRef.current = onChange;
            const element = instance.scrollElement;
            if (element instanceof HTMLElement) onChange(element.scrollTop, false);
            const unsubscribe = observeElementOffset(instance, onChange);
            return () => {
                offsetObserverRef.current = null;
                unsubscribe?.();
            };
        },
        getItemKey: (index) => rows[index]?.id ?? index,
        estimateSize: () => estimatedRowHeight,
        scrollMargin,
        overscan: 6,
    });

    useLayoutEffect(() => {
        if (!enabled || !scrollRef.current) return;
        const scrollElement = scrollRef.current.closest("main");
        if (!scrollElement) return;

        const tableBody = scrollRef.current.querySelector("tbody");
        if (!tableBody) return;
        const margin = tableBody.getBoundingClientRect().top
            - scrollElement.getBoundingClientRect().top
            + scrollElement.scrollTop
            - scrollElement.clientTop;
        setScrollMargin((current) => Math.abs(current - margin) > 1 ? margin : current);
        offsetObserverRef.current?.(scrollElement.scrollTop, false);
    });

    const items = virtualizer.getVirtualItems();
    const paddingTop = items.length ? Math.max(0, items[0].start - scrollMargin) : 0;
    const paddingBottom = items.length
        ? Math.max(0, virtualizer.getTotalSize() - (items[items.length - 1].end - scrollMargin))
        : 0;

    return { scrollRef, virtualizer, items, paddingTop, paddingBottom };
};
