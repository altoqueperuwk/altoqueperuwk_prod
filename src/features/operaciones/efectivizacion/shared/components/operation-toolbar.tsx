import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

interface OperationToolbarProps {
    activeFilter: string;
    actions: string[];
    code?: string;
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
    showDateRange?: boolean;
}

export const OperationToolbar = ({
    activeFilter,
    actions,
    code = "",
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
    showDateRange = false,
}: OperationToolbarProps) => {
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
                        isDisabled={isActionDisabled?.(action) ?? true}
                        onClick={() => onAction?.(action)}
                    >
                        {action}
                    </Button>
                ))}
            </div>
        </div>
    );
};
