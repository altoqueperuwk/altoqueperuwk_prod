import type { FC, ReactNode } from "react";
import { motion } from "motion/react";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Button } from "@/components/base/buttons/button";
import { useSessionCache } from "@/providers/session-cache-provider";
import { getCoreEstadoItems } from "@/utils/estado-options";
import { SearchMd, Plus, X } from "@untitledui/icons";

interface FilterBarProps {
    title: string;
    filterNombre: string;
    onFilterNombreChange: (value: string) => void;
    filterEstado?: number;
    onFilterEstadoChange?: (value: number) => void;
    onSearch: () => void;
    onClear: () => void;
    onNew: () => void;
    hideEstadoFilter?: boolean;
    extraFilters?: ReactNode;
}

export const FilterBar: FC<FilterBarProps> = ({
    title,
    filterNombre,
    onFilterNombreChange,
    filterEstado,
    onFilterEstadoChange,
    onSearch,
    onClear,
    onNew,
    hideEstadoFilter = false,
    extraFilters,
}) => {
    const { estados } = useSessionCache();

    const estadoItems = [
        { id: 0, label: "Todos" },
        ...getCoreEstadoItems(estados),
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4"
        >
            <h1 className="text-xl font-semibold text-primary">{title}</h1>
            <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                    <Input
                        label="Nombre"
                        placeholder="Buscar por nombre"
                        size="sm"
                        value={filterNombre}
                        onChange={onFilterNombreChange}
                    />
                </div>

                {!hideEstadoFilter && (
                    <div className="w-44">
                        <Select
                            label="Estado"
                            placeholder="Todos"
                            size="sm"
                            items={estadoItems}
                            selectedKey={filterEstado}
                            onSelectionChange={(key) => {
                                if (onFilterEstadoChange) {
                                    onFilterEstadoChange(key !== null ? Number(key) : 0);
                                }
                            }}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    </div>
                )}

                {extraFilters}

                <Button size="sm" color="primary" iconLeading={SearchMd} onClick={onSearch}>
                    Buscar
                </Button>
                <Button size="sm" color="secondary" iconLeading={X} onClick={onClear}>
                    Limpiar
                </Button>

                <div className="ml-auto">
                    <Button size="sm" color="primary" iconLeading={Plus} onClick={onNew}>
                        Nuevo
                    </Button>
                </div>
            </div>
        </motion.div>
    );
};
