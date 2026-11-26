import { Checkbox } from "@/components/base/checkbox/checkbox";

export interface CazaErroresCheckboxOption {
    id: string;
    label: string;
}

export const CazaErroresCheckboxGroup = ({
    label,
    options,
    selected,
    onToggle,
    disabled = false,
    fullWidth = false,
}: {
    label: string;
    options: readonly CazaErroresCheckboxOption[];
    selected: readonly string[];
    onToggle: (id: string, checked: boolean) => void;
    disabled?: boolean;
    fullWidth?: boolean;
}) => (
    <div
        role="group"
        aria-label={label}
        aria-required="true"
        className={`grid min-w-0 grid-flow-col grid-rows-2 items-start gap-x-5 gap-y-1 ${fullWidth ? "w-full" : "w-auto"}`}
    >
        {options.map((option) => (
            <Checkbox
                key={option.id}
                label={option.label}
                isSelected={selected.includes(option.id)}
                isDisabled={disabled}
                onChange={(checked) => onToggle(option.id, checked)}
            />
        ))}
    </div>
);
