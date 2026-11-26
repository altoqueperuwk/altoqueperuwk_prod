import { getLocalTimeZone, today } from "@internationalized/date";
import { useControlledState } from "@react-stately/utils";
import { Calendar as CalendarIcon } from "@untitledui/icons";
import { useDateFormatter } from "react-aria";
import type { DatePickerProps as AriaDatePickerProps, DateValue } from "react-aria-components";
import { DatePicker as AriaDatePicker, Dialog as AriaDialog, Group as AriaGroup, Popover as AriaPopover } from "react-aria-components";
import { Button, type ButtonProps } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { Calendar } from "./calendar";

const highlightedDates = [today(getLocalTimeZone())];

interface BasicDatePickerProps extends AriaDatePickerProps<DateValue> {
    size?: ButtonProps["size"];
    buttonClassName?: string;
    showYear?: boolean;
    /** Texto tenue antes de la fecha, para identificar el campo cuando no hay etiqueta encima. */
    prefix?: string;
}

export const BasicDatePicker = ({ value: valueProp, defaultValue, onChange, size = "sm", buttonClassName, showYear = true, prefix, ...props }: BasicDatePickerProps) => {
    const formatter = useDateFormatter({
        month: "short",
        day: "numeric",
        ...(showYear ? { year: "numeric" as const } : {}),
    });
    const [value, setValue] = useControlledState(valueProp, defaultValue || null, onChange);
    const formattedDate = value ? formatter.format(value.toDate(getLocalTimeZone())) : "Select date";

    return (
        <AriaDatePicker aria-label="Date picker" shouldCloseOnSelect {...props} value={value} onChange={setValue}>
            <AriaGroup>
                <Button size={size} color="secondary" iconLeading={CalendarIcon} className={buttonClassName}>
                    {prefix && <span className="font-normal text-tertiary">{prefix}</span>} {formattedDate}
                </Button>
            </AriaGroup>
            <AriaPopover
                offset={8}
                placement="bottom right"
                className={({ isEntering, isExiting }) =>
                    cx(
                        "origin-(--trigger-anchor-point) will-change-transform",
                        isEntering &&
                            "duration-150 ease-out animate-in fade-in placement-right:slide-in-from-left-0.5 placement-top:slide-in-from-bottom-0.5 placement-bottom:slide-in-from-top-0.5",
                        isExiting &&
                            "duration-100 ease-in animate-out fade-out placement-right:slide-out-to-left-0.5 placement-top:slide-out-to-bottom-0.5 placement-bottom:slide-out-to-top-0.5",
                    )
                }
            >
                <AriaDialog aria-label="Date picker" className="rounded-2xl bg-primary p-6 shadow-xl ring ring-secondary_alt">
                    <Calendar highlightedDates={highlightedDates}>
                        <div />
                    </Calendar>
                </AriaDialog>
            </AriaPopover>
        </AriaDatePicker>
    );
};
