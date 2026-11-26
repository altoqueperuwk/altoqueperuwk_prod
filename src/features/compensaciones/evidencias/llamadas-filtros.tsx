import type { ReactNode } from "react";
import { XClose } from "@untitledui/icons";
import { MonthPicker } from "@/components/application/date-picker/month-picker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { estadoVisual } from "@/features/compensaciones/shared/compensacion-estados";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";

export type LlamadasPeriodo = "ALL" | "TODAY" | "WEEK" | "MONTH";
export const llamadasRango = (month: string, period: LlamadasPeriodo, now = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Lima" }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const day = `${part("year")}-${part("month")}-${part("day")}`;
    if (period === "TODAY") return { from: day, to: day };
    if (period === "MONTH") return { from: `${day.slice(0, 7)}-01`, to: day };
    if (period === "WEEK") {
        const start = new Date(`${day}T12:00:00Z`);
        start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
        return { from: start.toISOString().slice(0, 10), to: day };
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { from: "", to: "" };
    const [year, m] = month.split("-").map(Number);
    return { from: `${month}-01`, to: `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}` };
};

type LlamadasFiltrosProps = {
    documento?: string;
    nombre?: string;
    colaborador?: string;
    onDocumento?: (value: string) => void;
    onNombre?: (value: string) => void;
    onColaborador?: (value: string) => void;
    /** Compatibilidad temporal con el consumidor anterior. */
    search?: string;
    onSearch?: (value: string) => void;
    period?: LlamadasPeriodo;
    onPeriod?: (value: LlamadasPeriodo) => void;
    onRefresh?: () => void;
    isLoading?: boolean;
    status: string;
    month: string;
    onStatus: (value: string) => void;
    onMonth: (value: string) => void;
    from: string;
    to: string;
    onFrom: (value: string) => void;
    onTo: (value: string) => void;
    onClear: () => void;
    /** Filtro previo a los demás (p. ej. Bono / Penalidad en Auditoría Operaciones). */
    leading?: ReactNode;
};

export const LlamadasFiltros = ({
    documento = "",
    nombre = "",
    colaborador,
    onDocumento,
    onNombre,
    onColaborador,
    search = "",
    onSearch,
    status,
    month,
    from,
    to,
    onStatus,
    onMonth,
    onFrom,
    onTo,
    onClear,
    leading,
}: LlamadasFiltrosProps) => (
    <div className="-mx-3 -my-2.5 min-w-0 rounded-t-2xl bg-primary">
        <h2 className="border-b border-secondary bg-secondary px-3 py-3 text-xs font-medium text-tertiary">Filtros de Búsqueda</h2>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
            {leading}
            <Input
                aria-label="Filtrar por DNI"
                className="w-full sm:w-32"
                size="sm"
                placeholder="DNI"
                inputMode="numeric"
                maxLength={9}
                value={documento}
                onChange={(value) => onDocumento?.(value.replace(/\D/g, "").slice(0, 9))}
            />
            <Input
                aria-label="Filtrar por cliente"
                className="w-full sm:w-56"
                size="sm"
                placeholder="Nombre Cliente"
                maxLength={200}
                value={nombre}
                onChange={(value) => onNombre?.(value)}
            />
            <Input
                aria-label="Filtrar por colaborador"
                className="w-full sm:w-56"
                size="sm"
                placeholder="Nombre o DNI Colaborador"
                maxLength={200}
                value={colaborador ?? search}
                onChange={(value) => (onColaborador ?? onSearch)?.(value)}
            />
            <Select
                aria-label="Filtrar por estado"
                placeholder="Todos los estados"
                className="w-52"
                size="sm"
                selectedKey={status}
                onSelectionChange={(key) => onStatus(String(key ?? ""))}
                items={[
                    { id: "", label: "Todos los estados" },
                    ...["PENDIENTE", "APROBADO", "RECHAZADO"].map((id) => ({ id, label: estadoVisual("registro", id).label })),
                ]}
            >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
            <div className="w-44">
                <CompensacionDatePicker hideLabel label="Desde" value={from} onChange={onFrom} />
            </div>
            <div className="w-44">
                <CompensacionDatePicker hideLabel label="Hasta" value={to} onChange={onTo} />
            </div>
            <MonthPicker hideLabel allowAllMonths={false} label="Periodo" value={month} onChange={onMonth} />
            <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClear}>
                Limpiar
            </Button>
        </div>
    </div>
);
