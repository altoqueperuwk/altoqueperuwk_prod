import { useEffect, useMemo, useState } from "react";
import type { Key } from "react-aria-components";
import { Select } from "@/components/base/select/select";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    CajaOperativaCierre,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface BancariaHistoryDropdownProps {
    activeCajaIds?: number[];
    activeCompany: RutaOperacionCaja | null;
    selectedClosureId?: number | null;
    selectedDate: string | null;
    onClosureChange?: (selection: { id: number; date: string } | null) => void;
    onDateChange: (date: string | null) => void;
    onSelectedDateAvailabilityChange?: (isAvailable: boolean) => void;
}

interface ClosureOption {
    id: string;
    closureId: number | null;
    dateKey: string;
    label: string;
    supportingText?: string;
}

const toDateKey = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Lima",
        year: "numeric",
    }).formatToParts(new Date(value));

    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";

    return `${year}-${month}-${day}`;
};

const formatClosureDate = (dateKey: string) => {
    const [year, month, day] = dateKey.split("-");
    return `${day}/${month}/${year}`;
};

const getClosureOptions = (items: CajaOperativaCierre[]): ClosureOption[] => {
    const uniqueItems = new Map<number, CajaOperativaCierre>();

    for (const item of items) {
        if (!uniqueItems.has(item.id)) uniqueItems.set(item.id, item);
    }

    const closures = Array.from(uniqueItems.values()).sort((a, b) => {
        const dateDifference = new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime();
        return dateDifference || b.id - a.id;
    });
    return closures.map((item) => {
        const dateKey = toDateKey(item.fecha_cierre);
        const dateLabel = formatClosureDate(dateKey);
        const label = dateLabel;

        return { id: String(item.id), closureId: item.id, dateKey, label };
    });
};

export const BancariaHistoryDropdown = ({
    activeCajaIds = [],
    activeCompany,
    selectedClosureId,
    selectedDate,
    onClosureChange,
    onDateChange,
    onSelectedDateAvailabilityChange,
}: BancariaHistoryDropdownProps) => {
    const [items, setItems] = useState<CajaOperativaCierre[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const closureOptions = useMemo(() => getClosureOptions(items), [items]);
    const activeCajaLabel = "Sin Cierre de Caja";
    const selectItems = useMemo(() => {
        const options = [...closureOptions];

        if (selectedClosureId && !options.some((item) => item.closureId === selectedClosureId)) {
            options.unshift({
                id: String(selectedClosureId),
                closureId: selectedClosureId,
                dateKey: selectedDate ?? "",
                label: selectedDate ? formatClosureDate(selectedDate) : `Cierre ${selectedClosureId}`,
            });
        }

        return [{ id: "sin-cierre", closureId: null, dateKey: "", label: activeCajaLabel }, ...options];
    }, [activeCajaLabel, closureOptions, selectedClosureId, selectedDate]);

    useEffect(() => {
        if (!activeCompany) {
            setItems([]);
            onDateChange(null);
            onClosureChange?.(null);
            return;
        }

        let ignore = false;
        setIsLoading(true);
        setError(null);

        const uniqueCajaIds = Array.from(new Set(activeCajaIds.filter(Boolean)));
        const requests = uniqueCajaIds.length
            ? uniqueCajaIds.map((idCaja) => operacionesRpcService.getCajaCierres({ p_id_caja: idCaja }))
            : [operacionesRpcService.getCajaCierres({ p_id_empresa: activeCompany.id_empresa })];

        Promise.all(requests)
            .then((results) => {
                const merged = results
                    .flat()
                    .sort((a, b) => new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime());

                if (ignore) return;

                setItems(merged);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "Error al cargar historial.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeCajaIds, activeCompany, onClosureChange, onDateChange]);

    useEffect(() => {
        if (!selectedDate) {
            onSelectedDateAvailabilityChange?.(true);
            return;
        }

        if (!activeCompany) {
            onSelectedDateAvailabilityChange?.(false);
            return;
        }

        if (isLoading) return;

        onSelectedDateAvailabilityChange?.(closureOptions.some((item) => item.dateKey === selectedDate));
    }, [activeCompany, closureOptions, isLoading, onSelectedDateAvailabilityChange, selectedDate]);

    const handleSelectionChange = (key: Key | null) => {
        const value = key ? String(key) : null;
        if (value === "sin-cierre" || !value) {
            onDateChange(null);
            onClosureChange?.(null);
            return;
        }

        const option = closureOptions.find((item) => item.id === value);
        onDateChange(option?.dateKey ?? null);
        onClosureChange?.(option?.closureId != null ? { id: option.closureId, date: option.dateKey } : null);
    };

    const selectedKey = selectedClosureId
        ? String(selectedClosureId)
        : selectedDate
            ? (closureOptions.find((item) => item.dateKey === selectedDate)?.id ?? selectedDate)
            : "sin-cierre";

    return (
        <Select
            aria-label="Historial de cierres"
            className="w-48 max-w-[calc(100vw-2rem)]"
            isDisabled={!activeCompany || isLoading || Boolean(error)}
            items={selectItems}
            placeholder={isLoading ? "Cargando..." : "Sin Cierre de Caja"}
            popoverClassName="max-h-[18.75rem] overflow-y-auto"
            selectedKey={selectedKey}
            size="sm"
            onSelectionChange={handleSelectionChange}
        >
            {(item) => (
                <Select.Item
                    id={item.id}
                    label={item.label}
                    supportingText={undefined}
                    selectionIndicator={item.id === "sin-cierre" ? "none" : "checkmark"}
                />
            )}
        </Select>
    );
};
