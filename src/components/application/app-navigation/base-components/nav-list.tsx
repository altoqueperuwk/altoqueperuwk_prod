import { useEffect, useState } from "react";
import { cx } from "@/utils/cx";
import type { NavItemDividerType, NavItemType } from "../config";
import { NavItemBase } from "./nav-item";

interface NavListProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** Additional CSS classes to apply to the list. */
    className?: string;
    /** List of items to display. */
    items: (NavItemType | NavItemDividerType)[];
    nested?: boolean;
}

const containsActive = (item: NavItemType | NavItemDividerType, url?: string): boolean =>
    Boolean(url && (item.href === url || item.items?.some((child) => containsActive(child, url))));

const NavGroup = ({ item, activeUrl, nested }: { item: NavItemType; activeUrl?: string; nested: boolean }) => {
    const active = containsActive(item, activeUrl);
    const [expanded, setExpanded] = useState(active);
    useEffect(() => {
        if (active) setExpanded(true);
    }, [active, activeUrl]);
    return (
        <li className="py-0.25">
            <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)} className="appearance-none">
                <NavItemBase href={item.href} badge={item.badge} icon={nested ? undefined : item.icon} type="collapsible" current={active}>
                    {item.label}
                </NavItemBase>
                <NavList activeUrl={activeUrl} items={item.items ?? []} nested className="pb-1" />
            </details>
        </li>
    );
};

export const NavList = ({ activeUrl, items, className, nested = false }: NavListProps) => {
    return (
        <ul className={cx("flex flex-col", nested ? "pl-3" : "px-4 pt-5", className)}>
            {items.map((item, index) => {
                if (item.sectionHeading) {
                    return (
                        <li key={`section:${item.label}`} className="mt-4 mb-1 border-t border-secondary px-2 pt-3 first:mt-1 first:border-t-0 first:pt-1">
                            <h3 className="text-sm font-semibold text-secondary">{item.label}</h3>
                        </li>
                    );
                }
                if (item.divider) {
                    return (
                        <li key={index} className="w-full px-0.5 py-2">
                            <hr className="h-px w-full border-none bg-border-secondary" />
                        </li>
                    );
                }

                if (item.items?.length) {
                    return <NavGroup key={item.label} item={item} activeUrl={activeUrl} nested={nested} />;
                }

                return (
                    <li key={item.label} className="py-px">
                        <NavItemBase
                            type={nested ? "collapsible-child" : "link"}
                            badge={item.badge}
                            icon={nested ? undefined : item.icon}
                            href={item.href}
                            current={activeUrl === item.href}
                            accentColor={item.accentColor}
                            truncate={!item.href?.startsWith("/compensaciones/")}
                        >
                            {item.label}
                        </NavItemBase>
                    </li>
                );
            })}
        </ul>
    );
};
