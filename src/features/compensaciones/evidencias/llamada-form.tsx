import { useEffect, useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { evidenciasService } from "./evidencias.service";
import type { LlamadaContexto } from "./evidencias.types";
import { LlamadasPanel } from "./llamadas-panel";

export const LlamadaForm = ({
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
    const [attempted, setAttempted] = useState(false);
    const beginRequest = useCompensacionRequestScope();
    const [dni, setDni] = useState("");
    const [nombre, setNombre] = useState("");
    const [celular, setCelular] = useState("");
    const dniInput = useRef<HTMLInputElement>(null);
    const { result: cliente, isLoading: buscandoCliente, error: clienteError } = useClienteLookup(dni);
    useEffect(() => {
        if (cliente) {
            setNombre(cliente.nombre);
            setCelular(cliente.celular[0] ?? "");
        }
    }, [cliente]);
    const [busy, setBusy] = useState(false);
    const saving = useRef(false);
    const [colaborador, setColaborador] = useState<number | null>(null);
    const pending = useRef<{ dni: string; nombre: string; celular: string; clave: string; colaborador: number | null } | null>(null);
    const selected = colaborador ?? contexto?.idColaborador ?? null;
    const missingOwnProfile =
        "Para recibir el bono a tu nombre, vincula tu usuario con una ficha de colaborador activa. También puedes asignar esta llamada a otro colaborador.";
    const blocked =
        error ||
        (!contexto
            ? "Cargando permisos…"
            : !contexto.puedeRegistrar
              ? "No tienes permiso para registrar llamadas."
              : !contexto.idColaborador && !contexto.puedeElegirColaborador
                ? "Tu usuario no tiene un colaborador activo asociado. Solicita que vinculen tu cuenta."
                : "");

    const save = async () => {
        if (saving.current || blocked || buscandoCliente) return;
        setAttempted(true);
        const problemasDeCampos1: string[] = [];
        if (!/^\d{8}$/.test(dni)) problemasDeCampos1.push("Ingresa un DNI de 8 dígitos.");
        if (!nombre.trim()) problemasDeCampos1.push("Ingresa el nombre del cliente.");
        if (celular && !/^\d{7,15}$/.test(celular)) problemasDeCampos1.push("Ingresa un celular de 7 a 15 dígitos o déjalo vacío.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        if (!selected) return notify("error", missingOwnProfile);

        const values = { dni, nombre: nombre.trim(), celular, colaborador: selected };
        if (
            !pending.current ||
            pending.current.dni !== values.dni ||
            pending.current.nombre !== values.nombre ||
            pending.current.celular !== values.celular ||
            pending.current.colaborador !== values.colaborador
        )
            pending.current = { ...values, clave: crypto.randomUUID() };
        saving.current = true;
        setBusy(true);
        onBusyChange?.(true);
        const isCurrent = beginRequest();
        try {
            if (contexto?.puedeElegirColaborador && colaborador !== null)
                await evidenciasService.registerCall(values.dni, values.nombre, pending.current.clave, colaborador, celular || null);
            else await evidenciasService.registerCall(values.dni, values.nombre, pending.current.clave, undefined, celular || null);
            if (!isCurrent()) return;
            setAttempted(false);
            setDni("");
            setNombre("");
            setCelular("");
            pending.current = null;
            notify("success", "Llamada guardada. Pendiente de aprobación.");
            onSave();
            dniInput.current?.focus();
        } catch (cause) {
            if (!isCurrent()) return;
            const message =
                cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo guardar la llamada. Intenta nuevamente.";
            notify("error", message);
        } finally {
            saving.current = false;
            if (isCurrent()) {
                setBusy(false);
                onBusyChange?.(false);
            }
        }
    };

    const form = (
        <div className="@container w-full min-w-0">
            <form
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                    {contexto?.puedeElegirColaborador && (
                        <div className="w-full min-w-0 sm:min-w-56 sm:flex-1">
                            <Select
                                label="Colaborador"
                                size="sm"
                                selectedKey={colaborador === null ? "self" : String(colaborador)}
                                isDisabled={busy || Boolean(blocked)}
                                items={[
                                    { id: "self", label: "Para mí" },
                                    ...(contexto.colaboradores ?? [])
                                        .filter((c) => c.id !== contexto.idColaborador)
                                        .map((c) => ({ id: String(c.id), label: `${c.nombre} · ${c.sede}` })),
                                ]}
                                onSelectionChange={(key) => setColaborador(Number(key) || null)}
                            >
                                {(i) => <Select.Item id={i.id}>{i.label}</Select.Item>}
                            </Select>
                            {!selected && (
                                <p role="status" className="mt-2 text-xs text-secondary">
                                    {missingOwnProfile}
                                </p>
                            )}
                        </div>
                    )}

                    <Input
                        isInvalid={attempted && !/^\d{8}$/.test(dni)}
                        ref={dniInput}
                        label="Nro. Documento"
                        isRequired
                        className="w-full sm:w-36 sm:shrink-0"
                        placeholder="8 dígitos"
                        size="sm"
                        value={dni}
                        maxLength={8}
                        inputMode="numeric"
                        isDisabled={busy || Boolean(blocked)}
                        onChange={(value) => {
                            setDni(value.replace(/\D/g, "").slice(0, 8));
                            setNombre("");
                            setCelular("");
                        }}
                    />
                    <Input
                        isInvalid={attempted && !nombre.trim()}
                        label="Nombre"
                        isRequired
                        className="w-full sm:min-w-56 sm:flex-1"
                        placeholder="Nombre del cliente"
                        size="sm"
                        value={nombre}
                        maxLength={200}
                        isDisabled={busy || Boolean(blocked)}
                        onChange={setNombre}
                    />
                    <Input
                        isInvalid={attempted && Boolean(celular) && !/^\d{7,15}$/.test(celular)}
                        label="Celular"
                        className="w-full sm:min-w-40 sm:flex-1"
                        placeholder="Opcional"
                        size="sm"
                        inputMode="tel"
                        value={celular}
                        maxLength={15}
                        isDisabled={busy || Boolean(blocked)}
                        onChange={(value) => setCelular(value.replace(/\D/g, "").slice(0, 15))}
                    />
                    <div className="ml-auto flex max-w-full flex-wrap justify-end gap-2">
                        <Button type="submit" size="sm" color="primary" iconLeading={Save01} isDisabled={Boolean(blocked) || buscandoCliente} isLoading={busy}>
                            Guardar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            color="secondary"
                            iconLeading={XClose}
                            isDisabled={busy}
                            onClick={() => {
                                setAttempted(false);
                                setDni("");
                                setNombre("");
                                setCelular("");
                                pending.current = null;
                                dniInput.current?.focus();
                            }}
                        >
                            Cancelar
                        </Button>
                    </div>
                </div>
                {!blocked && (buscandoCliente || clienteError || dni.length === 8) && (
                    <p role="status" className="mt-2 text-xs text-tertiary">
                        {buscandoCliente
                            ? "Buscando cliente…"
                            : clienteError || (cliente ? "Cliente encontrado" : "Cliente nuevo: completa su nombre; el celular es opcional.")}
                    </p>
                )}
                {blocked &&
                    (error || contexto ? (
                        <div className="mt-3">
                            <AlertMessage tone={error ? "error" : "notice"}>{blocked}</AlertMessage>
                        </div>
                    ) : (
                        <p role="status" className="mt-3 text-sm text-secondary">
                            {blocked}
                        </p>
                    ))}
            </form>
        </div>
    );
    return compact ? form : <LlamadasPanel title="Registrar Llamada">{form}</LlamadasPanel>;
};
