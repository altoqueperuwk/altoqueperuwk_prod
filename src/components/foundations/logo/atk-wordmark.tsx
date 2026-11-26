import { cx } from "@/utils/cx";

/** Logotipo en texto de Al Toque Perú WK. */
export const AtkWordmark = ({ className }: { className?: string }) => (
    <span className={cx("atk-wordmark whitespace-nowrap text-lg leading-6 font-extrabold tracking-tight text-primary uppercase", className)}>
        Altoque Peru <span className="atk-wordmark-accent">WK</span>
    </span>
);
