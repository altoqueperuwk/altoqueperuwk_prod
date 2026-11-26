import type { ReactNode } from "react";

/** Panel compartido con franja de título y línea separadora; conserva la variante en capas solo para compatibilidad. */
export const CompensacionPanel = ({
    title,
    children,
    trailing,
    toolbar = false,
    variant = "standard",
    ariaLabel,
}: {
    title: string;
    children: ReactNode;
    trailing?: ReactNode;
    toolbar?: boolean;
    variant?: "standard" | "layered";
    ariaLabel?: string;
}) =>
    variant === "layered" ? (
        <section className={toolbar ? "-mx-3 -my-2.5 min-w-0 rounded-t-2xl bg-secondary" : "min-w-0 rounded-2xl border border-secondary bg-secondary"}>
            <div className={`flex items-center justify-between gap-3 pt-3 pb-5 ${toolbar ? "px-3" : "px-4"}`}>
                <h2 className="text-xs font-medium text-tertiary">{title}</h2>
                {trailing}
            </div>
            <div
                className={
                    toolbar
                        ? "relative -mt-2 rounded-t-xl border-t border-secondary bg-primary px-3 py-3"
                        : "relative -mx-px -mt-2 -mb-px rounded-xl border border-secondary bg-primary p-4 shadow-xs"
                }
            >
                {children}
            </div>
        </section>
    ) : (
        <section
            aria-label={ariaLabel}
            className={
                toolbar ? "-mx-3 -my-2.5 min-w-0 rounded-t-2xl bg-primary" : "min-w-0 overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs"
            }
        >
            <div className={`flex items-center justify-between gap-3 border-b border-secondary bg-secondary py-3 ${toolbar ? "rounded-t-2xl px-3" : "px-4"}`}>
                <h2 className="text-xs font-medium text-tertiary">{title}</h2>
                {trailing}
            </div>
            <div className={toolbar ? "px-3 py-3" : "p-4"}>{children}</div>
        </section>
    );
