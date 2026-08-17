import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cx } from "@/utils/cx";

interface InlineFormCardProps {
    className?: string;
    title: string;
    actions?: ReactNode;
    children: ReactNode;
}

export const InlineFormCard = ({ className, title, actions, children }: InlineFormCardProps) => {
    return (
        <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cx("rounded-lg border border-secondary bg-primary p-4 shadow-xs", className)}
        >
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{title}</h2>
                {actions && <div className="shrink-0">{actions}</div>}
            </div>
            {children}
        </motion.section>
    );
};
