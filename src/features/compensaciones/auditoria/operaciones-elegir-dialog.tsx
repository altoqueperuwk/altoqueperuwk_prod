import { useEffect, useRef, useState } from "react";
import { CheckCircle, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { AlertMessage } from "@/components/shared/alert-center";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { formatoMonto } from "../shared/compensacion-formato";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { mensajeError } from "./auditoria-datos";

export interface OperacionElegible {
    key: string;
    codigo: string;
    detalle?: string;
    monto?: number | null;
    fecha?: string | null;
    /** Dato original que el perfil envía al guardar. */
    raw: unknown;
}

/** La misma ventana de «Adjuntar operación» para todos los perfiles. */
export const OperacionesElegirDialog = ({
    dni,
    multiple = false,
    elegidas,
    buscar,
    onAplicar,
    onClose,
}: {
    dni: string;
    multiple?: boolean;
    elegidas: OperacionElegible[];
    buscar: () => Promise<OperacionElegible[]>;
    onAplicar: (operaciones: OperacionElegible[]) => void;
    onClose: () => void;
}) => {
    const [items, setItems] = useState<OperacionElegible[] | null>(null);
    const [error, setError] = useState("");
    const [marcadas, setMarcadas] = useState(() => new Map(elegidas.map((op) => [op.key, op])));
    // La consulta se hace una vez al abrir la ventana.
    const consulta = useRef(buscar);
    useEffect(() => {
        let active = true;
        consulta
            .current()
            .then((result) => {
                if (active) setItems(result);
            })
            .catch((cause) => {
                if (active) setError(mensajeError(cause, "No se pudieron cargar las operaciones"));
            });
        return () => {
            active = false;
        };
    }, []);
    const marcar = (op: OperacionElegible, on: boolean) =>
        setMarcadas((previas) => {
            const next = new Map(multiple ? previas : []);
            if (on) next.set(op.key, op);
            else next.delete(op.key);
            return next;
        });
    return (
        <CompensacionSurface title="Adjuntar operación" onClose={onClose} maxWidth="4xl">
            <div className="flex w-full flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title="Adjuntar operación" onClose={onClose}>
                    <p className="text-xs text-tertiary">Operaciones del DNI {dni}.</p>
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {error ? (
                        <AlertMessage tone="error">{error}</AlertMessage>
                    ) : items === null ? (
                        <p role="status" className="text-sm text-tertiary">
                            Consultando operaciones…
                        </p>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-tertiary">Sin operaciones para este DNI.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-secondary">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-secondary text-xs font-medium text-tertiary">
                                    <tr>
                                        <th className="w-10 px-3 py-2" aria-label="Seleccionar" />
                                        <th className="px-3 py-2">Operación</th>
                                        <th className="px-3 py-2">Detalle</th>
                                        <th className="px-3 py-2 text-right">Monto</th>
                                        <th className="px-3 py-2">Fecha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-secondary text-secondary">
                                    {items.map((op) => (
                                        <tr key={op.key} className={marcadas.has(op.key) ? "bg-active" : undefined}>
                                            <td className="px-3 py-2">
                                                <Checkbox
                                                    aria-label={`Seleccionar operación ${op.codigo}`}
                                                    isSelected={marcadas.has(op.key)}
                                                    onChange={(on) => marcar(op, on)}
                                                />
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{op.codigo}</td>
                                            <td className="px-3 py-2">{op.detalle || "—"}</td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">{op.monto == null ? "—" : formatoMonto(op.monto)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">{op.fecha ? <CompensacionFechaCell value={op.fecha} /> : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        iconLeading={CheckCircle}
                        isDisabled={items === null}
                        onClick={() => {
                            onAplicar([...marcadas.values()]);
                            onClose();
                        }}
                    >
                        Adjuntar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
