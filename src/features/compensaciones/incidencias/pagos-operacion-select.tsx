import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/base/select/select";
import { AlertMessage } from "@/components/shared/alert-center";
import { type PagosControlOperacion, pagosControlService } from "../pagos/pagos-control.service";

/** Faltas de Pagos que el servidor solo aprueba si el reporte lleva una operación del colaborador. */
export type PagosVinculo = "DESCUADRE" | "CIERRE" | "VOUCHER";
export const pagosVinculo = (codigo: string | undefined): PagosVinculo | null => {
    const falta = /^PAG_[A-Z_]+_(DESCUADRE|CIERRE_INCOMPLETO|RETRASO_VOUCHER)$/.exec(codigo ?? "")?.[1];
    return falta === "DESCUADRE" ? "DESCUADRE" : falta === "CIERRE_INCOMPLETO" ? "CIERRE" : falta === "RETRASO_VOUCHER" ? "VOUCHER" : null;
};

/** Misma regla que la aprobación: cierre o voucher exigen una operación pagada, con el plazo de 48 horas ya incumplido. */
export const operacionAcredita = (operacion: PagosControlOperacion, vinculo: PagosVinculo, fechaHecho: string, ahora = Date.now()) => {
    if (vinculo === "DESCUADRE") return true;
    const limite = Date.parse(operacion.limite ?? "");
    if (!operacion.pagada || !(Date.parse(`${fechaHecho.slice(0, 16)}:00-05:00`) > limite)) return false;
    return vinculo === "CIERRE"
        ? operacion.cierre_estado === "POR_REVISAR" || operacion.cierre_estado === "FUERA_DE_PLAZO"
        : operacion.entrega_tardia === true || (operacion.entrega_id == null && ahora > limite);
};

const mesAnterior = (mes: string) => {
    const [anio, numero] = mes.split("-").map(Number);
    return new Date(Date.UTC(anio, numero - 2, 1)).toISOString().slice(0, 7);
};
const operacionesDelMes = async (mes: string, colaborador: number) => {
    const primera = await pagosControlService.list(mes, colaborador, 1, 100);
    const items = [...primera.items];
    for (let pagina = 2; pagina <= primera.total_paginas; pagina += 1) items.push(...(await pagosControlService.list(mes, colaborador, pagina, 100)).items);
    return items;
};
const dia = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" });
const errorText = (cause: unknown) =>
    cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron consultar las operaciones";

export const PagosOperacionSelect = ({
    colaboradorId,
    vinculo,
    fechaHecho,
    value,
    onChange,
    disabled,
    className,
}: {
    colaboradorId: number | null;
    vinculo: PagosVinculo;
    fechaHecho: string;
    value: number | null;
    onChange: (id: number | null) => void;
    disabled?: boolean;
    className?: string;
}) => {
    const [operaciones, setOperaciones] = useState<PagosControlOperacion[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const mes = fechaHecho.slice(0, 7);
    useEffect(() => {
        let active = true;
        setOperaciones([]);
        setError("");
        setLoading(false);
        if (colaboradorId && /^\d{4}-\d{2}$/.test(mes)) {
            setLoading(true);
            // El plazo de 48 horas puede vencer en el mes siguiente al pago, por eso se incluye el mes anterior.
            Promise.all([operacionesDelMes(mes, colaboradorId), operacionesDelMes(mesAnterior(mes), colaboradorId)])
                .then((meses) => {
                    if (active) setOperaciones(meses.flat());
                })
                .catch((cause: unknown) => {
                    if (active) setError(errorText(cause));
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        }
        return () => {
            active = false;
        };
    }, [colaboradorId, mes]);
    const items = useMemo(
        () =>
            operaciones
                .filter((operacion) => operacionAcredita(operacion, vinculo, fechaHecho))
                .map((operacion) => ({
                    id: String(operacion.id),
                    label: `${operacion.codigo || `Op. ${operacion.id}`} · ${dia.format(new Date(operacion.fecha))} · ${operacion.cliente}`,
                })),
        [operaciones, vinculo, fechaHecho],
    );
    const vigente = value != null && items.some((item) => item.id === String(value));
    useEffect(() => {
        if (value != null && !loading && !vigente) onChange(null);
    }, [value, loading, vigente, onChange]);
    const sinOperaciones = Boolean(colaboradorId) && !loading && !error && items.length === 0;
    return (
        <div className={className}>
            <Select
                label="Operación"
                size="sm"
                isRequired
                isDisabled={disabled || loading || items.length === 0}
                placeholder={loading ? "Consultando…" : "Seleccionar operación"}
                selectedKey={vigente ? String(value) : null}
                items={items}
                onSelectionChange={(key) => onChange(key ? Number(key) : null)}
            >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            {sinOperaciones && (
                <p role="status" className="mt-1 text-xs text-tertiary">
                    {vinculo === "DESCUADRE" ? "Sin operaciones del colaborador en el periodo." : "Ninguna operación incumple las 48 horas a esa fecha."}
                </p>
            )}
        </div>
    );
};
