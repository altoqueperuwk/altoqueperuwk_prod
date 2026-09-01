import type { DateValue } from "@internationalized/date";
import { BasicDatePicker } from "./basic-date-picker";

interface DateRangeFieldsProps {
    from: DateValue;
    to: DateValue;
    onFromChange: (value: DateValue) => void;
    onToChange: (value: DateValue) => void;
}

export const DateRangeFields = ({ from, to, onFromChange, onToChange }: DateRangeFieldsProps) => (
    <div className="flex flex-wrap items-center gap-2">
        <BasicDatePicker aria-label="Fecha desde" value={from} onChange={(value) => value && onFromChange(value)} />
        <BasicDatePicker aria-label="Fecha hasta" value={to} onChange={(value) => value && onToChange(value)} />
    </div>
);
