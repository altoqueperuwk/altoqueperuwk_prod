import type { ChangeEvent, ReactNode, SelectHTMLAttributes } from "react";
import { Badge } from "@/components/base/badges/badges";
import { NativeSelect } from "@/components/base/select/select-native";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { cx } from "@/utils/cx";

interface CompactCellTextProps {
    primary: ReactNode;
    secondary?: ReactNode;
    align?: "left" | "right";
    className?: string;
    title?: string;
}

export const CompactCellText = ({ align = "left", className, primary, secondary, title }: CompactCellTextProps) => (
    <div className={cx("min-w-0", align === "right" && "text-right", className)} title={title}>
        <div className="truncate text-sm font-medium text-primary">{primary}</div>
        {secondary ? <div className="mt-0.5 truncate text-xs text-tertiary">{secondary}</div> : null}
    </div>
);

interface CompactInlineSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
    options: { label: string; value: string; disabled?: boolean }[];
    width?: string;
}

export const CompactInlineSelect = ({ className, options, width, ...props }: CompactInlineSelectProps) => (
    <NativeSelect
        {...props}
        size="sm"
        className={cx(width, className)}
        selectClassName="h-8 truncate py-1.5 pl-2 pr-7 text-xs font-medium"
        options={options}
    />
);

interface CompactMoneyCellProps {
    value: number | null | undefined;
    secondary?: ReactNode;
    className?: string;
}

export const CompactMoneyCell = ({ className, secondary, value }: CompactMoneyCellProps) => (
    <div className={cx("text-right tabular-nums", className)}>
        <div className={cx("flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end", !secondary && "block")}>
            <span className="whitespace-nowrap text-sm font-semibold text-primary">{formatMoney(value)}</span>
            {secondary ? <span className="flex flex-wrap justify-end gap-1">{secondary}</span> : null}
        </div>
    </div>
);

interface CompactBadgeLineProps {
    children: ReactNode;
    color?: "gray" | "brand" | "error" | "warning" | "success" | "slate" | "sky" | "blue" | "indigo" | "purple" | "pink" | "orange";
    className?: string;
}

export const CompactBadgeLine = ({ children, className, color = "gray" }: CompactBadgeLineProps) => (
    <Badge size="sm" color={color} className={cx("max-w-full truncate text-xs", className)}>
        {children}
    </Badge>
);

export const getSelectValue = (event: ChangeEvent<HTMLSelectElement>) => event.currentTarget.value;
