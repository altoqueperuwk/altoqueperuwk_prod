import { Children, Fragment, type ReactNode, isValidElement } from "react";
import { XClose } from "@untitledui/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { compensationTableActionClass } from "./compensacion-table-styles";

/** Cabecera y pie aprobados para los popups de Compensaciones. */
export const CompensacionDialogHeader = ({
    title,
    onClose,
    busy = false,
    inline = false,
    children,
    closeLabel = "Cerrar",
}: {
    title: ReactNode;
    onClose?: () => void;
    busy?: boolean;
    inline?: boolean;
    children?: ReactNode;
    closeLabel?: string;
}) => (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-secondary px-4 py-3">
        <div className="min-w-0 flex-1">
            <h2 className={inline ? "text-xs font-medium text-tertiary" : "text-sm font-medium text-primary"}>{title}</h2>
            {children && <div className="mt-1 text-xs font-normal text-tertiary">{children}</div>}
        </div>
        {onClose && (
            <ButtonUtility
                size="xs"
                color="tertiary"
                icon={XClose}
                tooltip={closeLabel}
                className={compensationTableActionClass}
                isDisabled={busy}
                onClick={onClose}
            />
        )}
    </div>
);

const hasContent = (children: ReactNode): boolean =>
    Children.toArray(children).some((child) =>
        isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? hasContent(child.props.children) : true,
    );

export const CompensacionDialogFooter = ({ children }: { children: ReactNode }) =>
    hasContent(children) ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-secondary px-4 py-3">{children}</div> : null;
