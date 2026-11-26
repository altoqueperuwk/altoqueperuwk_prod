import { Cell, Pie, PieChart } from "recharts";
import { CompensacionPanel } from "../shared/compensacion-panel";

const colors = [
    "var(--color-text-success-primary)",
    "var(--color-fg-brand-primary)",
    "var(--color-text-warning-primary)",
    "var(--color-text-error-primary)",
    "var(--color-text-tertiary)",
];
export interface RatingSlice {
    key: string;
    name: string;
    value: number;
    unit: string;
}

/** La leyenda también presenta todos los valores cuando el gráfico no es accesible. */
export const CalificacionesChart = ({
    title,
    slices,
    busy,
    error,
    empty,
}: {
    title: string;
    slices: RatingSlice[];
    busy: boolean;
    error: boolean;
    empty: string;
}) => {
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    return (
        <CompensacionPanel title={title}>
            {busy || error || !total ? (
                <p className="flex min-h-36 items-center text-xs text-tertiary">{busy ? "Cargando…" : error ? "Métricas no disponibles." : empty}</p>
            ) : (
                <div className="flex min-h-36 items-center gap-4">
                    <div
                        className="relative shrink-0"
                        role="img"
                        aria-label={`${title}: ${slices
                            .filter((s) => s.value)
                            .map((s) => `${s.name}, ${s.value}`)
                            .join("; ")}`}
                    >
                        <PieChart width={136} height={136} accessibilityLayer={false}>
                            <Pie
                                data={slices.filter((s) => s.value > 0)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={46}
                                outerRadius={64}
                                stroke="var(--color-bg-primary)"
                                strokeWidth={1}
                                isAnimationActive={false}
                            >
                                {slices.map((s, index) => (s.value > 0 ? <Cell key={s.key} fill={colors[index % colors.length]} /> : null))}
                            </Pie>
                        </PieChart>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xs text-tertiary">Total</span>
                            <span className="text-lg font-semibold text-primary tabular-nums">{total}</span>
                        </div>
                    </div>
                    <ul className="max-h-36 w-full max-w-xl min-w-0 space-y-2 overflow-y-auto">
                        {slices.map((s, index) => (
                            <li key={s.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs">
                                <span className="flex min-w-0 items-start gap-2 text-secondary">
                                    <span className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                                    <span className="break-words">{s.name}</span>
                                </span>
                                <span className="shrink-0 font-semibold text-primary tabular-nums">
                                    {s.value} {s.unit}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </CompensacionPanel>
    );
};
