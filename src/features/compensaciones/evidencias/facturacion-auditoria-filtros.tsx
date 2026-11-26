import { RefreshCw01, XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { estados } from "./facturacion-auditoria-constantes";
import { facturacionFechasMes } from "./facturacion-auditoria.service";
import type { FacturacionAuditoriaControl } from "./use-facturacion-auditoria";

export const FacturacionAuditoriaFiltros = ({ c }: { c: FacturacionAuditoriaControl }) => {
    const { filters, setFilters, mes, setMes } = c;
    return (
        <CompensacionFiltros toolbar>
            <div className="flex flex-wrap items-end gap-3">
                <Input
                    aria-label="Filtrar por DNI del cliente"
                    placeholder="DNI"
                    inputMode="numeric"
                    size="sm"
                    className="w-36"
                    value={filters.dni}
                    maxLength={8}
                    onChange={(dni) => setFilters((f) => ({ ...f, dni: dni.replace(/\D/g, "") }))}
                />
                <Select
                    aria-label="Filtrar por estado"
                    placeholder="Todos los estados"
                    size="sm"
                    className="w-44"
                    items={estados}
                    selectedKey={filters.estado}
                    onSelectionChange={(v) => setFilters((f) => ({ ...f, estado: String(v ?? "") }))}
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <div className="w-44">
                    <CompensacionDatePicker hideLabel label="Desde" value={filters.desde} onChange={(desde) => setFilters((f) => ({ ...f, desde }))} />
                </div>
                <div className="w-44">
                    <CompensacionDatePicker hideLabel label="Hasta" value={filters.hasta} onChange={(hasta) => setFilters((f) => ({ ...f, hasta }))} />
                </div>
                <MonthPicker
                    hideLabel
                    label="Periodo"
                    allowAllMonths={false}
                    value={mes}
                    onChange={(value) => {
                        setMes(value);
                        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) setFilters((f) => ({ ...f, ...facturacionFechasMes(value) }));
                    }}
                />
                <Button size="sm" color="primary" iconLeading={XClose} onClick={c.limpiarFiltros}>
                    Limpiar
                </Button>
                <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={c.actualizar}>
                    Actualizar
                </Button>
            </div>
        </CompensacionFiltros>
    );
};
