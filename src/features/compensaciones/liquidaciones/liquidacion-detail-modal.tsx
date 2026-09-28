import { useEffect, useState } from "react";
import { Check, RefreshCw01, X, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { useToast } from "@/providers/toast-provider";
import { liquidacionesService } from "./liquidaciones.service";
import type { AprobacionLiquidacion, Liquidacion, LiquidacionSimulacion, PagoInfo } from "./liquidaciones.types";

interface Props { item: Liquidacion | null; onClose: () => void; onChanged: () => void; }
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const dateTime = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
const humanize = (value: string) => value.toLocaleLowerCase("es-PE").replaceAll("_", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-PE"));
const color = (value: string): "success" | "warning" | "error" | "brand" | "gray" => ["APROBADA", "PAGADA", "APROBADO"].includes(value) ? "success" : ["CALCULADA", "PAGO_PARCIAL", "OBSERVADA", "OBSERVADO"].includes(value) ? "warning" : ["ANULADA", "RECHAZADO"].includes(value) ? "error" : "brand";
const localDateTime = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

export const LiquidacionDetailModal = ({ item, onClose, onChanged }: Props) => {
    const { addToast } = useToast();
    const [simulation, setSimulation] = useState<LiquidacionSimulacion | null>(null);
    const [approvals, setApprovals] = useState<AprobacionLiquidacion[]>([]);
    const [payments, setPayments] = useState<PagoInfo | null>(null);
    const [comment, setComment] = useState("");
    const [component, setComponent] = useState("TOTAL");
    const [amount, setAmount] = useState("");
    const [paidAt, setPaidAt] = useState(localDateTime);
    const [reference, setReference] = useState("");
    const [method, setMethod] = useState("TRANSFERENCIA");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!item) return;
        setComment(""); setComponent("TOTAL"); setAmount(""); setPaidAt(localDateTime()); setReference(""); setSimulation(null); setApprovals([]); setPayments(null); setIsLoading(true);
        Promise.allSettled([liquidacionesService.simulate(item.idPeriodo, item.idColaborador), liquidacionesService.getApprovals(item.id), liquidacionesService.getPayments(item.id)]).then(([sim, history, pay]) => {
            if (sim.status === "fulfilled") setSimulation(sim.value);
            if (history.status === "fulfilled") setApprovals(history.value);
            if (pay.status === "fulfilled") {
                setPayments(pay.value);
                const initialComponent = pay.value.resumen.modalidad === "COMPONENTES"
                    ? pay.value.resumen.saldoSueldo > 0 ? "SUELDO" : "COMISIONES"
                    : "TOTAL";
                setComponent(initialComponent);
                setAmount(String(initialComponent === "SUELDO" ? pay.value.resumen.saldoSueldo : initialComponent === "COMISIONES" ? pay.value.resumen.saldoComisiones : pay.value.resumen.saldoTotal));
            }
        }).finally(() => setIsLoading(false));
    }, [item]);

    const execute = async (action: "APPROVE" | "OBSERVE" | "REJECT" | "REOPEN" | "RECALCULATE" | "PAY") => {
        if (!item) return;
        if (["OBSERVE", "REJECT", "REOPEN"].includes(action) && !comment.trim()) return addToast("error", "Ingresa el motivo de la decisión");
        if (action === "PAY" && (!amount || Number(amount) <= 0 || !reference.trim() || !paidAt)) return addToast("error", "Monto, fecha y referencia son obligatorios para el pago");
        setIsSaving(true);
        try {
            if (action === "APPROVE") await liquidacionesService.approve(item.id, comment);
            if (action === "OBSERVE") await liquidacionesService.observe(item.id, comment);
            if (action === "REJECT") await liquidacionesService.reject(item.id, comment);
            if (action === "REOPEN") await liquidacionesService.reopen(item.id, comment);
            if (action === "RECALCULATE") await liquidacionesService.calculate(item.idPeriodo, item.idColaborador, comment);
            if (action === "PAY") await liquidacionesService.pay({ liquidationId: item.id, component, amount: Number(amount), paidAt, reference, method, observation: comment });
            addToast("success", action === "PAY" ? "Pago registrado correctamente" : "Liquidación actualizada correctamente"); onChanged();
        } catch (error) { addToast("error", error instanceof Error ? error.message : "No fue posible actualizar la liquidación"); }
        finally { setIsSaving(false); }
    };
    const details = simulation?.detalles.length ? simulation.detalles : item?.detalles ?? [];
    const canPay = item && ["APROBADA", "PAGO_PARCIAL"].includes(item.estado) && (payments?.resumen.saldoTotal ?? item.totalPagar - item.totalPagado) > 0;
    const paymentComponents = payments?.resumen.modalidad === "TOTAL"
        ? [{ id: "TOTAL", label: "Total" }]
        : payments?.resumen.modalidad === "COMPONENTES"
            ? [{ id: "SUELDO", label: "Sueldo" }, { id: "COMISIONES", label: "Comisiones y bonos" }]
            : [{ id: "TOTAL", label: "Total" }, { id: "SUELDO", label: "Sueldo" }, { id: "COMISIONES", label: "Comisiones y bonos" }];
    const changeComponent = (value: string) => {
        setComponent(value);
        if (!payments) return;
        setAmount(String(value === "SUELDO" ? payments.resumen.saldoSueldo : value === "COMISIONES" ? payments.resumen.saldoComisiones : payments.resumen.saldoTotal));
    };

    return <AnimatePresence>{item && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]" onClick={onClose} /><motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.18 }} className="relative z-10 flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
        <div className="flex items-start justify-between border-b border-secondary px-6 py-5"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-primary">{item.colaboradorNombre}</h2><Badge size="sm" color={color(item.estado)}>{humanize(item.estado)}</Badge></div><p className="mt-1 text-sm text-tertiary">{item.colaboradorDocumento} · {item.periodoNombre} · cálculo #{item.numeroCalculo}</p></div><Button size="xs" color="tertiary" iconLeading={X} aria-label="Cerrar" onClick={onClose} /></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[{ label: "Sueldo", value: item.totalSueldo }, { label: "Bonos", value: item.totalBonos }, { label: "Comisiones", value: item.totalComisiones }, { label: "Descuentos", value: -item.totalDescuentos }, { label: "Total", value: item.totalPagar }, { label: "Pagado", value: item.totalPagado }].map((metric) => <div key={metric.label} className="rounded-lg border border-secondary bg-secondary p-3"><p className="text-xs text-tertiary">{metric.label}</p><p className={`mt-1 text-sm font-semibold ${metric.value < 0 ? "text-error-primary" : "text-primary"}`}>{money.format(metric.value)}</p></div>)}</div>
            {simulation && !simulation.puedeCalcular && <div className="rounded-lg border border-error bg-error-secondary p-4"><p className="text-sm font-semibold text-error-primary">La simulación actual tiene bloqueos</p><ul className="mt-2 space-y-1 text-sm text-tertiary">{simulation.bloqueos.map((block, index) => <li key={`${block.codigo}-${index}`}>• {block.mensaje}</li>)}</ul></div>}
            <div><h3 className="text-sm font-semibold text-primary">Detalle de conceptos ({details.length})</h3><div className="mt-2 overflow-x-auto rounded-lg border border-secondary"><table className="w-full text-left text-sm"><thead className="border-b border-secondary bg-secondary"><tr>{["Concepto", "Origen", "Cálculo", "Importe"].map((header) => <th key={header} className="px-3 py-2 text-xs font-medium text-tertiary">{header}</th>)}</tr></thead><tbody className="divide-y divide-secondary">{details.map((detail, index) => <tr key={`${detail.id}-${index}`}><td className="px-3 py-2"><p className="font-medium text-primary">{detail.conceptoNombre}</p><p className="text-xs text-tertiary">{humanize(detail.categoria)} · {humanize(detail.naturaleza)}</p></td><td className="px-3 py-2 text-secondary">{humanize(detail.tipoOrigen)}</td><td className="px-3 py-2 text-secondary">{detail.cantidad} × {money.format(detail.tarifa)}</td><td className={`px-3 py-2 font-semibold ${detail.naturaleza === "DESCUENTO" ? "text-error-primary" : "text-success-primary"}`}>{money.format(detail.importe)}</td></tr>)}</tbody></table></div></div>
            {approvals.length > 0 && <div><h3 className="text-sm font-semibold text-primary">Historial de aprobación</h3><div className="mt-2 space-y-2">{approvals.map((approval) => <div key={approval.id} className="flex gap-3 rounded-lg border border-secondary p-3"><Badge size="sm" color={color(approval.decision)}>{humanize(approval.decision)}</Badge><div><p className="text-sm font-medium text-primary">{approval.usuario}</p><p className="mt-0.5 text-xs text-tertiary">{approval.fecha ? dateTime.format(new Date(approval.fecha)) : ""}{approval.comentario ? ` · ${approval.comentario}` : ""}</p></div></div>)}</div></div>}
            {payments && payments.movimientos.length > 0 && <div><h3 className="text-sm font-semibold text-primary">Movimientos de pago</h3><div className="mt-2 space-y-2">{payments.movimientos.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-lg border border-secondary p-3"><div><p className="text-sm font-medium text-primary">{humanize(payment.componente)} · {payment.referencia}</p><p className="text-xs text-tertiary">{dateTime.format(new Date(payment.fechaPago))} · {payment.usuario}</p></div><p className={`font-semibold ${payment.tipoMovimiento === "REVERSA" ? "text-error-primary" : "text-success-primary"}`}>{payment.tipoMovimiento === "REVERSA" ? "−" : ""}{money.format(payment.monto)}</p></div>)}</div></div>}
            {canPay && <section className="rounded-lg border border-secondary bg-secondary p-4"><h3 className="text-sm font-semibold text-primary">Registrar pago</h3><p className="mt-1 text-xs text-tertiary">Saldo total: {money.format(payments?.resumen.saldoTotal ?? item.totalPagar - item.totalPagado)}</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Select label="Componente" size="sm" items={paymentComponents} selectedKey={component} onSelectionChange={(key) => key !== null && changeComponent(String(key))}>{(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}</Select><Input label="Monto" size="sm" type="number" value={amount} onChange={setAmount} /><Input label="Fecha de pago" size="sm" type="datetime-local" value={paidAt} onChange={setPaidAt} /><Input label="Referencia" size="sm" value={reference} onChange={setReference} /><Input label="Medio de pago" size="sm" value={method} onChange={setMethod} /></div></section>}
            {(["CALCULADA", "OBSERVADA", "APROBADA"].includes(item.estado) || canPay) && <TextArea label="Comentario u observación" size="sm" rows={3} value={comment} onChange={setComment} />}
            {isLoading && <p className="text-sm text-tertiary">Cargando simulación, aprobaciones y pagos...</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-secondary px-6 py-4"><Button size="sm" color="secondary" onClick={onClose}>Cerrar</Button>{item.estado === "OBSERVADA" && <Button size="sm" color="primary" iconLeading={RefreshCw01} isLoading={isSaving} onClick={() => void execute("RECALCULATE")}>Recalcular</Button>}{item.estado === "CALCULADA" && <><Button size="sm" color="secondary" isLoading={isSaving} onClick={() => void execute("OBSERVE")}>Observar</Button><Button size="sm" color="secondary-destructive" iconLeading={XClose} isLoading={isSaving} onClick={() => void execute("REJECT")}>Rechazar</Button><Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void execute("APPROVE")}>Aprobar</Button></>}{item.estado === "APROBADA" && item.totalPagado === 0 && <Button size="sm" color="secondary" isLoading={isSaving} onClick={() => void execute("REOPEN")}>Reabrir revisión</Button>}{canPay && <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={() => void execute("PAY")}>Registrar pago</Button>}</div>
    </motion.div></div>}</AnimatePresence>;
};
