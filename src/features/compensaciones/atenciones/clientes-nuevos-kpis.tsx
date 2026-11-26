import { AlertCircle, CheckCircle, Clock, Coins01 } from "@untitledui/icons";
import type { ClientesNuevosResult } from "./clientes-nuevos.service";

export const ClientesNuevosKpis = ({ data, error }: { data: ClientesNuevosResult | null; error: string }) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
            { label: "En espera", value: data?.esperando, icon: Clock, tone: "text-warning-primary", helper: "Esperando pago dentro del plazo" },
            {
                label: "Elegible",
                value: data?.habilitados,
                icon: CheckCircle,
                tone: "text-success-primary",
                helper: "Cumplen pago y plazo; revisar aprobación",
            },
            { label: "No cumple", value: data?.bloqueados, icon: AlertCircle, tone: "text-error-primary", helper: "Sin pago válido en siete días" },
            {
                label: "Comisión",
                value: new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(data?.total_comision ?? 0),
                icon: Coins01,
                tone: "text-success-primary",
                helper: "Comisiones aprobadas de la consulta seleccionada",
            },
        ].map(({ label, value, icon: Icon, tone, helper }) => (
            <article key={label} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-secondary bg-secondary px-4 py-3">
                    <h2 className="text-xs font-medium text-tertiary">{label}</h2>
                    <Icon aria-hidden="true" className={`size-5 shrink-0 ${tone}`} />
                </div>
                <div className="flex-1 px-4 py-4">
                    <p className={`text-display-xs font-semibold tabular-nums ${tone}`}>{!data || error ? "—" : (value ?? "—")}</p>
                    <p className="mt-1 text-xs text-tertiary">{helper}</p>
                </div>
            </article>
        ))}
    </div>
);
