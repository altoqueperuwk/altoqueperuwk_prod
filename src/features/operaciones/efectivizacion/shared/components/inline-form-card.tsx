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
            className={cx("atk-card rounded-lg border border-secondary bg-primary", className)}
        >
            <div className="atk-strip">
                <h2 className="atk-strip-title">{title}</h2>
                {actions && <div className="shrink-0">{actions}</div>}
            </div>
            <div className="p-4">{children}</div>
        </motion.section>
    );
};
