import { useEffect, useRef, useState } from "react";
import { Image01, Paperclip, Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { TarjetaAdjuntarPopup } from "../evidencias/tarjeta-adjuntar-popup";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { oracionValidacion } from "../shared/compensacion-validacion";
import { hoyLima, mensajeError } from "./auditoria-datos";
import { type OperacionElegible, OperacionesElegirDialog } from "./operaciones-elegir-dialog";

/** Dato propio de un concepto; va entre el DNI y «Adjuntar operación». */
export interface AuditoriaCampo {
    id: string;
    label: string;
    opciones?: { id: string; label: string }[];
    /** Solo dígitos y longitud exacta. */
    digitos?: number;
    type?: "datetime-local";
}
export interface AuditoriaTipo {
    id: string;
    label: string;
    colaborador?: boolean;
    /** Por defecto el DNI es obligatorio. */
    dniOpcional?: boolean;
    clienteRegistrado?: boolean;
    /** Pide el nombre solo si el DNI no está registrado. */
    nombreCliente?: boolean;
    /** Sin definir, el concepto no usa operación. */
    operacion?: "requerida" | "opcional";
    imagen?: boolean;
    notasOpcionales?: boolean;
    campos?: AuditoriaCampo[];
}
export interface AuditoriaValores {
    tipo: string;
    colaborador: number | null;
    dni: string;
    cliente: { id: number; nombre: string } | null;
    nombre: string;
    campos: Record<string, string>;
    operaciones: OperacionElegible[];
    notas: string;
    fecha: string;
    archivo: File | null;
}

const vacio = (tipos: AuditoriaTipo[]): AuditoriaValores => ({
    tipo: tipos.length === 1 ? tipos[0].id : "",
    colaborador: null,
    dni: "",
    cliente: null,
    nombre: "",
    campos: {},
    operaciones: [],
    notas: "",
    fecha: hoyLima(),
    archivo: null,
});

/**
 * Formulario único de registro: Tipo de incidencia, Colaborador, DNI del Cliente, datos del concepto,
 * Adjuntar operación, Notas y Fecha, siempre en ese orden.
 */
export const AuditoriaForm = ({
    tipos,
    colaboradores,
    buscarOperaciones,
    multiple,
    inicial,
    bloqueado,
    archivoBloqueado,
    onGuardar,
    onGuardado,
    onCancelar,
}: {
    tipos: AuditoriaTipo[];
    colaboradores?: { id: number; label: string }[];
    buscarOperaciones?: (dni: string, tipo: string) => Promise<OperacionElegible[]>;
    multiple?: boolean;
    /** Valores de un registro que se está editando. */
    inicial?: Partial<AuditoriaValores>;
    bloqueado?: string;
    archivoBloqueado?: boolean;
    /** Devuelve el aviso de éxito. `clave` se repite al reintentar los mismos datos. */
    onGuardar: (valores: AuditoriaValores, clave: string) => Promise<string>;
    onGuardado: () => void;
    onCancelar?: () => void | Promise<void>;
}) => {
    const notify = useAlert();
    const [valores, setValores] = useState<AuditoriaValores>(() => ({ ...vacio(tipos), ...inicial }));
    const [guardando, setGuardando] = useState(false);
    const [intentado, setIntentado] = useState(false);
    const [ventana, setVentana] = useState<"operaciones" | "imagen" | null>(null);
    const lock = useRef(false);
    const envio = useRef<{ payload: string; clave: string } | null>(null);
    const { result: cliente, isLoading: buscandoCliente } = useClienteLookup(valores.dni);
    const tipo = tipos.find((item) => item.id === valores.tipo);
    const dniCompleto = /^\d{8}$/.test(valores.dni);
    const disabled = guardando || Boolean(bloqueado);
    const conColaborador = tipo ? tipo.colaborador : tipos.some((item) => item.colaborador);
    const conOperacion = tipo ? tipo.operacion : tipos.some((item) => item.operacion);
    const pideNombre = Boolean(tipo?.nombreCliente && dniCompleto && !buscandoCliente && !cliente);

    const set = (patch: Partial<AuditoriaValores>) =>
        setValores((previos) => ({
            ...previos,
            ...patch,
            // Las operaciones pertenecen a un DNI y a un concepto.
            ...(("dni" in patch && patch.dni !== previos.dni) || ("tipo" in patch && patch.tipo !== previos.tipo) ? { operaciones: [] } : {}),
        }));
    useEffect(() => {
        setValores((previos) => ({ ...previos, cliente: cliente ? { id: cliente.id, nombre: cliente.nombre } : null }));
    }, [cliente]);

    const limpiar = () => {
        setIntentado(false);
        setValores(vacio(tipos));
        envio.current = null;
    };
    const problemas = () => {
        const lista: string[] = [];
        if (!tipo) return ["Selecciona el tipo de incidencia."];
        if (tipo.colaborador && !valores.colaborador) lista.push("Selecciona al colaborador.");
        if (!dniCompleto && (!tipo.dniOpcional || valores.dni)) lista.push("Ingresa un DNI de 8 dígitos.");
        else if (tipo.clienteRegistrado && !valores.cliente) lista.push("Ingresa el DNI de un cliente registrado.");
        if (pideNombre && !valores.nombre.trim()) lista.push("Ingresa el nombre del cliente.");
        for (const campo of tipo.campos ?? []) {
            const value = (valores.campos[campo.id] ?? "").trim();
            if (!value || (campo.digitos && value.length !== campo.digitos)) lista.push(`Completa «${campo.label}».`);
        }
        if (tipo.operacion === "requerida" && !valores.operaciones.length) lista.push("Adjunta la operación.");
        if (!tipo.notasOpcionales && valores.notas.trim().length < 5) lista.push("Describe en las notas qué pasó (mínimo 5 caracteres).");
        if (!valores.fecha || valores.fecha > hoyLima()) lista.push("Ingresa una fecha no futura.");
        return lista;
    };
    const guardar = async () => {
        if (lock.current || disabled || buscandoCliente) return;
        setIntentado(true);
        const lista = problemas();
        if (lista.length) return notify("validation", oracionValidacion(lista));
        const payload = JSON.stringify({
            ...valores,
            operaciones: valores.operaciones.map((op) => op.key),
            archivo: valores.archivo && [valores.archivo.name, valores.archivo.size, valores.archivo.lastModified],
        });
        if (envio.current?.payload !== payload) envio.current = { payload, clave: crypto.randomUUID() };
        lock.current = true;
        setGuardando(true);
        try {
            const aviso = await onGuardar(valores, envio.current.clave);
            notify("success", aviso);
            limpiar();
            onGuardado();
        } catch (cause) {
            notify("error", mensajeError(cause, "No fue posible registrar. Intenta nuevamente."));
        } finally {
            lock.current = false;
            setGuardando(false);
        }
    };
    const cancelar = async () => {
        if (lock.current) return;
        try {
            await onCancelar?.();
            limpiar();
        } catch (cause) {
            notify("error", mensajeError(cause));
        }
    };

    return (
        <form
            noValidate
            aria-label="Registrar auditoría"
            onSubmit={(event) => {
                event.preventDefault();
                void guardar();
            }}
        >
            <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                <div className="w-full sm:w-64">
                    <Select
                        label="Tipo de incidencia"
                        placeholder="Seleccionar tipo"
                        size="sm"
                        isRequired
                        isInvalid={intentado && !tipo}
                        isDisabled={disabled}
                        items={tipos.map(({ id, label }) => ({ id, label }))}
                        selectedKey={valores.tipo || null}
                        onSelectionChange={(key) => set({ tipo: String(key ?? ""), campos: {} })}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                </div>
                {conColaborador && (
                    <div className="w-full sm:w-64">
                        <Select
                            label="Colaborador"
                            placeholder="Seleccionar colaborador"
                            size="sm"
                            isRequired
                            isInvalid={intentado && !valores.colaborador}
                            isDisabled={disabled || !colaboradores?.length}
                            items={colaboradores ?? []}
                            selectedKey={valores.colaborador}
                            onSelectionChange={(key) => set({ colaborador: key == null ? null : Number(key) })}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    </div>
                )}
                <div className="w-full sm:w-40 sm:shrink-0">
                    <Input
                        label="DNI del Cliente"
                        size="sm"
                        placeholder="8 dígitos"
                        isRequired={!tipo?.dniOpcional}
                        isInvalid={intentado && !dniCompleto && (!tipo?.dniOpcional || Boolean(valores.dni))}
                        isDisabled={disabled}
                        maxLength={8}
                        inputMode="numeric"
                        value={valores.dni}
                        onChange={(value) => set({ dni: value.replace(/\D/g, "").slice(0, 8), nombre: "" })}
                    />
                </div>
                {pideNombre && (
                    <div className="w-full sm:w-52">
                        <Input
                            label="Nombre del cliente"
                            size="sm"
                            isRequired
                            isDisabled={disabled}
                            maxLength={200}
                            value={valores.nombre}
                            onChange={(nombre) => set({ nombre })}
                        />
                    </div>
                )}
                {tipo?.campos?.map((campo) => (
                    <div key={`${tipo.id}:${campo.id}`} className="w-full sm:w-48">
                        {campo.opciones ? (
                            <Select
                                label={campo.label}
                                placeholder="Seleccionar"
                                size="sm"
                                isRequired
                                isDisabled={disabled}
                                items={campo.opciones}
                                selectedKey={valores.campos[campo.id] || null}
                                onSelectionChange={(key) => set({ campos: { ...valores.campos, [campo.id]: String(key ?? "") } })}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        ) : (
                            <Input
                                label={campo.label}
                                size="sm"
                                type={campo.type}
                                isRequired
                                isDisabled={disabled}
                                maxLength={campo.digitos ?? 250}
                                inputMode={campo.digitos ? "numeric" : undefined}
                                value={valores.campos[campo.id] ?? ""}
                                onChange={(value) =>
                                    set({ campos: { ...valores.campos, [campo.id]: campo.digitos ? value.replace(/\D/g, "").slice(0, campo.digitos) : value } })
                                }
                            />
                        )}
                    </div>
                ))}
                {conOperacion && buscarOperaciones && (
                    <Button
                        type="button"
                        size="sm"
                        color="secondary"
                        iconLeading={Paperclip}
                        isDisabled={disabled || !tipo || !dniCompleto}
                        onClick={() => setVentana("operaciones")}
                    >
                        Adjuntar operación{valores.operaciones.length ? ` (${valores.operaciones.length})` : ""}
                    </Button>
                )}
                {tipo?.imagen && (
                    <Button type="button" size="sm" color="secondary" iconLeading={Image01} isDisabled={disabled} onClick={() => setVentana("imagen")}>
                        Adjuntar imagen{valores.archivo ? " (1)" : ""}
                    </Button>
                )}
                <div className="w-full min-w-0 sm:min-w-60 sm:flex-1">
                    <CompensacionNoteField
                        label="Notas"
                        placeholder="Qué pasó"
                        value={valores.notas}
                        onChange={(notas) => set({ notas })}
                        isDisabled={disabled}
                        isRequired={!tipo?.notasOpcionales}
                    />
                </div>
                <div className="w-full sm:w-40 sm:shrink-0">
                    <CompensacionDatePicker label="Fecha" isRequired isDisabled={disabled} value={valores.fecha} onChange={(fecha) => set({ fecha })} />
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Button type="submit" size="sm" color="primary" iconLeading={Save01} isLoading={guardando} isDisabled={disabled}>
                        Guardar
                    </Button>
                    <Button type="button" size="sm" color="secondary" iconLeading={XClose} isDisabled={guardando} onClick={() => void cancelar()}>
                        Cancelar
                    </Button>
                </div>
            </div>
            {(valores.cliente || valores.operaciones.length > 0 || (dniCompleto && !buscandoCliente && tipo?.clienteRegistrado)) && (
                <p role="status" className="mt-3 text-xs text-tertiary">
                    {valores.cliente ? `Cliente: ${valores.cliente.nombre}` : dniCompleto && tipo?.clienteRegistrado ? "Cliente no encontrado" : ""}
                    {valores.operaciones.length ? ` · Operación: ${valores.operaciones.map((op) => op.codigo).join(", ")}` : ""}
                </p>
            )}
            {bloqueado && (
                <div className="mt-3">
                    <AlertMessage tone="notice">{bloqueado}</AlertMessage>
                </div>
            )}
            {ventana === "operaciones" && buscarOperaciones && (
                <OperacionesElegirDialog
                    dni={valores.dni}
                    multiple={multiple}
                    elegidas={valores.operaciones}
                    buscar={() => buscarOperaciones(valores.dni, valores.tipo)}
                    onAplicar={(operaciones) => set({ operaciones })}
                    onClose={() => setVentana(null)}
                />
            )}
            {ventana === "imagen" && (
                <TarjetaAdjuntarPopup
                    file={valores.archivo}
                    isLocked={archivoBloqueado}
                    onApply={(archivo) => set({ archivo })}
                    onClose={() => setVentana(null)}
                />
            )}
        </form>
    );
};
