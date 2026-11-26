import { useLayoutEffect, useRef, useState } from "react";
import { Expand01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { CompensacionDialogFooter } from "./compensacion-dialog-chrome";
import { CompensacionDialogHeader } from "./compensacion-dialog-chrome";
import { CompensacionSurface } from "./compensacion-surface";
import { compensationTableActionClass } from "./compensacion-table-styles";

/** A single value shared by the compact field and its expanded editor. */
export const CompensacionNoteField = ({
    value,
    onChange,
    isDisabled = false,
    label = "Notas",
    maxLength = 2000,
    placeholder = "Escribe una nota",
    isRequired = false,
}: {
    value: string;
    onChange: (value: string) => void;
    isDisabled?: boolean;
    label?: string;
    maxLength?: number;
    placeholder?: string;
    isRequired?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const editor = useRef<HTMLTextAreaElement>(null);
    const edited = useRef(false);
    const expanded = useRef(false);
    const composing = useRef(false);
    const selection = useRef(0);
    const multiline = /[\r\n]/.test(value);

    const expand = () => {
        selection.current = input.current?.selectionStart ?? value.length;
        expanded.current = true;
        setOpen(true);
    };
    const checkOverflow = () => {
        const field = input.current;
        if (!field || composing.current || isDisabled) return;
        const overflows = field.clientWidth > 0 && field.scrollWidth > field.clientWidth + 1;
        if (!overflows && !value.includes("\n")) expanded.current = false;
        if (edited.current && !expanded.current && (overflows || value.includes("\n"))) expand();
        edited.current = false;
    };
    useLayoutEffect(() => {
        checkOverflow();
    }, [value, isDisabled]);
    useLayoutEffect(() => {
        if (open) {
            editor.current?.focus();
            editor.current?.setSelectionRange(selection.current, selection.current);
        }
    }, [open]);

    return (
        <>
            <div
                className="relative min-w-0"
                onClick={(event) => {
                    if (!isDisabled && multiline && event.target === input.current) expand();
                }}
                onKeyDownCapture={(event) => {
                    if (!isDisabled && multiline && event.target === input.current && (event.key === "Enter" || event.key === "F2")) {
                        event.preventDefault();
                        expand();
                    }
                }}
                onCompositionStart={() => {
                    composing.current = true;
                }}
                onCompositionEnd={() => {
                    composing.current = false;
                    checkOverflow();
                }}
                onPasteCapture={(event) => {
                    const text = event.clipboardData.getData("text");
                    if (isDisabled || !/[\r\n]/.test(text)) return;
                    event.preventDefault();
                    const start = input.current?.selectionStart ?? value.length;
                    const end = input.current?.selectionEnd ?? start;
                    onChange((value.slice(0, start) + text + value.slice(end)).slice(0, maxLength));
                    selection.current = Math.min(start + text.length, maxLength);
                    expanded.current = true;
                    setOpen(true);
                }}
            >
                <Input
                    ref={input}
                    label={label}
                    placeholder={placeholder}
                    size="sm"
                    value={value.replace(/[\r\n]/g, " ")}
                    maxLength={maxLength}
                    isDisabled={isDisabled}
                    isRequired={isRequired}
                    isReadOnly={multiline}
                    inputClassName="pr-9"
                    onChange={(next) => {
                        edited.current = true;
                        onChange(next);
                    }}
                />
                <ButtonUtility
                    icon={Expand01}
                    tooltip="Ampliar nota"
                    size="xs"
                    color="tertiary"
                    isDisabled={isDisabled}
                    className={`absolute right-1 bottom-1 ${compensationTableActionClass}`}
                    onClick={expand}
                />
            </div>
            {open && (
                <CompensacionSurface title="Editar nota" onClose={() => setOpen(false)}>
                    <div className="mx-auto w-full max-w-xl rounded-xl border border-secondary bg-primary shadow-xl">
                        <CompensacionDialogHeader title={<>Editar nota</>} onClose={() => setOpen(false)} />
                        <div className="p-5">
                            <TextArea
                                textAreaRef={editor}
                                label={label}
                                value={value}
                                onChange={onChange}
                                rows={7}
                                size="sm"
                                maxLength={maxLength}
                                isDisabled={isDisabled}
                                isRequired={isRequired}
                                hint={`${value.length} / ${maxLength} caracteres`}
                            />
                        </div>
                        <CompensacionDialogFooter>
                            <Button type="button" size="sm" color="primary" onClick={() => setOpen(false)}>
                                Volver al formulario
                            </Button>
                        </CompensacionDialogFooter>
                    </div>
                </CompensacionSurface>
            )}
        </>
    );
};
