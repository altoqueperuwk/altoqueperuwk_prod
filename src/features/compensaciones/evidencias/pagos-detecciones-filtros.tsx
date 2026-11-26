import { RefreshCw01, XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { opcionesEstado } from "@/features/compensaciones/shared/compensacion-estados";
import { CompensacionFiltros } from "@/features/compensaciones/shared/compensacion-filtros";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { fechaLima } from "./tarjeta-tercero-form";

export interface PagosDeteccionesFiltros {
    search: string;
    status: string;
    from: string;
    to: string;
}
export const pagosDeteccionesFechasIniciales = () => {
    const date = fechaLima(),
        [year, month] = date.split("-").map(Number);
    return { from: `${date.slice(0, 7)}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
};
export const pagosDeteccionesFiltrosIniciales = (): PagosDeteccionesFiltros => ({ search: "", status: "", ...pagosDeteccionesFechasIniciales() });

const estados = [{ id: "", label: "Todos los estados" }, ...opcionesEstado("registro", ["PENDIENTE", "APROBADO", "RECHAZADO"])];

interface Props {
    draft: PagosDeteccionesFiltros;
    onDraft: (change: (current: PagosDeteccionesFiltros) => PagosDeteccionesFiltros) => void;
    onClear: () => void;
    onApply: () => void;
}
export const PagosDeteccionesFiltrosBar = ({ draft, onDraft, onClear, onApply }: Props) => (
    <CompensacionFiltros toolbar>
        <div className="flex flex-wrap items-end gap-3">
            <div className="w-56 max-w-full">
                <Input
                    size="sm"
                    placeholder="Texto del reporte"
                    label="Buscar"
                    value={draft.search}
                    onChange={(value) => onDraft((current) => ({ ...current, search: value }))}
                />
            </div>
            <div className="w-44">
                <Select
                    size="sm"
                    label="Estado"
                    selectedKey={draft.status}
                    onSelectionChange={(key) => onDraft((current) => ({ ...current, status: String(key ?? "") }))}
                    items={estados}
                >
                    {(item) => <Select.Item {...item} />}
                </Select>
            </div>
            <CompensacionDatePicker hideLabel label="Desde" value={draft.from} onChange={(value) => onDraft((current) => ({ ...current, from: value }))} />
            <CompensacionDatePicker hideLabel label="Hasta" value={draft.to} onChange={(value) => onDraft((current) => ({ ...current, to: value }))} />
            <MonthPicker
                hideLabel
                label="Periodo"
                allowAllMonths={false}
                value={draft.from.slice(0, 7)}
                onChange={(value) => {
                    if (!value) return;
                    const [year, month] = value.split("-").map(Number);
                    onDraft((current) => ({ ...current, from: `${value}-01`, to: `${value}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` }));
                }}
            />
            <Button size="sm" color="primary" iconLeading={XClose} onClick={onClear}>
                Limpiar
            </Button>
            <Button size="sm" color="primary" iconLeading={RefreshCw01} onClick={onApply}>
                Actualizar
            </Button>
        </div>
    </CompensacionFiltros>
);
