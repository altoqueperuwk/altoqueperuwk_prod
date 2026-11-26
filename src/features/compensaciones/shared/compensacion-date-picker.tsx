import { useId } from "react";
import { parseDate } from "@internationalized/date";
import { I18nProvider as AriaI18nProvider } from "react-aria-components";
import { BasicDatePicker } from "@/components/application/date-picker/basic-date-picker";

/** Calendario Untitled UI con etiqueta visible y formato regional compartido. */
export const CompensacionDatePicker = ({
    label,
    value,
    onChange,
    isRequired = false,
    isDisabled = false,
    className = "",
    hideLabel = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    isRequired?: boolean;
    isDisabled?: boolean;
    className?: string;
    /** Sin etiqueta encima: el nombre del campo va como prefijo dentro del botón. */
    hideLabel?: boolean;
}) => {
    const labelId = useId();
    return (
        <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
            {!hideLabel && (
                <span id={labelId} className="text-sm font-medium text-secondary">
                    {label}
                    {isRequired && <span className="text-brand-tertiary"> *</span>}
                </span>
            )}
            <AriaI18nProvider locale="es-PE">
                <BasicDatePicker
                    aria-label={hideLabel ? label : undefined}
                    aria-labelledby={hideLabel ? undefined : labelId}
                    prefix={hideLabel ? label : undefined}
                    value={value ? parseDate(value) : null}
                    onChange={(date) => {
                        if (date) onChange(date.toString());
                    }}
                    isRequired={isRequired}
                    isDisabled={isDisabled}
                    size="sm"
                    buttonClassName="w-full justify-start"
                />
            </AriaI18nProvider>
        </div>
    );
};
