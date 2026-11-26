import { useEffect, useState } from "react";
import { Save01, Trash01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { AlertMessage } from "@/components/shared/alert-center";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionEstado } from "../shared/compensacion-estado";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { formatoMonto } from "../shared/compensacion-formato";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { type OperacionCliente, tarjetaOperacionesService } from "./tarjeta-operaciones.service";

const flujoLabel = (flujo: OperacionCliente["flujo"]) => (flujo === "PAGO_DEUDA" ? "Pago de deuda" : "Efectivización");

/** Operaciones del cliente en los últimos 7 días (efectivización y pago de deuda); se vincula una a la tarjeta. */
export const TarjetaOperacionesPopup = ({
    documento,
    value,
    onApply,
    onClose,
}: {
    documento: string;
    /** `referencia` de la operación elegida antes. */
    value: string;
    onApply: (operacion: OperacionCliente | null) => void;
    onClose: () => void;
}) => {
    const [items, setItems] = useState<OperacionCliente[] | null>(null);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [selected, setSelected] = useState(value);
    useEffect(() => {
        let active = true;
        setItems(null);
        setError("");
        tarjetaOperacionesService
            .deCliente(documento)
            .then((rows) => active && setItems(rows))
            .catch(
                (cause) =>
                    active &&
                    setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron cargar las operaciones."),
            );
        return () => {
            active = false;
        };
    }, [documento, retry]);
    const choice = items?.find((item) => item.referencia === selected) ?? null;
    return (
        <CompensacionSurface title="Operación del cliente" onClose={onClose} maxWidth="4xl">
            <div className="flex w-full flex-col overflow-hidden rounded-xl border border-secondary bg-primary shadow-xl">
                <CompensacionDialogHeader title="Operación del cliente" onClose={onClose}>
                    Efectivizaciones y pagos de deuda de los últimos 7 días del documento {documento}.
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {error ? (
                        <div className="space-y-2">
                            <AlertMessage tone="error">{error}</AlertMessage>
                            <Button size="sm" color="secondary" onClick={() => setRetry((count) => count + 1)}>
                                Reintentar
                            </Button>
                        </div>
                    ) : items === null ? (
                        <p role="status" className="text-sm text-tertiary">
                            Consultando operaciones…
                        </p>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-tertiary">El cliente no tiene operaciones de efectivización ni pago de deuda en los últimos 7 días.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-secondary">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-secondary text-xs font-medium text-tertiary">
                                    <tr>
                                        <th className="w-10 px-3 py-2" aria-label="Seleccionar" />
                                        <th className="px-3 py-2">Flujo</th>
                                        <th className="px-3 py-2">Cod. Op.</th>
                                        <th className="px-3 py-2 text-right">Monto</th>
                                        <th className="px-3 py-2 text-right">Comisión</th>
                                        <th className="px-3 py-2">Estado</th>
                                        <th className="px-3 py-2">Fecha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-secondary text-secondary">
                                    {items.map((item) => (
                                        <tr key={`${item.flujo}:${item.id}`} className={selected === item.referencia ? "bg-active" : undefined}>
                                            <td className="px-3 py-2">
                                                <Checkbox
                                                    aria-label={`Seleccionar ${flujoLabel(item.flujo)} ${item.codigo ?? item.id}`}
                                                    isSelected={selected === item.referencia}
                                                    onChange={(checked) => setSelected(checked ? item.referencia : "")}
                                                />
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{flujoLabel(item.flujo)}</td>
                                            <td className="px-3 py-2">{item.codigo ?? "—"}</td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">{formatoMonto(item.monto)}</td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">{formatoMonto(item.comision)}</td>
                                            <td className="px-3 py-2">
                                                <CompensacionEstado dominio="operacion" valor={item.estado.toUpperCase()} detalle={item.estado} />
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <CompensacionFechaCell value={item.fecha} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <CompensacionDialogFooter>
                    {selected && (
                        <Button size="sm" color="tertiary" iconLeading={Trash01} onClick={() => setSelected("")}>
                            Quitar
                        </Button>
                    )}
                    <Button
                        size="sm"
                        color="primary"
                        iconLeading={Save01}
                        isDisabled={items === null || (Boolean(selected) && !choice)}
                        onClick={() => {
                            onApply(choice);
                            onClose();
                        }}
                    >
                        Aplicar
                    </Button>
                    <Button size="sm" color="secondary" iconLeading={XClose} onClick={onClose}>
                        Cancelar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
