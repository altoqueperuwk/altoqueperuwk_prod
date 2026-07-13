import { motion } from "motion/react";
import { cx } from "@/utils/cx";

interface RouteKpiCardProps {
    isLoading?: boolean;
    label: string;
    valueClassName?: string;
    value: string;
}

export const RouteKpiCard = ({ isLoading = false, label, value, valueClassName = "text-primary" }: RouteKpiCardProps) => {
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
                <p className={cx("mt-2 truncate text-xl font-semibold", valueClassName)}>{value}</p>
            )}
        </motion.div>
    );
};
