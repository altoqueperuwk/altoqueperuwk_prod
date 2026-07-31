import { motion } from "motion/react";
import { cx } from "@/utils/cx";

interface RouteKpiCardProps {
    badges?: string[];
    isLoading?: boolean;
    label: string;
    valueClassName?: string;
    value: string;
}

export const RouteKpiCard = ({ badges = [], isLoading = false, label, value, valueClassName = "text-primary" }: RouteKpiCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="min-h-24 rounded-lg border border-secondary bg-primary p-4 shadow-xs"
        >
            <p className="text-xs font-medium text-tertiary">{label}</p>
            {isLoading ? (
                <div className="mt-3 h-7 w-24 animate-pulse rounded bg-secondary" />
            ) : (
                <>
                    <p className={cx("mt-2 truncate text-xl font-semibold", valueClassName)}>{value}</p>
                    {badges.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {badges.map((badge) => (
                                <span
                                    key={badge}
                                    className="rounded-md border border-secondary bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-4 text-secondary"
                                >
                                    {badge}
                                </span>
                            ))}
                        </div>
                    )}
                </>
            )}
        </motion.div>
    );
};
