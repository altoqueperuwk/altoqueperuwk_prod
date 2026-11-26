import { RefreshCw01, XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";

export const MarketingFilters = ({
    search,
    onSearch,
    state,
    onState,
    stateOptions,
    month,
    onMonth,
    onClear,
    onRefresh,
}: {
    search: string;
    onSearch: (value: string) => void;
    state: string;
    onState: (value: string) => void;
    stateOptions: { id: string; label: string }[];
    month: string;
    onMonth: (value: string) => void;
    onClear: () => void;
    onRefresh: () => void;
}) => (
    <CompensacionFiltros toolbar>
        <div className="flex flex-wrap items-end gap-3">
            <div className="w-60">
                <Input label="Buscar" size="sm" value={search} onChange={onSearch} placeholder="Nombre o DNI" />
            </div>
            <div className="w-44">
                <Select
                    label="Estado"
                    size="sm"
                    selectedKey={state}
                    onSelectionChange={(v) => onState(String(v ?? ""))}
                    items={[{ id: "", label: "Todos los estados" }, ...stateOptions]}
                >
                    {(item) => <Select.Item {...item} />}
                </Select>
            </div>
            <MonthPicker hideLabel allowAllMonths={false} label="Periodo" value={month} onChange={onMonth} />
            <Button size="sm" color="primary" iconLeading={XClose} onClick={onClear}>
                Limpiar
            </Button>
            <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={onRefresh}>
                Actualizar
            </Button>
        </div>
    </CompensacionFiltros>
);
