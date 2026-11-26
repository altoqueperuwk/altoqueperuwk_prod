import { StatusBadge } from "@/components/shared/status-badge";
import { type EstadoDominio, estadoVisual } from "./compensacion-estados";

/** Usa el badge compartido; el detalle largo permanece fuera del vocabulario de estados. */
export const CompensacionEstado = ({
    dominio = "registro",
    valor,
    detalle,
    prefijo = "",
}: {
    dominio?: EstadoDominio;
    valor: unknown;
    detalle?: string;
    prefijo?: string;
}) => {
    const visual = estadoVisual(dominio, valor);
    const raw = typeof valor === "string" ? valor : "";
    const explanation =
        detalle ||
        (dominio === "atribucion" && raw.toUpperCase() === "LIBERADA" ? "La atribución fue liberada y puede reutilizarse; no equivale a un rechazo." : raw);
    return (
        <span className="inline-flex max-w-full" title={explanation || undefined}>
            <StatusBadge tone={visual.tone}>
                {prefijo}
                {visual.label}
            </StatusBadge>
        </span>
    );
};
