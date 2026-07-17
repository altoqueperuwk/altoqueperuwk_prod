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
    selectedDate: string | null;
    onDateChange: (date: string | null) => void;
    onSelectedDateAvailabilityChange?: (isAvailable: boolean) => void;
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

const getClosureDates = (items: CajaOperativaCierre[]) => {
    const uniqueDates = new Map<string, CajaOperativaCierre>();

    for (const item of items) {
        const dateKey = toDateKey(item.fecha_cierre);
        if (!uniqueDates.has(dateKey)) uniqueDates.set(dateKey, item);
    }

    return Array.from(uniqueDates.entries())
        .map(([dateKey, item]) => ({ id: dateKey, label: formatClosureDate(dateKey), raw: item }))
        .sort((a, b) => b.id.localeCompare(a.id));
};

export const BancariaHistoryDropdown = ({
    activeCajaIds = [],
    activeCompany,
    selectedDate,
    onDateChange,
    onSelectedDateAvailabilityChange,
}: BancariaHistoryDropdownProps) => {
    const [items, setItems] = useState<CajaOperativaCierre[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const dateOptions = useMemo(() => getClosureDates(items), [items]);
    const selectItems = useMemo(() => {
        const options = [...dateOptions];

        if (selectedDate && !options.some((item) => item.id === selectedDate)) {
            options.unshift({ id: selectedDate, label: formatClosureDate(selectedDate), raw: null });
        }

        return [{ id: "hoy", label: "Hoy" }, ...options];
    }, [dateOptions, selectedDate]);

    useEffect(() => {
        if (!activeCompany) {
            setItems([]);
            onDateChange(null);
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
    }, [activeCajaIds, activeCompany, onDateChange]);

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

        onSelectedDateAvailabilityChange?.(dateOptions.some((item) => item.id === selectedDate));
    }, [activeCompany, dateOptions, isLoading, onSelectedDateAvailabilityChange, selectedDate]);

    const handleSelectionChange = (key: Key | null) => {
        const value = key ? String(key) : null;
        onDateChange(value === "hoy" ? null : value);
    };

    return (
        <Select
            aria-label="Historial de cierres"
            className="w-48"
            isDisabled={!activeCompany || isLoading || Boolean(error)}
            items={selectItems}
            placeholder={isLoading ? "Cargando..." : "Hoy"}
            popoverClassName="max-h-[18.75rem] overflow-y-auto"
            selectedKey={selectedDate ?? "hoy"}
            size="sm"
            onSelectionChange={handleSelectionChange}
        >
            {(item) => (
                <Select.Item id={item.id} selectionIndicator={item.id === "hoy" ? "none" : "checkmark"}>
                    {item.label}
                </Select.Item>
            )}
        </Select>
    );
};
