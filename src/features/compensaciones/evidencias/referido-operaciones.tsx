import { useEffect, useState } from "react";
import { AlertMessage } from "@/components/shared/alert-center";
import { CompensacionEstado } from "@/features/compensaciones/shared/compensacion-estado";
import { compensationDate, compensationMoney } from "../shared/compensacion-cells";
import { serviceLabel } from "../shared/compensacion-formato";
import { type ReferidoOperacionEvidencia, referidoError, referidosService } from "./referidos.service";

export const ReferidoOperaciones = ({ id = null, dni = null }: { id?: number | null; dni?: string | null }) => {
    const [items, setItems] = useState<ReferidoOperacionEvidencia[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        setItems([]);
        setError("");
        setLoading(true);
        referidosService
            .operations(id, dni)
            .then((result) => {
                if (active) setItems(result.items);
            })
            .catch((cause) => {
                if (active) setError(referidoError(cause));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id, dni]);
    return (
        <section className="mt-4 space-y-3" aria-label="Operaciones del cliente">
            <h3 className="text-md font-semibold text-primary">Evidencia en Operaciones</h3>
            <p className="text-sm text-tertiary">
                Pago Deuda, efectivización, POS y Link Pago. Encontrar una operación no aprueba el bono. Se muestran hasta 100 operaciones recientes dentro de
                tu alcance.
            </p>
            {loading ? (
                <p role="status" className="text-sm text-secondary">
                    Consultando operaciones…
                </p>
            ) : error ? (
                <AlertMessage tone="error">{error}</AlertMessage>
            ) : !items.length ? (
                <p className="text-sm text-secondary">No hay operaciones para este DNI dentro de tu alcance.</p>
            ) : (
                items.map((op) => (
                    <article key={op.id} className="space-y-2 rounded-lg border border-secondary bg-secondary p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-primary">
                                {op.servicio ? serviceLabel(op.servicio) : "Sin servicio"} · {op.banco || "Sin banco"}
                            </p>
                            <CompensacionEstado dominio="operacion" valor={op.estado} />
                        </div>
                        <p className="text-sm text-secondary">
                            {compensationMoney.format(Number(op.monto))} · {compensationDate(op.fecha)} · Tasa: {op.porcentaje ?? "—"}%
                        </p>
                        <p className="text-xs break-all text-tertiary">Código: {op.codigo || "Sin código"}</p>
                        <p className="text-sm text-secondary">{op.motivo}</p>
                    </article>
                ))
            )}
        </section>
    );
};
