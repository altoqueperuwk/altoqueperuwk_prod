import { CheckCircle, RefreshCw01, Save01, SearchLg, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { CompensacionDialogFooter } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField as CompensacionNotaInput } from "../shared/compensacion-note-field";
import { errores, money, tipos } from "./facturacion-auditoria-constantes";
import type { FacturacionRegistro } from "./facturacion-auditoria.service";
import type { FacturacionAuditoriaControl } from "./use-facturacion-auditoria";

/** Formulario de registro, detalle y revisión de un reporte (opción de origen: aquí se edita). */
export const FacturacionAuditoriaForm = ({ c }: { c: FacturacionAuditoriaControl }) => {
    const { context, form, editing, ops, searching, searched, busy, comment, setComment, change } = c;
    const readOnly = !!editing && editing.estado_evento !== "PENDIENTE";
    const extra = form.tipo === "OPERACION_EXTRA";
    const opItems = ops.map((op) => ({ id: String(op.id), label: `${op.codigo || "Sin código"} · ${money(op.monto)} · ${op.estado}` }));
    const registrationActions = (
        <>
            <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={c.clear}>
                Cancelar
            </Button>
            {!readOnly && (
                <Button size="sm" color="primary" iconLeading={Save01} isDisabled={busy || searching || (!extra && !form.operacion)} onClick={c.save}>
                    {context?.es_admin ? "Guardar Asociación" : "Guardar"}
                </Button>
            )}
        </>
    );
    return (
        <div className="space-y-4">
            <fieldset disabled={busy || readOnly} className="flex min-w-0 flex-wrap items-end gap-3 border-0 p-0">
                <Select
                    label="Tipo de Reporte"
                    size="sm"
                    className="w-56"
                    items={tipos}
                    selectedKey={form.tipo}
                    isDisabled={!!editing || busy}
                    onSelectionChange={(v) => change({ tipo: v as FacturacionRegistro["tipo"], error: v === "OPERACION_EXTRA" ? null : "MONTO" })}
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <Input
                    label="DNI"
                    size="sm"
                    className="w-36"
                    maxLength={8}
                    value={form.dni}
                    isDisabled={!!editing || busy}
                    onChange={(dni) => change({ dni })}
                />
                {!extra && (
                    <Select
                        label="Error Detectado"
                        size="sm"
                        className="w-36"
                        items={errores}
                        selectedKey={form.error}
                        isDisabled={!!editing || busy}
                        onSelectionChange={(v) => change({ error: v as "MONTO" | "CUENTA" })}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                )}
                {extra && (
                    <Input
                        label="Comprobante"
                        size="sm"
                        className="w-56"
                        value={form.codigo}
                        maxLength={200}
                        isDisabled={!!editing || busy}
                        onChange={(codigo) => change({ codigo })}
                    />
                )}
                <div className="min-w-60 flex-1">
                    <CompensacionNotaInput
                        label="Descripción"
                        value={form.descripcion}
                        maxLength={4000}
                        isDisabled={context?.es_admin || busy || readOnly}
                        onChange={(descripcion) => change({ descripcion })}
                    />
                </div>
                {(!extra || editing) && (
                    <>
                        <Button
                            size="sm"
                            color="secondary"
                            iconLeading={SearchLg}
                            isDisabled={busy || searching || readOnly || form.dni.length !== 8}
                            onClick={c.search}
                        >
                            {searching ? "Consultando…" : "Consultar Operaciones"}
                        </Button>
                        <Select
                            label="Operación Real"
                            size="sm"
                            className="min-w-64 flex-1"
                            items={opItems}
                            selectedKey={form.operacion ? String(form.operacion) : null}
                            isDisabled={busy || readOnly || !!editing?.datos.operacion}
                            onSelectionChange={(v) => change({ operacion: v ? Number(v) : null })}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        {searched && (
                            <p role="status" className="w-full text-xs text-tertiary">
                                {ops.length ? `${ops.length} operaciones encontradas (máximo 100).` : "Sin operaciones reales para este DNI."}
                            </p>
                        )}
                    </>
                )}
            </fieldset>
            <p className="text-xs text-tertiary">
                {extra
                    ? "Reporta antes de ingresar la operación. Usa el código que se registrará en Operaciones; al vincular debe coincidir con el comprobante. Valida: Gerencia."
                    : "Reporta el error de pago que detectaste en una operación real. Valida: Gerencia."}
            </p>
            {editing && (
                <div className="space-y-2 text-xs text-secondary">
                    {editing.evidencia[0]?.evidencia && <p>Evidencia inicial: {editing.evidencia[0].evidencia}</p>}
                    <p>
                        Tarifa al registrar:{" "}
                        {editing.criterios_validacion_snapshot.regla_registro?.monto == null
                            ? "No disponible"
                            : money(Number(editing.criterios_validacion_snapshot.regla_registro.monto))}
                    </p>
                    <p>
                        Operación declarada: {editing.datos.operacion?.codigo ?? "Sin vincular"} ·{" "}
                        {editing.datos.operacion?.estado ?? "Pendiente de asociación"}
                    </p>
                    {"operacion_actual" in editing && (
                        <p>Estado actual: {editing.operacion_actual?.estado ?? "Fuente no disponible"}. La declaración inicial se conserva para la revisión.</p>
                    )}
                    {editing.revisiones?.map((r) => (
                        <p key={r.numero_paso}>
                            {r.decision}: {r.comentario ?? "Registro inicial"}
                        </p>
                    ))}
                </div>
            )}
            {editing ? (
                !readOnly && <CompensacionDialogFooter>{registrationActions}</CompensacionDialogFooter>
            ) : (
                <div className="flex flex-wrap justify-end gap-2">{registrationActions}</div>
            )}
            {!context?.es_admin && editing?.estado_evento === "PENDIENTE" && (
                <div className="space-y-3 border-t border-secondary pt-3">
                    <p className="text-xs text-tertiary">Puedes anular tu reporte mientras Gerencia no lo haya decidido. Queda el registro de la anulación.</p>
                    <Input size="sm" label="Motivo de la anulación" value={comment} onChange={setComment} isDisabled={busy} />
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            color="secondary-destructive"
                            iconLeading={XClose}
                            isDisabled={busy || comment.trim().length < 10}
                            onClick={() => void c.annul()}
                        >
                            Anular reporte
                        </Button>
                    </div>
                </div>
            )}
            {context?.es_admin && editing?.estado_evento === "PENDIENTE" && (
                <div className="space-y-3 border-t border-secondary pt-3">
                    <Input size="sm" label="Justificación de Revisión" value={comment} onChange={setComment} isDisabled={busy} />
                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            color="secondary"
                            iconLeading={XClose}
                            isDisabled={busy || comment.trim().length < 10 || !editing.fecha_actualizacion}
                            onClick={() => c.resolve("RECHAZADO")}
                        >
                            Rechazar
                        </Button>
                        <Button
                            size="sm"
                            color="primary"
                            iconLeading={CheckCircle}
                            isDisabled={busy || comment.trim().length < 10 || !editing.fecha_actualizacion || !editing.datos.operacion}
                            onClick={() => c.resolve("APROBADO")}
                        >
                            Aprobar
                        </Button>
                    </div>
                </div>
            )}
            {context?.es_admin && editing?.estado_evento === "APROBADO" && (
                <div className="space-y-3 border-t border-secondary pt-3">
                    <p className="text-xs text-tertiary">
                        Una aprobación no liquidada puede volver a revisión. Los montos consolidados requieren un ajuste autorizado.
                    </p>
                    <Input size="sm" label="Motivo de Revisión" value={comment} onChange={setComment} isDisabled={busy} />
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            color="secondary"
                            iconLeading={RefreshCw01}
                            isDisabled={busy || !comment.trim() || !editing.fecha_actualizacion}
                            onClick={() => void c.reopen()}
                        >
                            Reabrir Revisión
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
