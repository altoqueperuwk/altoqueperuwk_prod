import { Avatar } from "@/components/base/avatar/avatar";
import { estadoVisual } from "./compensacion-estados";
import { CompensacionFechaCell } from "./compensacion-fecha-cell";
import { formatoMonto, monedaCompensacion, titleCaseSiMayusculas, vencePronto } from "./compensacion-formato";

export const NombreCell = ({ value }: { value: unknown }) => (
    <span title={String(value ?? "")} className="font-medium text-primary">
        {value ? titleCaseSiMayusculas(value) : "—"}
    </span>
);
export const MontoCell = ({ value, className = "text-secondary" }: { value: unknown; className?: string }) => (
    <span className={`block text-right whitespace-nowrap tabular-nums ${className}`}>{formatoMonto(value)}</span>
);
export const VenceCell = ({ value }: { value: unknown }) =>
    vencePronto(value) ? (
        <span className="text-error-primary">
            <CompensacionFechaCell value={value} />
        </span>
    ) : (
        <CompensacionFechaCell value={value} />
    );

export const PersonaCell = ({ name, detail }: { name: string; detail?: string }) => (
    <div className="flex min-w-0 items-center gap-2">
        <Avatar
            size="xs"
            initials={name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase()}
        />
        <div className="min-w-0">
            <p className="font-medium break-words text-primary" title={name}>
                {titleCaseSiMayusculas(name)}
            </p>
            {detail && (
                <p className="text-xs break-words text-tertiary" title={detail}>
                    {detail}
                </p>
            )}
        </div>
    </div>
);

export const NotasCell = ({ value }: { value: unknown }) => {
    const text = typeof value === "string" && value.trim() ? value : "—";
    return (
        <p className="line-clamp-2 max-w-64 text-xs break-words whitespace-pre-wrap text-secondary" title={text}>
            {text}
        </p>
    );
};

export const EstrellasCell = ({ value }: { value: unknown }) => {
    const stars = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return <span className="text-tertiary">Sin calificación</span>;
    return (
        <span role="img" aria-label={`${stars} de 5 estrellas`} className="text-sm whitespace-nowrap text-warning-primary">
            <span aria-hidden="true">
                {"★".repeat(stars)}
                {"☆".repeat(5 - stars)}
            </span>
        </span>
    );
};

export const compensationMoney = monedaCompensacion;
export const missingAmountLabel = (state: unknown) =>
    ["BORRADOR", "PENDIENTE"].includes(String(state)) ? "Pendiente" : ["RECHAZADO", "ANULADO"].includes(String(state)) ? "—" : "Sin importe";
export const compensationDate = (value: unknown) => {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
        ? "—"
        : new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Lima" }).format(date);
};
export const compensationStatus = (value: unknown) => estadoVisual("registro", value).label;
export const compensationStatusColor = (value: unknown) => estadoVisual("registro", value).tone;
