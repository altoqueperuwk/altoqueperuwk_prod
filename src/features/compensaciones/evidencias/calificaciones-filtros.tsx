import { XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { estadoVisual } from "@/features/compensaciones/shared/compensacion-estados";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionFiltros } from "../shared/compensacion-filtros";

export interface CalificacionesFiltrosValue {
    documento: string;
    nombreCliente: string;
    colaborador: string;
    comentario: string;
    estrellas: number;
    estado: string;
    desde: string;
    hasta: string;
    periodo: string;
}

export const CalificacionesFiltros = ({
    value,
    onChange,
    onClear,
}: {
    value: CalificacionesFiltrosValue;
    onChange: (value: CalificacionesFiltrosValue) => void;
    onClear: () => void;
}) => {
    const update = (patch: Partial<CalificacionesFiltrosValue>) => onChange({ ...value, ...patch });

    return (
        <CompensacionFiltros toolbar>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Input
                    aria-label="Filtrar por DNI del cliente"
                    className="w-full sm:w-32"
                    placeholder="DNI"
                    inputMode="numeric"
                    maxLength={9}
                    size="sm"
                    value={value.documento}
                    onChange={(next) => update({ documento: next.replace(/\D/g, "").slice(0, 9) })}
                />
                <Input
                    aria-label="Filtrar por nombre del cliente"
                    className="w-full sm:w-56"
                    placeholder="Nombre Cliente"
                    maxLength={200}
                    size="sm"
                    value={value.nombreCliente}
                    onChange={(nombreCliente) => update({ nombreCliente })}
                />
                <Input
                    aria-label="Filtrar por nombre o DNI del colaborador"
                    className="w-full sm:w-56"
                    placeholder="Nombre o DNI Colaborador"
                    maxLength={200}
                    size="sm"
                    value={value.colaborador}
                    onChange={(colaborador) => update({ colaborador })}
                />
                <Select
                    aria-label="Filtrar por estrellas"
                    className="w-full sm:w-44"
                    placeholder="Todas las estrellas"
                    size="sm"
                    selectedKey={value.estrellas}
                    items={[
                        { id: 0, label: "Todas las estrellas" },
                        ...[5, 4, 3, 2, 1].map((count) => ({ id: count, label: `${count} ${count === 1 ? "estrella" : "estrellas"}` })),
                    ]}
                    onSelectionChange={(key) => update({ estrellas: Number(key) || 0 })}
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Select
                    aria-label="Filtrar por estado"
                    className="w-full sm:w-52"
                    placeholder="Todos los estados"
                    size="sm"
                    selectedKey={value.estado}
                    items={[
                        { id: "", label: "Todos los estados" },
                        { id: "PENDIENTE", label: estadoVisual("registro", "PENDIENTE").label },
                        { id: "APROBADO", label: estadoVisual("registro", "APROBADO").label },
                        { id: "RECHAZADO", label: estadoVisual("registro", "RECHAZADO").label },
                        { id: "NO_VALIDA", label: "No válidas" },
                        { id: "BORRADOR", label: estadoVisual("registro", "BORRADOR").label },
                    ]}
                    onSelectionChange={(key) => update({ estado: String(key ?? "") })}
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <div className="w-full sm:w-44">
                    <CompensacionDatePicker hideLabel label="Desde" value={value.desde} onChange={(desde) => update({ desde })} />
                </div>
                <div className="w-full sm:w-44">
                    <CompensacionDatePicker hideLabel label="Hasta" value={value.hasta} onChange={(hasta) => update({ hasta })} />
                </div>
                <MonthPicker
                    hideLabel
                    allowAllMonths={false}
                    label="Periodo"
                    value={value.periodo}
                    onChange={(periodo) => {
                        const [year, month] = periodo.split("-").map(Number);
                        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
                        update({ periodo, desde: `${periodo}-01`, hasta: `${periodo}-${String(lastDay).padStart(2, "0")}` });
                    }}
                />
                <Input
                    aria-label="Filtrar por comentario"
                    className="w-full sm:w-56"
                    placeholder="Comentario"
                    maxLength={200}
                    size="sm"
                    value={value.comentario}
                    onChange={(comentario) => update({ comentario })}
                />
                <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClear}>
                    Limpiar
                </Button>
            </div>
        </CompensacionFiltros>
    );
};
