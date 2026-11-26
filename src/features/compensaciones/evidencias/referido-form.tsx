import { useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { useSessionCache } from "@/providers/session-cache-provider";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import type { LlamadaContexto } from "./evidencias.types";
import { referidoError, referidosService } from "./referidos.service";

export const ReferidoForm = ({
    context,
    error,
    onSave,
    compact = false,
    onBusyChange,
}: {
    context: LlamadaContexto | null;
    error: string;
    onSave: () => void;
    compact?: boolean;
    onBusyChange?: (busy: boolean) => void;
}) => {
    const [dni, setDni] = useState("");
    const dniInput = useRef<HTMLInputElement>(null);
    const [nombreManual, setNombreManual] = useState<string | null>(null);
    const [monto, setMonto] = useState("");
    const [banco, setBanco] = useState<string | null>(null);
    const { bancos } = useSessionCache();
    const bankItems = (bancos ?? []).filter((item) => Number(item.id_estado) === 1).map((item) => ({ id: String(item.id), label: String(item.nombre) }));
    const { result: cliente, isLoading: buscandoCliente, error: clienteError } = useClienteLookup(dni);
    const [notas, setNotas] = useState("");
    const nombre = nombreManual ?? (dni.length === 8 ? (cliente?.nombre ?? "") : "");
    const montoBase = Number.isFinite(Number(monto)) && Number(monto) > 0 ? Number(monto) : 0;
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const pending = useRef<{ payload: string; key: string } | null>(null);
    const notify = useAlert();
    const [attempted, setAttempted] = useState(false);
    const beginRequest = useCompensacionRequestScope();
    const clear = () => {
        setAttempted(false);
        setDni("");
        setNombreManual(null);
        setMonto("");
        setBanco(null);
        setNotas("");
        pending.current = null;
        dniInput.current?.focus();
    };
    const blocked =
        error ||
        (!context
            ? "Cargando permisos…"
            : !context.puedeRegistrar
              ? "No tienes permiso para registrar referidos."
              : !context.idColaborador
                ? "Tu usuario no tiene un colaborador activo asociado."
                : "");
    const save = async () => {
        if (lock.current || blocked || buscandoCliente) return;
        setAttempted(true);
        const problemasDeCampos1: string[] = [];
        if (!/^\d{8}$/.test(dni)) problemasDeCampos1.push("Ingresa un DNI de 8 dígitos.");
        if (!nombre.trim()) problemasDeCampos1.push("Ingresa el nombre del referido.");
        if (!montoBase || !/^\d+(\.\d{1,2})?$/.test(monto)) problemasDeCampos1.push("Ingresa un monto mayor a cero, con hasta dos decimales.");
        if (!banco || !bankItems.some((item) => item.id === banco)) problemasDeCampos1.push("Selecciona un banco.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        const declaration = { nombre: nombre.trim(), monto: montoBase, idBanco: Number(banco) };
        const payload = JSON.stringify([dni, notas.trim(), declaration]);
        if (pending.current?.payload !== payload) pending.current = { payload, key: crypto.randomUUID() };
        lock.current = true;
        setBusy(true);
        onBusyChange?.(true);
        const isCurrent = beginRequest();
        try {
            await referidosService.register(dni, notas, pending.current.key, declaration);
            if (!isCurrent()) return;
            clear();
            notify("success", "Referido guardado. Pendiente de validación.");
            onSave();
        } catch (cause) {
            if (!isCurrent()) return;
            notify("error", referidoError(cause));
        } finally {
            lock.current = false;
            if (isCurrent()) {
                setBusy(false);
                onBusyChange?.(false);
            }
        }
    };
    return (
        <section className={compact ? "@container w-full min-w-0" : "@container w-full min-w-0 rounded-xl border border-secondary bg-primary p-4 shadow-xs"}>
            {!compact && <h2 className="mb-4 text-xs font-medium text-tertiary">Registrar Referido</h2>}
            <form
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                    <Input
                        isInvalid={attempted && !/^\d{8}$/.test(dni)}
                        ref={dniInput}
                        label="Nro. Documento"
                        className="w-full sm:w-36 sm:shrink-0"
                        isRequired
                        size="sm"
                        placeholder="8 dígitos"
                        value={dni}
                        inputMode="numeric"
                        maxLength={8}
                        isDisabled={busy || Boolean(blocked)}
                        onChange={(value) => {
                            const next = value.replace(/\D/g, "").slice(0, 8);
                            if (dni.length === 8 && next !== dni) setNombreManual(null);
                            setDni(next);
                        }}
                        hint={clienteError ? "No se pudo verificar el cliente. Reintenta la consulta antes de registrar." : undefined}
                    />
                    <Input
                        isInvalid={attempted && !nombre.trim()}
                        label="Nombre"
                        className="w-full sm:min-w-40 sm:flex-[1.4]"
                        isRequired
                        size="sm"
                        value={nombre}
                        placeholder="Ingrese el nombre"
                        maxLength={250}
                        isDisabled={busy || Boolean(blocked)}
                        onChange={setNombreManual}
                    />
                    <Input
                        isInvalid={attempted && (!montoBase || !/^\d+(\.\d{1,2})?$/.test(monto))}
                        label="Monto"
                        className="w-full sm:w-28"
                        isRequired
                        size="sm"
                        type="number"
                        placeholder="S/ 0.00"
                        value={monto}
                        ref={(input) => {
                            if (input) input.step = "0.01";
                        }}
                        isDisabled={busy || Boolean(blocked)}
                        onChange={setMonto}
                    />
                    <Select
                        isInvalid={attempted && (!banco || !bankItems.some((item) => item.id === banco))}
                        label="Banco"
                        className="w-full sm:w-44 sm:shrink-0 [&[data-invalid]>button]:ring-error"
                        isRequired
                        size="sm"
                        placeholder="Seleccionar banco"
                        items={bankItems}
                        selectedKey={banco}
                        isDisabled={busy || Boolean(blocked)}
                        onSelectionChange={(key) => setBanco(key == null ? null : String(key))}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <div className="w-full min-w-0 sm:min-w-32 sm:flex-1">
                        <CompensacionNoteField
                            label="Notas"
                            placeholder="Escribe una nota"
                            value={notas}
                            maxLength={2000}
                            isDisabled={busy || Boolean(blocked)}
                            onChange={setNotas}
                        />
                    </div>
                    <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
                        <Button type="submit" size="sm" iconLeading={Save01} isLoading={busy} isDisabled={Boolean(blocked) || buscandoCliente}>
                            Guardar
                        </Button>
                        <Button type="button" size="sm" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={clear}>
                            Cancelar
                        </Button>
                    </div>
                </div>
                {blocked && (
                    <div className="mt-3">
                        {context || error ? (
                            <AlertMessage tone={error ? "error" : "notice"}>{blocked}</AlertMessage>
                        ) : (
                            <p role="status" className="text-xs text-tertiary">
                                {blocked}
                            </p>
                        )}
                    </div>
                )}
            </form>
        </section>
    );
};
