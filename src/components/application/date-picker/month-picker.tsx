import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "@untitledui/icons";
import { Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";

// Selector mensual compuesto con los botones Untitled UI y el mismo overlay
// React Aria de DatePicker; no depende del input month nativo del navegador.
export const MonthPicker = ({ value, onChange, label = "Mes", allowAllMonths = true, hideLabel = false }: { value: string; onChange: (month: string) => void; label?: string; allowAllMonths?: boolean; hideLabel?: boolean }) => {
    const currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Lima" }).format(new Date()));
    const [year, setYear] = useState(Number(value.slice(0, 4)) || currentYear);
    const [open, setOpen] = useState(false);
    const formatted = /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
        ? new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`))
        : "Todos los meses";
    const short = (() => {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return "Todos los meses";
        const parts = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).formatToParts(new Date(`${value}-01T12:00:00Z`));
        return `${parts.find((p) => p.type === "month")?.value} ${parts.find((p) => p.type === "year")?.value}`;
    })();
    return <div className="flex flex-col gap-1.5">
        {!hideLabel && <span className="text-sm font-medium text-secondary">{label}</span>}
        <AriaDialogTrigger isOpen={open} onOpenChange={(next) => { if (next) setYear(Number(value.slice(0, 4)) || currentYear); setOpen(next); }}>
            <Button size="sm" color="secondary" iconLeading={Calendar} aria-label={`${label}: ${formatted}`}>{hideLabel ? <><span className="font-normal text-tertiary">{label}</span> {short}</> : formatted}</Button>
            <AriaPopover placement="bottom end" offset={8} className="z-50">
                <AriaDialog aria-label="Seleccionar mes del año" className="w-80 rounded-2xl bg-primary p-4 shadow-xl ring-1 ring-secondary_alt outline-none">
                    {({ close }) => <>
                        <div className="mb-4 flex items-center justify-between">
                            <Button size="sm" color="tertiary" iconLeading={ChevronLeft} aria-label="Año anterior" isDisabled={year <= 1900} onClick={() => setYear((v) => v - 1)} />
                            <span aria-live="polite" className="font-semibold text-primary">{year}</span>
                            <Button size="sm" color="tertiary" iconLeading={ChevronRight} aria-label="Año siguiente" isDisabled={year >= 2100} onClick={() => setYear((v) => v + 1)} />
                        </div>
                        <div role="group" aria-label={`Meses de ${year}`} className="grid grid-cols-3 gap-2">
                            {Array.from({ length: 12 }, (_, index) => {
                                const key = `${year}-${String(index + 1).padStart(2, "0")}`;
                                const month = new Intl.DateTimeFormat("es-PE", { month: "short", timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`));
                                return <Button key={key} size="sm" color={key === value ? "primary" : "tertiary"} aria-pressed={key === value}
                                    aria-label={new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`))}
                                    onClick={() => { onChange(key); close(); }}>{month}</Button>;
                            })}
                        </div>
                        {allowAllMonths && <div className="mt-4 border-t border-secondary pt-3"><Button size="sm" color="secondary" className="w-full" onClick={() => { onChange(""); close(); }}>Todos los meses</Button></div>}
                    </>}
                </AriaDialog>
            </AriaPopover>
        </AriaDialogTrigger>
    </div>;
};
