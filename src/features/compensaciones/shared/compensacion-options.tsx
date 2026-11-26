import { Button } from "@/components/base/buttons/button";

export interface CompensacionOption {
    id: string;
    label: string;
    description: string;
}

/** Each familiar legacy task remains a separate entry without new routes or RPCs. */
export const CompensacionOptions = ({
    label,
    options,
    selected,
    onChange,
}: {
    label: string;
    options: CompensacionOption[];
    selected: string;
    onChange: (id: string) => void;
}) => (
    <nav aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((option) => (
            <div
                key={option.id}
                className={`min-w-0 rounded-xl border p-3 ${selected === option.id ? "border-brand bg-brand-primary_alt" : "border-secondary bg-primary"}`}
            >
                <Button
                    size="sm"
                    color={selected === option.id ? "primary" : "secondary"}
                    aria-pressed={selected === option.id}
                    onClick={() => onChange(option.id)}
                >
                    {option.label}
                </Button>
                <p className="mt-2 text-xs text-secondary">{option.description}</p>
            </div>
        ))}
    </nav>
);
