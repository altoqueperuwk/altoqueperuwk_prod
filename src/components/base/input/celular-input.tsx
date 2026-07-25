import { useState } from "react";
import { Plus, Trash01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

interface CelularInputProps {
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    isDisabled?: boolean;
}

export const CelularInput = ({ value, onChange, placeholder = "Agregar número celular", isDisabled = false }: CelularInputProps) => {
    const [nuevo, setNuevo] = useState("");

    const handleChange = (input: string) => {
        setNuevo(input.replace(/\D/g, "").slice(0, 9));
    };

    const handleAdd = () => {
        if (!nuevo) return;
        if (value.includes(nuevo)) return;
        onChange([...value, nuevo]);
        setNuevo("");
    };

    const handleRemove = (idx: number) => {
        onChange(value.filter((_, i) => i !== idx));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
                <Input
                    size="sm"
                    placeholder={placeholder}
                    value={nuevo}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    isDisabled={isDisabled}
                />
                <Button size="sm" color="secondary" iconLeading={Plus} onClick={handleAdd} isDisabled={isDisabled || !nuevo} />
            </div>
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((cel, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-sm text-secondary">
                            {cel}
                            <button
                                type="button"
                                onClick={() => handleRemove(idx)}
                                className="ml-0.5 cursor-pointer text-tertiary hover:text-error-primary"
                            >
                                <Trash01 className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
