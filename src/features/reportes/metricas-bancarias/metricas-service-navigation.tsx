import { useNavigate } from "react-router";
import { cx } from "@/utils/cx";

export type MetricasVista = "efectivizacion" | "pago-deuda" | "pos" | "linkpago";

const items: Array<{ key: MetricasVista; label: string; href: string }> = [
    { key: "efectivizacion", label: "Efectivización", href: "/reportes/metricas-bancarias" },
    { key: "pago-deuda", label: "Pago Deuda", href: "/reportes/metricas-bancarias/pago-deuda" },
    { key: "pos", label: "POS", href: "/reportes/metricas-bancarias/pos" },
    { key: "linkpago", label: "Link Pago", href: "/reportes/metricas-bancarias/link-pago" },
];

export const MetricasServiceNavigation = ({ active, className }: { active: MetricasVista; className?: string }) => {
    const navigate = useNavigate();

    return (
        <nav aria-label="Servicios de métricas" role="tablist" className={cx("flex min-h-11 w-fit max-w-full flex-wrap gap-1 rounded-lg border border-secondary bg-primary p-1", className)}>
            {items.map((item) => {
                const isSelected = item.key === active;
                return (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => navigate(item.href)}
                        className={cx(
                            "h-9 shrink-0 rounded-md px-3 text-sm font-semibold transition duration-200",
                            isSelected
                                ? "bg-brand-solid text-primary_on-brand shadow-xs"
                                : "text-secondary hover:bg-primary_hover hover:text-primary",
                        )}
                    >
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
};
