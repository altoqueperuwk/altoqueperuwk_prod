import { XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { fechaLima } from "../evidencias/tarjeta-tercero-form";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { textosEstado } from "../shared/compensacion-estados";
import { captacionStateLabels } from "./clientes-nuevos-columns";
import type { ClientesNuevosFiltros } from "./clientes-nuevos.service";

type Props = {
    filters: ClientesNuevosFiltros;
    month: string;
    tiktok: boolean;
    onFilter: (key: keyof ClientesNuevosFiltros, value: string) => void;
    onPeriodChange: (value: string) => void;
    onClear: () => void;
};

export const ClientesNuevosFiltrosBar = ({ filters, month, tiktok, onFilter, onPeriodChange, onClear }: Props) => (
    <div className="-mx-3 -my-2.5 min-w-0 rounded-t-2xl bg-primary">
        <h2 className="rounded-t-2xl border-b border-secondary bg-secondary px-3 py-3 text-xs font-medium text-tertiary">Filtros de Búsqueda</h2>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
            <Input
                aria-label="Filtrar por DNI"
                className="w-full sm:w-32"
                size="sm"
                placeholder="DNI"
                inputMode="numeric"
                value={filters.documento ?? ""}
                maxLength={9}
                onChange={(value) => onFilter("documento", value.replace(/\D/g, "").slice(0, 9))}
            />
            <Input
                aria-label="Filtrar por cliente"
                className="w-full sm:w-56"
                size="sm"
                placeholder="Nombre Cliente"
                value={filters.nombre ?? ""}
                maxLength={200}
                onChange={(value) => onFilter("nombre", value)}
            />
            <Input
                aria-label="Filtrar por colaborador"
                className="w-full sm:w-56"
                size="sm"
                placeholder="Nombre o DNI Colaborador"
                value={filters.colaborador ?? ""}
                maxLength={200}
                onChange={(value) => onFilter("colaborador", value)}
            />
            <Select
                aria-label="Filtrar por estado"
                placeholder="Todos los estados"
                className="w-52"
                size="sm"
                items={[
                    { id: "", label: "Todos los estados" },
                    ...Object.entries({
                        ...captacionStateLabels,
                        PENDIENTE_APROBACION: textosEstado("captacionAprobacion", ["PENDIENTE_APROBACION"]).PENDIENTE_APROBACION,
                        APROBADO: textosEstado("captacionAprobacion", ["APROBADO"]).APROBADO,
                        RECHAZADO: textosEstado("captacionAprobacion", ["RECHAZADO"]).RECHAZADO,
                        REQUIERE_REVISION: textosEstado("captacionAprobacion", ["REQUIERE_REVISION"]).REQUIERE_REVISION,
                    }).map(([id, label]) => ({ id, label })),
                ]}
                selectedKey={filters.estado ?? ""}
                onSelectionChange={(value) => onFilter("estado", String(value ?? ""))}
            >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
            <div className="w-44">
                <CompensacionDatePicker hideLabel label="Desde" value={filters.desde ?? ""} onChange={(value) => onFilter("desde", value)} />
            </div>
            <div className="w-44">
                <CompensacionDatePicker hideLabel label="Hasta" value={filters.hasta ?? ""} onChange={(value) => onFilter("hasta", value)} />
            </div>
            <MonthPicker hideLabel label="Periodo" value={month} allowAllMonths={false} onChange={onPeriodChange} />
            <Button size="sm" color={tiktok ? "primary" : "secondary"} iconLeading={XClose} onClick={onClear}>
                Limpiar
            </Button>
        </div>
    </div>
);

export const currentLimaMonth = () => fechaLima().slice(0, 7);
