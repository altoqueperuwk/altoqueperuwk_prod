import { useCallback, useEffect, useState } from "react";
import { Check, Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { bonosMesService } from "./bonos-mes.service";
import type { ColaboradorBonosMes, DescuentoValues, TipoDescuento, TipoOrigenDescuento } from "./bonos-mes.types";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const origenLabel: Record<TipoOrigenDescuento, string> = { ERROR_CUADRO: "Error en cuadro de comisiones", TOLERANCIA_CERO_DIGITAL: "Tolerancia Cero Digital" };
const tipoLabel: Record<TipoDescuento, string> = { BLOQUE_30: "Bloque 30%", BLOQUE_60: "Bloque 60%", BLOQUE_90: "Bloque 90%", TOTAL: "Total 100%" };
const tiposPorOrigen = (origen: TipoOrigenDescuento): TipoDescuento[] =>
    origen === "TOLERANCIA_CERO_DIGITAL" ? ["TOTAL"] : ["BLOQUE_30", "BLOQUE_60", "BLOQUE_90", "TOTAL"];
const mensajeError = (error: unknown) =>
    error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown })?.message === "string"
          ? String((error as { message: string }).message)
          : "No fue posible completar la acción";

export const ColaboradorBonosModal = ({
    idPeriodo,
    idColaborador,
    confirmado,
    onClose,
    onChanged,
}: {
    idPeriodo: number;
    idColaborador: number;
    confirmado: boolean;
    onClose: () => void;
    onChanged: () => void;
}) => {
    const notify = useAlert();
    const [item, setItem] = useState<ColaboradorBonosMes | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [origen, setOrigen] = useState<TipoOrigenDescuento>("ERROR_CUADRO");
    const [tipo, setTipo] = useState<TipoDescuento>("BLOQUE_30");
    const [motivo, setMotivo] = useState("");
    const [anulando, setAnulando] = useState<{ id: number; motivo: string } | null>(null);
    const [cumple, setCumple] = useState<"SI" | "NO">("SI");
    const [nota, setNota] = useState("");
    const [cumpleMeta, setCumpleMeta] = useState<"SI" | "NO" | "PENDIENTE">("PENDIENTE");
    const [notaMeta, setNotaMeta] = useState("");

    const cargar = useCallback(async () => {
        setError("");
        try {
            const data = await bonosMesService.getDetalle(idPeriodo, idColaborador);
            setItem(data);
            const condicion = data.condiciones.find((entry) => entry.codigoCondicion === "PUNTUALIDAD");
            setCumple(condicion && !condicion.cumple ? "NO" : "SI");
            setNota(condicion?.nota ?? "");
            const meta = data.condiciones.find((entry) => entry.codigoCondicion === "META_AREA_15_DIAS");
            setCumpleMeta(meta ? (meta.cumple ? "SI" : "NO") : "PENDIENTE");
            setNotaMeta(meta?.nota ?? "");
        } catch (cause) {
            setError(mensajeError(cause));
        }
    }, [idPeriodo, idColaborador]);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const aplicaMeta =
        item !== null &&
        (item.bloqueos.some((entry) => entry.codigo === "META_POBLACION_PENDIENTE") ||
            item.condiciones.some((entry) => entry.codigoCondicion === "META_AREA_15_DIAS") ||
            item.lineas.some((entry) => /meta de [aá]rea/i.test(entry.concepto)));

    const ejecutar = async (accion: () => Promise<void>, exito: string) => {
        if (busy) return;
        setBusy(true);
        try {
            await accion();
            notify("success", exito);
            onChanged();
            await cargar();
        } catch (cause) {
            notify("error", mensajeError(cause));
        } finally {
            setBusy(false);
        }
    };

    const aplicar = () => {
        if (motivo.trim().length < 5) return notify("validation", "Escribe el motivo del descuento");
        const values: DescuentoValues = { tipoOrigen: origen, tipo, motivo };
        void ejecutar(async () => {
            await bonosMesService.aplicarDescuento(idPeriodo, idColaborador, values);
            setMotivo("");
        }, "Descuento aplicado");
    };

    const activos = item?.descuentos.filter((entry) => entry.estado === "ACTIVO") ?? [];
    const sinTotal = !activos.some((entry) => entry.tipo === "TOTAL");
    const lineas = item?.lineas ?? [];

    return (
        <CompensacionSurface title="Bonos del colaborador" busy={busy} onClose={onClose}>
            <div className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-xl bg-primary shadow-xl">
                <CompensacionDialogHeader title={item?.nombre ?? "Bonos del colaborador"} busy={busy} onClose={onClose}>
                    {item ? [item.documento, item.cargo, item.sucursal].filter(Boolean).join(" · ") : "Cargando…"}
                </CompensacionDialogHeader>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                    {error && <AlertMessage tone="error">{error}</AlertMessage>}
                    {item && (
                        <>
                            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[
                                    { label: "Bonos", value: item.totalBonos, tone: "text-success-primary" },
                                    { label: "Comisiones", value: item.totalComisiones, tone: "text-success-primary" },
                                    { label: "Penalidades", value: item.totalDescuentos, tone: "text-error-primary" },
                                    { label: "Total a reportar", value: item.totalNeto, tone: "text-primary" },
                                ].map((row) => (
                                    <div key={row.label} className="rounded-lg border border-secondary p-3">
                                        <dt className="text-xs text-tertiary">{row.label}</dt>
                                        <dd className={`text-sm font-semibold tabular-nums ${row.tone}`}>{money.format(row.value)}</dd>
                                    </div>
                                ))}
                            </dl>
                            {item.bloqueos.map((bloqueo, index) => (
                                <AlertMessage key={`${bloqueo.codigo}-${index}`} tone="notice">
                                    {bloqueo.mensaje}
                                </AlertMessage>
                            ))}
                            <section>
                                <h3 className="mb-2 text-xs font-medium text-tertiary">Detalle por concepto</h3>
                                {lineas.length === 0 ? (
                                    <p className="text-sm text-tertiary">Sin bonos ni penalidades en este mes.</p>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border border-secondary">
                                        <table className="w-full text-xs">
                                            <thead className="bg-secondary text-tertiary">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-medium">Concepto</th>
                                                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                                                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                                                    <th className="px-3 py-2 text-right font-medium">Importe</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary">
                                                {lineas.map((linea) => (
                                                    <tr key={linea.clave}>
                                                        <td className="px-3 py-2 text-primary">{linea.concepto}</td>
                                                        <td className="px-3 py-2 text-tertiary">
                                                            {linea.naturaleza === "DESCUENTO"
                                                                ? "Penalidad"
                                                                : linea.categoria === "COMISION"
                                                                  ? "Comisión"
                                                                  : "Bono"}
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums">{linea.cantidad}</td>
                                                        <td
                                                            className={`px-3 py-2 text-right font-medium tabular-nums ${linea.naturaleza === "DESCUENTO" ? "text-error-primary" : "text-success-primary"}`}
                                                        >
                                                            {linea.naturaleza === "DESCUENTO" ? "−" : ""}
                                                            {money.format(linea.importe)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                            <section>
                                <h3 className="mb-2 text-xs font-medium text-tertiary">Descuentos aplicados por Administración</h3>
                                {item.descuentos.length === 0 && <p className="text-sm text-tertiary">Ninguno en este mes.</p>}
                                <ul className="space-y-2">
                                    {item.descuentos.map((descuento) => (
                                        <li key={descuento.id} className="rounded-lg border border-secondary p-3 text-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-medium text-primary">
                                                    {origenLabel[descuento.tipoOrigen]} · {tipoLabel[descuento.tipo]}
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <StatusBadge tone={descuento.estado === "ACTIVO" ? "success" : "gray"}>
                                                        {descuento.estado === "ACTIVO" ? "Activo" : "Anulado"}
                                                    </StatusBadge>
                                                    <span className="font-semibold text-error-primary tabular-nums">
                                                        −{money.format(descuento.importeDescuento)}
                                                    </span>
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-tertiary">{descuento.motivo}</p>
                                            {descuento.motivoAnulacion && <p className="mt-1 text-xs text-tertiary">Anulado: {descuento.motivoAnulacion}</p>}
                                            {descuento.estado === "ACTIVO" && !confirmado && (
                                                <div className="mt-2">
                                                    {anulando?.id === descuento.id ? (
                                                        <div className="space-y-2">
                                                            <TextArea
                                                                aria-label="Motivo de anulación"
                                                                size="sm"
                                                                rows={2}
                                                                placeholder="Motivo de la anulación"
                                                                value={anulando.motivo}
                                                                onChange={(value) => setAnulando({ id: descuento.id, motivo: value })}
                                                            />
                                                            <div className="flex justify-end gap-2">
                                                                <Button size="sm" color="secondary" isDisabled={busy} onClick={() => setAnulando(null)}>
                                                                    Cancelar
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    color="primary-destructive"
                                                                    isDisabled={busy || anulando.motivo.trim().length < 5}
                                                                    onClick={() =>
                                                                        void ejecutar(async () => {
                                                                            await bonosMesService.anularDescuento(descuento.id, anulando.motivo);
                                                                            setAnulando(null);
                                                                        }, "Descuento anulado")
                                                                    }
                                                                >
                                                                    Anular descuento
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            color="link-destructive"
                                                            isDisabled={busy}
                                                            onClick={() => setAnulando({ id: descuento.id, motivo: "" })}
                                                        >
                                                            Anular
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                            {confirmado ? (
                                <AlertMessage tone="notice">El reporte del mes está confirmado. Reábrelo para cambiar descuentos o condiciones.</AlertMessage>
                            ) : (
                                <>
                                    <section className="rounded-lg border border-secondary p-3">
                                        <h3 className="mb-1 text-xs font-medium text-tertiary">Aplicar descuento</h3>
                                        <p className="mb-3 text-xs text-tertiary">
                                            Se calcula sobre las comisiones del mes ({money.format(item.totalComisiones)}). El total prevalece sobre los
                                            bloques.
                                        </p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <Select
                                                label="Origen"
                                                size="sm"
                                                isDisabled={busy}
                                                items={(Object.keys(origenLabel) as TipoOrigenDescuento[]).map((id) => ({ id, label: origenLabel[id] }))}
                                                selectedKey={origen}
                                                onSelectionChange={(key) => {
                                                    const next = key as TipoOrigenDescuento;
                                                    setOrigen(next);
                                                    if (!tiposPorOrigen(next).includes(tipo)) setTipo("TOTAL");
                                                }}
                                            >
                                                {(entry) => <Select.Item id={entry.id}>{entry.label}</Select.Item>}
                                            </Select>
                                            <Select
                                                label="Descuento"
                                                size="sm"
                                                isDisabled={busy}
                                                items={tiposPorOrigen(origen).map((id) => ({ id, label: tipoLabel[id] }))}
                                                selectedKey={tipo}
                                                onSelectionChange={(key) => setTipo(key as TipoDescuento)}
                                            >
                                                {(entry) => <Select.Item id={entry.id}>{entry.label}</Select.Item>}
                                            </Select>
                                        </div>
                                        <div className="mt-3">
                                            <TextArea
                                                label="Motivo"
                                                size="sm"
                                                rows={2}
                                                isRequired
                                                isDisabled={busy}
                                                value={motivo}
                                                onChange={setMotivo}
                                                placeholder="Qué ocurrió y por qué corresponde el descuento"
                                            />
                                        </div>
                                        {!sinTotal && tipo !== "TOTAL" && (
                                            <p className="mt-2 text-xs text-warning-primary">
                                                Hay un descuento total activo: anúlalo antes de aplicar un bloque.
                                            </p>
                                        )}
                                        <div className="mt-3 flex justify-end">
                                            <Button size="sm" color="primary" iconLeading={Check} isDisabled={busy} isLoading={busy} onClick={aplicar}>
                                                Aplicar descuento
                                            </Button>
                                        </div>
                                    </section>
                                    <section className="rounded-lg border border-secondary p-3">
                                        <h3 className="mb-1 text-xs font-medium text-tertiary">Puntualidad del mes</h3>
                                        <p className="mb-3 text-xs text-tertiary">
                                            Confírmala con la asistencia del legacy. Si no la cumplió, se descuentan Uniforme e Indisciplina.
                                        </p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <Select
                                                label="¿Cumplió puntualidad?"
                                                size="sm"
                                                isDisabled={busy}
                                                items={[
                                                    { id: "SI", label: "Sí cumplió" },
                                                    { id: "NO", label: "No cumplió" },
                                                ]}
                                                selectedKey={cumple}
                                                onSelectionChange={(key) => setCumple(key as "SI" | "NO")}
                                            >
                                                {(entry) => <Select.Item id={entry.id}>{entry.label}</Select.Item>}
                                            </Select>
                                            <TextArea
                                                label="Nota"
                                                size="sm"
                                                rows={2}
                                                isDisabled={busy}
                                                value={nota}
                                                onChange={setNota}
                                                placeholder="Opcional"
                                            />
                                        </div>
                                        <div className="mt-3 flex justify-end">
                                            <Button
                                                size="sm"
                                                color="secondary"
                                                iconLeading={Save01}
                                                isDisabled={busy}
                                                onClick={() =>
                                                    void ejecutar(
                                                        () => bonosMesService.marcarCondicion(idPeriodo, idColaborador, "PUNTUALIDAD", cumple === "SI", nota),
                                                        "Puntualidad guardada",
                                                    )
                                                }
                                            >
                                                Guardar puntualidad
                                            </Button>
                                        </div>
                                    </section>
                                    {aplicaMeta && (
                                        <section className="rounded-lg border border-secondary p-3">
                                            <h3 className="mb-1 text-xs font-medium text-tertiary">Meta de Área: 15 días trabajados</h3>
                                            <p className="mb-3 text-xs text-tertiary">
                                                Confirma si el colaborador trabajó al menos 15 días del mes. Quien no los cumple no recibe parte de la bolsa.
                                            </p>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <Select
                                                    label="¿Trabajó 15 días o más?"
                                                    size="sm"
                                                    isDisabled={busy}
                                                    items={[
                                                        { id: "PENDIENTE", label: "Pendiente de confirmar" },
                                                        { id: "SI", label: "Sí cumplió" },
                                                        { id: "NO", label: "No cumplió" },
                                                    ]}
                                                    selectedKey={cumpleMeta}
                                                    onSelectionChange={(key) => setCumpleMeta(key as "SI" | "NO" | "PENDIENTE")}
                                                >
                                                    {(entry) => <Select.Item id={entry.id}>{entry.label}</Select.Item>}
                                                </Select>
                                                <TextArea
                                                    label="Nota"
                                                    size="sm"
                                                    rows={2}
                                                    isDisabled={busy}
                                                    value={notaMeta}
                                                    onChange={setNotaMeta}
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                            <div className="mt-3 flex justify-end">
                                                <Button
                                                    size="sm"
                                                    color="secondary"
                                                    iconLeading={Save01}
                                                    isDisabled={busy || cumpleMeta === "PENDIENTE"}
                                                    onClick={() =>
                                                        void ejecutar(
                                                            () =>
                                                                bonosMesService.marcarCondicion(
                                                                    idPeriodo,
                                                                    idColaborador,
                                                                    "META_AREA_15_DIAS",
                                                                    cumpleMeta === "SI",
                                                                    notaMeta,
                                                                ),
                                                            "Meta de Área guardada",
                                                        )
                                                    }
                                                >
                                                    Guardar Meta de Área
                                                </Button>
                                            </div>
                                        </section>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
                <CompensacionDialogFooter>
                    <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={onClose}>
                        Cerrar
                    </Button>
                </CompensacionDialogFooter>
            </div>
        </CompensacionSurface>
    );
};
