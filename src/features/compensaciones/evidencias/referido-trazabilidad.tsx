import { AlertMessage } from "@/components/shared/alert-center";
import { usePersonalConsulta } from "../shared/use-personal-consulta";
import { evidenciasService } from "./evidencias.service";
import { OperacionTrazabilidad } from "./operacion-trazabilidad";

export const ReferidoTrazabilidad = ({ eventId, onChanged }: { eventId: number; onChanged: () => void }) => {
    const { data, busy, error } = usePersonalConsulta(() => evidenciasService.getList({ eventId, category: "REFERIDO", page: 1, pageSize: 20 }), [eventId]);
    if (busy)
        return (
            <p role="status" className="mt-3 text-xs text-tertiary">
                Consultando trazabilidad…
            </p>
        );
    if (error) return <AlertMessage tone="error">{error}</AlertMessage>;
    const event = data?.items.find((entry) => entry.id === eventId);
    return event ? (
        <div className="mt-4">
            <OperacionTrazabilidad item={event} onChanged={onChanged} />
        </div>
    ) : null;
};
