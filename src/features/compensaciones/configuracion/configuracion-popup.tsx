import { useEffect, useState } from "react";
import { Check, X } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useToast } from "@/providers/toast-provider";

export type ConfigValue = string | number | boolean | null;
export interface ConfigField {
    key: string;
    label: string;
    type?: "text" | "number" | "date" | "month" | "time" | "textarea" | "select";
    required?: boolean;
    placeholder?: string;
    items?: { id: string | number; label: string }[];
    disabled?: boolean;
}
interface Props {
    isOpen: boolean;
    title: string;
    description: string;
    fields: ConfigField[];
    initialValues: Record<string, ConfigValue>;
    onClose: () => void;
    onSave: (values: Record<string, ConfigValue>) => Promise<void>;
}

export const ConfiguracionPopup = ({ isOpen, title, description, fields, initialValues, onClose, onSave }: Props) => {
    const { addToast } = useToast();
    const [values, setValues] = useState(initialValues);
    const [isSaving, setIsSaving] = useState(false);
    useEffect(() => {
        if (isOpen) setValues(initialValues);
    }, [initialValues, isOpen]);
    const save = async () => {
        const missing = fields.find(
            (field) =>
                field.required &&
                (values[field.key] === "" ||
                    values[field.key] === null ||
                    values[field.key] === undefined ||
                    (field.type === "select" && values[field.key] === 0)),
        );
        if (missing) return addToast("error", `${missing.label} es obligatorio`);
        setIsSaving(true);
        try {
            await onSave(values);
        } finally {
            setIsSaving(false);
        }
    };
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl"
                    >
                        <div className="flex items-start justify-between border-b border-secondary px-6 py-5">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">{title}</h2>
                                <p className="mt-1 text-sm text-tertiary">{description}</p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} />
                        </div>
                        <div className="grid flex-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2">
                            {fields.map((field) =>
                                field.type === "textarea" ? (
                                    <div key={field.key} className="sm:col-span-2">
                                        <TextArea
                                            label={field.label}
                                            size="sm"
                                            rows={4}
                                            isRequired={field.required}
                                            value={String(values[field.key] ?? "")}
                                            onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                                        />
                                    </div>
                                ) : field.type === "select" ? (
                                    <Select
                                        key={field.key}
                                        label={field.label}
                                        size="sm"
                                        isRequired={field.required}
                                        isDisabled={field.disabled}
                                        items={field.items ?? []}
                                        selectedKey={(values[field.key] as string | number | null) ?? ""}
                                        onSelectionChange={(key) => setValues((current) => ({ ...current, [field.key]: key === null ? "" : key }))}
                                    >
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>
                                ) : (
                                    <Input
                                        key={field.key}
                                        label={field.label}
                                        size="sm"
                                        type={field.type ?? "text"}
                                        isRequired={field.required}
                                        isDisabled={field.disabled}
                                        placeholder={field.placeholder}
                                        value={String(values[field.key] ?? "")}
                                        onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                                    />
                                ),
                            )}
                        </div>
                        <div className="flex justify-end gap-3 border-t border-secondary px-6 py-4">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void save()}>
                                Guardar
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
