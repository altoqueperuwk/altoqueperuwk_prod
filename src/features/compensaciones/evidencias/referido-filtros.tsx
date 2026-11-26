import { XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { opcionesEstado } from "../shared/compensacion-estados";

export type ReferidoFiltros = { documento: string; nombre: string; colaborador: string; status: string; month: string; desde: string; hasta: string };
export const referidoPeriodo = (month: string) => {
    const [year, number] = month.split("-").map(Number);
    return { desde: `${month}-01`, hasta: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) };
};
export const ReferidoFiltrosBar = ({
    value,
    onChange,
    onClear,
}: {
    value: ReferidoFiltros;
    onChange: (value: ReferidoFiltros) => void;
    onClear: () => void;
}) => (
    <div className="-mx-3 -my-2.5 min-w-0 rounded-t-2xl bg-primary">
        <h2 className="border-b border-secondary bg-secondary px-3 py-3 text-xs font-medium text-tertiary">Filtros de Búsqueda</h2>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
            <Input
                aria-label="Filtrar por DNI"
                placeholder="DNI"
                className="w-full sm:w-32"
                size="sm"
                inputMode="numeric"
                maxLength={9}
                value={value.documento}
                onChange={(documento) => onChange({ ...value, documento: documento.replace(/\D/g, "").slice(0, 9) })}
            />
            <Input
                aria-label="Filtrar por cliente"
                placeholder="Nombre Cliente"
                className="w-full sm:w-56"
                size="sm"
                maxLength={200}
                value={value.nombre}
                onChange={(nombre) => onChange({ ...value, nombre })}
            />
            <Input
                aria-label="Filtrar por colaborador"
                placeholder="Nombre o DNI Colaborador"
                className="w-full sm:w-56"
                size="sm"
                maxLength={200}
                value={value.colaborador}
                onChange={(colaborador) => onChange({ ...value, colaborador })}
            />
            <Select
                aria-label="Filtrar por estado"
                placeholder="Todos los estados"
                className="w-52"
                size="sm"
                selectedKey={value.status}
                items={[{ id: "", label: "Todos los estados" }, ...opcionesEstado("referido", ["PENDIENTE", "VALIDADO", "RECHAZADO", "ANULADO"])]}
                onSelectionChange={(key) => onChange({ ...value, status: String(key ?? "") })}
            >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
            <div className="w-44">
                <CompensacionDatePicker hideLabel label="Desde" value={value.desde} onChange={(desde) => onChange({ ...value, desde })} />
            </div>
            <div className="w-44">
                <CompensacionDatePicker hideLabel label="Hasta" value={value.hasta} onChange={(hasta) => onChange({ ...value, hasta })} />
            </div>
            <MonthPicker
                hideLabel
                label="Periodo"
                allowAllMonths={false}
                value={value.month}
                onChange={(month) => onChange({ ...value, month, ...referidoPeriodo(month) })}
            />
            <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClear}>
                Limpiar
            </Button>
        </div>
    </div>
);
