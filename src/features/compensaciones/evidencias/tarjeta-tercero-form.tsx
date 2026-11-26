import { useEffect, useRef, useState } from "react";
import { Paperclip, Save01, SearchLg, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { evidenciasService } from "./evidencias.service";
import type { LlamadaContexto } from "./evidencias.types";
import { TarjetaAdjuntarPopup } from "./tarjeta-adjuntar-popup";
import { TarjetaOperacionesPopup } from "./tarjeta-operaciones-popup";
import type { OperacionCliente } from "./tarjeta-operaciones.service";
import { tarjetasEvidenceService } from "./tarjetas-evidence.service";

export const fechaLima = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const TarjetaTerceroForm = ({
    contexto,
    error,
    onSave,
    compact = false,
    onBusyChange,
}: {
    contexto: LlamadaContexto | null;
    error: string;
    onSave: () => void;
    compact?: boolean;
    onBusyChange?: (busy: boolean) => void;
}) => {
    const notify = useAlert();
    const beginRequest = useCompensacionRequestScope();
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [ultimos4, setUltimos4] = useState("");
    const [auditoria, setAuditoria] = useState("SEGURIDAD_TARJETA");
    const { result: cliente, isLoading: buscandoCliente, error: clienteError } = useClienteLookup(dni);
    useEffect(() => {
        if (clienteError) notify("error", "No se pudo verificar el cliente. Ingresa su nombre o reintenta la consulta.");
    }, [clienteError, notify]);
    useEffect(() => {
        if (cliente) setNombre(cliente.nombre);
    }, [cliente]);
    const [fecha, setFecha] = useState(fechaLima);
    const [notas, setNotas] = useState("");
    const [attachmentsOpen, setAttachmentsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const uploaded = useRef<Awaited<ReturnType<typeof tarjetasEvidenceService.uploadCardEvidence>> | null>(null);
    const dniInput = useRef<HTMLInputElement>(null);
    const [operacion, setOperacion] = useState<OperacionCliente | null>(null);
    const [operacionesOpen, setOperacionesOpen] = useState(false);
    const codigo = operacion?.referencia ?? "";
    const [busy, setBusy] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const lock = useRef(false);
    const pending = useRef<{ payload: string; clave: string } | null>(null);
    const blocked =
        error ||
        (!contexto
            ? "Cargando permisos…"
            : !contexto.puedeRegistrar
              ? "No tienes permiso para registrar tarjetas."
              : !contexto.idColaborador
                ? "Tu usuario no tiene un colaborador activo asociado. Solicita que vinculen tu cuenta."
                : "");
    const clear = () => {
        setAttempted(false);
        setDni("");
        setNombre("");
        setUltimos4("");
        setFecha(fechaLima());
        setNotas("");
        setFile(null);
        setOperacion(null);
        setAttachmentsOpen(false);
        setOperacionesOpen(false);
        uploaded.current = null;
        pending.current = null;
        dniInput.current?.focus();
    };
    const cancel = async () => {
        if (lock.current) return;
        if (!uploaded.current) return clear();
        lock.current = true;
        setBusy(true);
        onBusyChange?.(true);
        const isCurrent = beginRequest();
        try {
            await tarjetasEvidenceService.removeCardEvidence(uploaded.current.path);
            if (!isCurrent()) return;
            clear();
        } catch (cause) {
            if (!isCurrent()) return;
            notify("error", cause instanceof Error ? cause.message : "No se pudo quitar el archivo temporal. Reintenta.");
        } finally {
            lock.current = false;
            if (isCurrent()) {
                setBusy(false);
                onBusyChange?.(false);
            }
        }
    };
    const save = async () => {
        if (lock.current || blocked || buscandoCliente) return;
        setAttempted(true);
        const problemasDeCampos1: string[] = [];
        if (!/^\d{8}$/.test(dni)) problemasDeCampos1.push("Ingresa un DNI de 8 dígitos.");
        if (!nombre.trim()) problemasDeCampos1.push("Ingresa el nombre del cliente.");
        if (!/^\d{4}$/.test(ultimos4)) problemasDeCampos1.push("Ingresa los 4 últimos dígitos de la tarjeta.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fechaLima()) problemasDeCampos1.push("Ingresa una fecha de detección válida, no futura.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        const values = [dni, nombre.trim(), fecha, notas.trim(), ultimos4] as const;
        const payload = JSON.stringify([...values, codigo.trim(), file && [file.name, file.size, file.lastModified]]);
        if (pending.current?.payload !== payload) pending.current = { payload, clave: crypto.randomUUID() };
        lock.current = true;
        setBusy(true);
        onBusyChange?.(true);
        const isCurrent = beginRequest();
        try {
            if (file) {
                if (!uploaded.current) uploaded.current = await tarjetasEvidenceService.uploadCardEvidence(file);
                if (!isCurrent()) {
                    await tarjetasEvidenceService.removeCardEvidence(uploaded.current.path);
                    return;
                }
                await evidenciasService.registerCardFile(...values, pending.current.clave, uploaded.current, codigo.trim() || null);
            } else {
                await evidenciasService.registerCard(...values, pending.current.clave, "", codigo.trim() || null);
            }
            if (!isCurrent()) return;
            clear();
            notify("success", "Tarjeta guardada. Pendiente de aprobación.");
            onSave();
        } catch (cause) {
            if (!isCurrent()) return;
            notify(
                "error",
                cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo guardar la tarjeta. Intenta nuevamente.",
            );
        } finally {
            lock.current = false;
            if (isCurrent()) {
                setBusy(false);
                onBusyChange?.(false);
            }
        }
    };
    const disabled = busy || Boolean(blocked);
    return (
        <section className={compact ? "@container w-full min-w-0" : "@container w-full min-w-0 rounded-xl border border-secondary bg-primary p-4 shadow-xs"}>
            {!compact && <h2 className="mb-4 text-xs font-medium text-tertiary">Registrar Auditoria</h2>}
            <form
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                    <Select
                        label="Auditoria"
                        aria-label="Auditoria"
                        className="w-full sm:w-44 sm:shrink-0"
                        size="sm"
                        isDisabled={disabled}
                        selectedKey={auditoria}
                        onSelectionChange={(key) => setAuditoria(String(key ?? "SEGURIDAD_TARJETA"))}
                        items={[{ id: "SEGURIDAD_TARJETA", label: "Seguridad Tarjeta" }]}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Input
                        ref={dniInput}
                        label="Nro. Documento"
                        className="w-full sm:w-36 sm:shrink-0"
                        placeholder="8 dígitos"
                        size="sm"
                        value={dni}
                        maxLength={8}
                        inputMode="numeric"
                        isRequired
                        isInvalid={attempted && !/^\d{8}$/.test(dni)}
                        isDisabled={disabled}
                        onChange={(value) => {
                            setDni(value.replace(/\D/g, "").slice(0, 8));
                            setNombre("");
                        }}
                        isLoading={buscandoCliente}
                    />
                    <Input
                        className="w-full sm:min-w-40 sm:flex-[1.5]"
                        label="Nombre"
                        placeholder="Ingrese el nombre"
                        size="sm"
                        value={nombre}
                        maxLength={200}
                        isRequired
                        isInvalid={attempted && !nombre.trim()}
                        isDisabled={disabled}
                        onChange={setNombre}
                    />
                    <Input
                        className="w-full sm:w-44 sm:shrink-0"
                        label="Nro tarjeta (4 últimos dígitos)"
                        placeholder="0000"
                        size="sm"
                        value={ultimos4}
                        maxLength={4}
                        inputMode="numeric"
                        isRequired
                        isInvalid={attempted && !/^\d{4}$/.test(ultimos4)}
                        isDisabled={disabled}
                        onChange={(value) => setUltimos4(value.replace(/\D/g, "").slice(0, 4))}
                    />
                    <div className="w-full min-w-0 sm:min-w-32 sm:flex-1">
                        <CompensacionNoteField value={notas} onChange={setNotas} isDisabled={disabled} />
                    </div>
                    <div className="flex w-full flex-col gap-1.5 sm:min-w-32 sm:flex-1">
                        <span className="text-sm font-medium text-secondary">Operación</span>
                        <Button
                            type="button"
                            size="sm"
                            color="secondary"
                            iconLeading={SearchLg}
                            className="w-full justify-start"
                            isDisabled={disabled || !/^\d{8}$/.test(dni)}
                            onClick={() => setOperacionesOpen(true)}
                        >
                            {operacion ? (operacion.codigo ?? (operacion.flujo === "PAGO_DEUDA" ? "Pago de deuda" : "Efectivización")) : "Buscar"}
                        </Button>
                    </div>
                    <CompensacionDatePicker
                        className="w-full sm:w-40 sm:shrink-0"
                        label="Fecha"
                        value={fecha}
                        isRequired
                        isDisabled={disabled}
                        onChange={setFecha}
                    />
                    <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 self-end">
                        <Button
                            type="button"
                            size="sm"
                            color="secondary"
                            iconLeading={Paperclip}
                            isDisabled={disabled}
                            onClick={() => setAttachmentsOpen(true)}
                        >
                            Adjuntar{file ? " (1)" : ""}
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            color="primary"
                            iconLeading={Save01}
                            className="shrink-0"
                            isDisabled={Boolean(blocked) || buscandoCliente}
                            isLoading={busy}
                        >
                            Guardar
                        </Button>
                        <Button type="button" size="sm" color="secondary" iconLeading={XClose} isDisabled={busy} onClick={() => void cancel()}>
                            Cancelar
                        </Button>
                    </div>
                </div>
                {blocked && (
                    <div className="mt-3">
                        {error || contexto ? (
                            <AlertMessage tone={error ? "error" : "notice"}>{blocked}</AlertMessage>
                        ) : (
                            <p role="status" className="text-xs text-tertiary">
                                {blocked}
                            </p>
                        )}
                    </div>
                )}
            </form>
            {operacionesOpen && <TarjetaOperacionesPopup documento={dni} value={codigo} onApply={setOperacion} onClose={() => setOperacionesOpen(false)} />}
            {attachmentsOpen && <TarjetaAdjuntarPopup file={file} isLocked={!!uploaded.current} onApply={setFile} onClose={() => setAttachmentsOpen(false)} />}
        </section>
    );
};
