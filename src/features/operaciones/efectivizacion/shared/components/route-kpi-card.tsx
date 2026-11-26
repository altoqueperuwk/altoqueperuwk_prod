import { useState } from "react";
import { Eye, EyeOff, TrendDown01, TrendUp01, Wallet02 } from "@untitledui/icons";
import { motion } from "motion/react";
import { Button as AriaButton } from "react-aria-components";
import { cx } from "@/utils/cx";

interface RouteKpiCardProps {
    badges?: readonly string[];
    isLoading?: boolean;
    label: string;
    secondaryLabel?: string;
    secondaryValue?: string;
    secondaryValueHidden?: boolean;
    valueClassName?: string;
    value: string;
}

export const RouteKpiCard = ({
    badges = [],
    isLoading = false,
    label,
    secondaryLabel,
    secondaryValue,
    secondaryValueHidden = false,
    value,
    valueClassName = "text-primary",
}: RouteKpiCardProps) => {
    const [isSecondaryValueVisible, setIsSecondaryValueVisible] = useState(false);
    const Icono = /error|salida|gasto/.test(valueClassName) ? TrendDown01 : valueClassName.includes("success") || valueClassName.includes("concept") ? TrendUp01 : Wallet02;
    const maskedSecondaryValue = secondaryValue?.trim().startsWith("-") ? "-S/ ••••••" : "S/ ••••••";

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="atk-card atk-kpi flex min-h-24 flex-col rounded-lg border border-secondary bg-primary"
        >
            <div className="atk-strip">
                <p className="atk-strip-title">{label}</p>
                <Icono aria-hidden="true" className={cx("size-4 shrink-0", valueClassName)} />
            </div>
            <div className="flex flex-1 flex-col px-4 pt-1 pb-4">
            {isLoading ? (
                <div className="mt-3 h-7 w-24 animate-pulse rounded bg-secondary" />
            ) : (
                <>
                    <p className={cx("mt-2 truncate text-xl font-semibold", valueClassName)}>{value}</p>
                    {secondaryValue ? (
                        <div className="mt-1 flex min-w-0 items-baseline gap-1 text-xs text-tertiary">
                            {secondaryLabel ? <span className="truncate">{secondaryLabel}:</span> : null}
                            {secondaryValueHidden ? (
                                <div className="flex min-w-0 items-center gap-1">
                                    <span className="truncate font-semibold text-secondary">
                                        {isSecondaryValueVisible ? secondaryValue : maskedSecondaryValue}
                                    </span>
                                    <AriaButton
                                        aria-label={`${isSecondaryValueVisible ? "Ocultar" : "Mostrar"} ${secondaryLabel ?? "monto"}`}
                                        className="shrink-0 rounded-sm text-fg-quaternary outline-hidden transition duration-200 hover:text-fg-secondary focus-visible:ring-2 focus-visible:ring-focus-ring"
                                        onPress={() => setIsSecondaryValueVisible((isVisible) => !isVisible)}
                                    >
                                        {isSecondaryValueVisible ? (
                                            <EyeOff className="size-4 stroke-[2px]" />
                                        ) : (
                                            <Eye className="size-4 stroke-[2px]" />
                                        )}
                                    </AriaButton>
                                </div>
                            ) : (
                                <span className="truncate font-semibold text-secondary">{secondaryValue}</span>
                            )}
                        </div>
                    ) : null}
                    {badges.length > 0 && (
                        <div className={cx("mt-auto flex flex-wrap gap-1.5", secondaryValue ? "pt-2" : "pt-3")}>
                            {badges.map((badge) => (
                                <span
                                    key={badge}
                                    className="atk-pill rounded-md border px-2 py-0.5 text-[10px] font-medium leading-[15px]"
                                >
                                    {badge}
                                </span>
                            ))}
                        </div>
                    )}
                </>
            )}
            </div>
        </motion.div>
    );
};
