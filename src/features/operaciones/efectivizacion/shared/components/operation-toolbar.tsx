import type { ReactNode } from "react";
import { Copy01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

interface OperationToolbarProps {
    activeFilter: string;
    actions: string[];
    code?: string;
    codeMaxLength?: number;
    dateFrom?: string;
    dateTo?: string;
    dateRangeLabel?: string;
    dni: string;
    extraFilters?: ReactNode;
    filters: string[];
    isActionDisabled?: (action: string) => boolean;
    onAction?: (action: string) => void;
    onCodeChange?: (value: string) => void;
    onDateFromChange?: (value: string) => void;
    onDateToChange?: (value: string) => void;
    onDniChange: (value: string) => void;
    onFilterChange: (value: string) => void;
    onCopyTable?: () => void;
    showDateRange?: boolean;
}

export const OperationToolbar = ({
    activeFilter,
    actions,
    code = "",
    codeMaxLength,
    dateFrom = "",
    dateTo = "",
    dateRangeLabel,
    dni,
    extraFilters,
    filters,
    isActionDisabled,
    onAction,
    onCodeChange,
    onDateFromChange,
    onDateToChange,
    onDniChange,
    onFilterChange,
    onCopyTable,
    showDateRange = false,
}: OperationToolbarProps) => {
    const actionLabels: Record<string, string> = {
        "Emp. Salida": "Empresa Transferencia",
        Transferencia: "Transferir",
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                {onCodeChange && (
                    <Input
                        size="sm"
                        label=""
                        aria-label="Codigo operacion"
                        placeholder="Cod. Operacion"
                        value={code}
                        maxLength={codeMaxLength}
                        onChange={onCodeChange}
                        className="w-44"
                    />
                )}
                <Input
                    size="sm"
                    label=""
                    aria-label="DNI"
                    placeholder="DNI"
                    value={dni}
                    onChange={onDniChange}
                    className="w-44"
                />
                {extraFilters}
                {showDateRange && (
                    <>
                        {dateRangeLabel && (
                            <span className="ml-2 shrink-0 text-sm font-medium text-secondary">{dateRangeLabel}</span>
                        )}
                        <Input
                            size="sm"
                            label=""
                            aria-label="Fecha Desde"
                            type="date"
                            value={dateFrom}
                            onChange={onDateFromChange}
                            className="w-40"
                        />
                        <Input
                            size="sm"
                            label=""
                            aria-label="Fecha Hasta"
                            type="date"
                            value={dateTo}
                            onChange={onDateToChange}
                            className="w-40"
                        />
                    </>
                )}
                {!showDateRange &&
                    filters.map((filter) => (
                        <Button
                            key={filter}
                            size="sm"
                            color={filter === activeFilter ? "primary" : "tertiary"}
                            className={filter === activeFilter ? "atk-selected" : undefined}
                            onClick={() => onFilterChange(filter)}
                        >
                            {filter}
                        </Button>
                    ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {actions.map((action) => (
                    <Button
                        key={action}
                        size="sm"
                        color="secondary"
                        className="atk-gold-hover"
                        isDisabled={isActionDisabled?.(action) ?? true}
                        onClick={() => onAction?.(action)}
                    >
                        {actionLabels[action] ?? action}
                    </Button>
                ))}
                {onCopyTable && (
                    <Button
                        size="sm"
                        color="secondary"
                        iconLeading={Copy01}
                        className="atk-gold-hover"
                        onClick={onCopyTable}
                    >
                        Copiar
                    </Button>
                )}
            </div>
        </div>
    );
};
