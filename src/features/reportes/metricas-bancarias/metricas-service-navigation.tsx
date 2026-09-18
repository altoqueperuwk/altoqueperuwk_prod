import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export type MetricasVista = "efectivizacion" | "pago-deuda" | "pos" | "linkpago";

const items: Array<{ key: MetricasVista; label: string; href: string }> = [
    { key: "efectivizacion", label: "Efectivización", href: "/reportes/metricas-bancarias" },
    { key: "pago-deuda", label: "Pago Deuda", href: "/reportes/metricas-bancarias/pago-deuda" },
    { key: "pos", label: "POS", href: "/reportes/metricas-bancarias/pos" },
    { key: "linkpago", label: "Link Pago", href: "/reportes/metricas-bancarias/link-pago" },
];

export const MetricasServiceNavigation = ({ active, className }: { active: MetricasVista; className?: string }) => (
    <nav aria-label="Servicios de métricas" className={cx("flex gap-2 overflow-x-auto pb-1", className)}>
        {items.map((item) => (
            <Button key={item.key} href={item.href} color={item.key === active ? "primary" : "secondary"} size="md">
                {item.label}
            </Button>
        ))}
    </nav>
);
