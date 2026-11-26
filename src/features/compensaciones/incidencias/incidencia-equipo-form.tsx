import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { StatusBadge } from "@/components/shared/status-badge";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { oracionValidacion } from "../shared/compensacion-validacion";
import { type CazaErroresCode, type CazaErroresOption, cazaErroresLabel } from "./caza-errores-policy";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaCatalogo, IncidenciaCreateValues, OperacionCliente } from "./incidencias.types";
import { OperacionesAdjuntarDialog } from "./operaciones-adjuntar-dialog";

type TeamType =
    | { id: string; label: string; flow: "CAZA"; code: CazaErroresCode; option: CazaErroresOption }
    | { id: string; label: string; flow: "PERSONAL"; concept: "UNIFORME" | "INDISCIPLINA" };

/** Tipos del PDF (filas 14 a 18, 33 a 41). Los importes salen del catálogo configurado, no de este archivo. */
export const teamIncidenceTypes: TeamType[] = [
    { id: "ERROR_DATOS", label: "Error de datos", flow: "CAZA", code: "ATC_ERROR_DATOS", option: "ERROR_REGISTRO" },
    { id: "ABANDONO_CHAT", label: "Abandono de chat", flow: "CAZA", code: "ATC_ABANDONO_CHAT", option: "CONVERSACION_PROCESO" },
    { id: "MAL_FLUJO", label: "Mal Flujo SafetyPay", flow: "CAZA", code: "ATC_MAL_FLUJO", option: "MAL_FLUJO_SAFETYPAY" },
    { id: "PROCESO_AIRE", label: "Conversación al Aire", flow: "CAZA", code: "ATC_PROCESO_AIRE", option: "CONVERSACION_PROCESO" },
    { id: "ERROR_REGISTRO", label: "Error en Registro o Código", flow: "CAZA", code: "ATC_ERROR_REGISTRO", option: "ERROR_REGISTRO" },
    { id: "UNIFORME", label: "Falta de uniforme completo", flow: "PERSONAL", concept: "UNIFORME" },
    { id: "INDISCIPLINA", label: "Indisciplina recurrente activa", flow: "PERSONAL", concept: "INDISCIPLINA" },
];

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const localDateTime = (date: string) =>
    `${date}T${new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())}`;
/** Modal de registro siempre visible (sin pestañas) para Incidencias del equipo del Jefe de Sede. */
/** flow limita los tipos a los de la opción (CAZA = Auditoría Operaciones, PERSONAL = Indisciplina Colaborador). */
export const IncidenciaEquipoForm = ({ catalog, onSave, flow }: { catalog: IncidenciaCatalogo; onSave: () => void; flow?: "CAZA" | "PERSONAL" }) => {
    const types = useMemo(() => (flow ? teamIncidenceTypes.filter((item) => item.flow === flow) : teamIncidenceTypes), [flow]);
    const notify = useAlert();
    const [typeId, setTypeId] = useState("");
    const [date, setDate] = useState(localDate());
    const [employeeId, setEmployeeId] = useState<number | null>(null);
    const [document, setDocument] = useState("");
    const [notes, setNotes] = useState("");
    const [operations, setOperations] = useState<OperacionCliente[]>([]);
    const [showOperations, setShowOperations] = useState(false);
    const [penalties, setPenalties] = useState(catalog.penalidades);
    const [loadingPenalties, setLoadingPenalties] = useState(false);
    const [catalogError, setCatalogError] = useState("");
    const [saving, setSaving] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const lock = useRef(false);
    const key = useRef(crypto.randomUUID());
    const request = useRef(0);
    const { result: client, isLoading: loadingClient } = useClienteLookup(document);
    const type = types.find((item) => item.id === typeId);
    const isPersonal = type?.flow === "PERSONAL";
    const penalty = useMemo(
        () =>
            !type
                ? undefined
                : type.flow === "CAZA"
                  ? penalties.find((item) => item.codigo === type.code)
                  : penalties.find((item) => item.codigo.toUpperCase().includes(type.concept)),
        [penalties, type],
    );
    const eventType = catalog.tipos.find((item) => item.codigo === "AUDITORIA_ACTIVA");
    // Mismos campos para toda auditoría: lo que pasó se explica en las notas.
    const showClient = flow === "CAZA" || type?.flow === "CAZA";
    const people = useMemo(() => catalog.responsables.map((person) => ({ id: person.id, label: person.nombre })), [catalog.responsables]);

    useEffect(() => {
        const current = ++request.current;
        if (!employeeId || !date) {
            setPenalties([]);
            setCatalogError("");
            setLoadingPenalties(false);
            return;
        }
        setLoadingPenalties(true);
        setCatalogError("");
        void incidenciasService
            .getCatalog(employeeId, date)
            .then((result) => {
                if (current === request.current) setPenalties(result.penalidades);
            })
            .catch((cause: unknown) => {
                if (current === request.current) {
                    setPenalties([]);
                    setCatalogError(cause instanceof Error ? cause.message : "No se pudo consultar el catálogo vigente");
                }
            })
            .finally(() => {
                if (current === request.current) setLoadingPenalties(false);
            });
        return () => {
            ++request.current;
        };
    }, [employeeId, date]);
    useEffect(() => {
        setOperations([]);
    }, [document]);

    const reset = () => {
        setAttempted(false);
        setTypeId("");
        setDate(localDate());
        setEmployeeId(null);
        setDocument("");
        setNotes("");
        setOperations([]);
        key.current = crypto.randomUUID();
    };
    const clientReady = /^\d{8}$/.test(document) && !loadingClient && !!client?.id;
    const save = async () => {
        if (lock.current || saving) return;
        setAttempted(true);
        const issues: string[] = [];
        if (!type) issues.push("Selecciona el tipo de incidencia.");
        if (!employeeId) issues.push("Selecciona al colaborador.");
        if (!date) issues.push("La fecha es obligatoria.");
        if (type?.flow === "PERSONAL" && notes.trim().length < 5) issues.push("Describe el hecho con al menos 5 caracteres.");
        if (type?.flow === "CAZA") {
            if (!clientReady) issues.push("Ingresa el DNI de un cliente registrado.");
            if (notes.trim().length < 5) issues.push("Describe en las notas qué pasó (mínimo 5 caracteres).");
        }
        if (issues.length) return notify("validation", oracionValidacion(issues));
        if (!type || !employeeId) return;
        if (loadingPenalties) return;
        if (!penalty) return notify("error", catalogError || "El concepto no está habilitado para esta fecha y colaborador");
        lock.current = true;
        setSaving(true);
        try {
            if (type.flow === "PERSONAL") {
                await incidenciasService.savePersonal(
                    {
                        idTipoEvento: 0,
                        idPenalidadTipo: penalty.id,
                        idReportante: null,
                        idResponsable: employeeId,
                        fechaEvento: localDateTime(date),
                        titulo: "",
                        motivo: notes,
                        evidenciaUrl: "",
                        clienteId: null,
                        clienteDocumento: "",
                        clienteNombre: "",
                        operacionId: null,
                    },
                    type.concept,
                    key.current,
                    true,
                );
            } else {
                if (!eventType) throw new Error("No está habilitado el tipo de evento de Auditoría Activa");
                if (!client) return;
                const values: IncidenciaCreateValues = {
                    idTipoEvento: eventType.id,
                    idPenalidadTipo: penalty.id,
                    idReportante: null,
                    idResponsable: employeeId,
                    fechaEvento: localDateTime(date),
                    titulo: cazaErroresLabel[type.code],
                    motivo: `Hallazgo: ${type.label}\nNotas: ${notes.trim()}`,
                    evidenciaUrl: "",
                    clienteId: client.id,
                    clienteDocumento: document,
                    clienteNombre: client.nombre,
                    operacionId: null,
                    operaciones: operations,
                };
                const id = await incidenciasService.createCazaErrores(values, type.option, key.current);
                await incidenciasService.sendCazaErrores(id, type.option);
            }
            notify("success", "Incidencia enviada a Administración.");
            reset();
            onSave();
        } catch (cause) {
            notify("error", cause instanceof Error ? cause.message : "No fue posible registrar la incidencia");
        } finally {
            lock.current = false;
            setSaving(false);
        }
    };
    const canSave = !!type && !!employeeId && notes.trim().length >= 5;

    return (
        <form
            noValidate
            aria-label="Nueva incidencia"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                <div className="w-full sm:w-72">
                    <Select
                        label="Tipo de incidencia"
                        placeholder="Seleccionar tipo"
                        size="sm"
                        isRequired
                        isInvalid={attempted && !type}
                        isDisabled={saving}
                        items={types}
                        selectedKey={typeId || null}
                        onSelectionChange={(selected) => setTypeId(String(selected ?? ""))}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                </div>
                <div className="w-full min-w-0 sm:min-w-48 sm:flex-1">
                    <Select
                        label="Colaborador"
                        placeholder="Seleccionar colaborador"
                        size="sm"
                        isRequired
                        isInvalid={attempted && !employeeId}
                        isDisabled={saving || people.length === 0}
                        items={people}
                        selectedKey={employeeId}
                        onSelectionChange={(selected) => setEmployeeId(selected ? Number(selected) : null)}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                </div>
                {showClient && (
                    <>
                        <div className="w-full sm:w-36 sm:shrink-0">
                            <Input
                                label="DNI del Cliente"
                                size="sm"
                                placeholder="8 dígitos"
                                isRequired
                                isInvalid={attempted && !clientReady}
                                isDisabled={saving}
                                maxLength={8}
                                inputMode="numeric"
                                value={document}
                                onChange={(value) => setDocument(value.replace(/\D/g, "").slice(0, 8))}
                                hint={
                                    loadingClient
                                        ? "Buscando cliente…"
                                        : document.length === 8
                                          ? client
                                              ? `Cliente: ${client.nombre}`
                                              : "Cliente no encontrado"
                                          : undefined
                                }
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            color="secondary"
                            iconLeading={Paperclip}
                            isDisabled={saving || !clientReady}
                            onClick={() => setShowOperations(true)}
                        >
                            Adjuntar operación{operations.length ? ` (${operations.length})` : ""}
                        </Button>
                    </>
                )}
                {(showClient || type) && (
                    <div className="w-full min-w-0 sm:min-w-52 sm:flex-1">
                        <CompensacionNoteField
                            label={isPersonal ? "Descripción del hecho" : "Notas"}
                            placeholder="Qué pasó"
                            value={notes}
                            onChange={setNotes}
                            isDisabled={saving}
                            isRequired
                        />
                    </div>
                )}
                <div className="w-full sm:w-40 sm:shrink-0">
                    <CompensacionDatePicker label="Fecha" isRequired isDisabled={saving} value={date} onChange={setDate} />
                </div>
                <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button type="submit" size="sm" color="primary" iconLeading={Save01} isLoading={saving} isDisabled={saving || !canSave}>
                        Guardar
                    </Button>
                    <Button type="button" size="sm" color="secondary" iconLeading={XClose} isDisabled={saving} onClick={reset}>
                        Cancelar
                    </Button>
                </div>
            </div>
            {operations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Operaciones adjuntas">
                    {operations.map((item) => (
                        <StatusBadge key={`${item.tipo}:${item.id}`}>
                            {item.tipo} · {item.codigo || `#${item.id}`}
                            {item.monto !== null ? ` · ${money.format(item.monto)}` : ""}
                        </StatusBadge>
                    ))}
                </div>
            )}
            {loadingPenalties && (
                <p role="status" className="mt-3 text-xs text-tertiary">
                    Consultando concepto vigente…
                </p>
            )}
            {catalogError && <AlertMessage tone="error">{catalogError}</AlertMessage>}
            {penalty && (
                <p className="mt-3 text-xs text-tertiary">
                    Concepto: {penalty.nombre}. Referencia {money.format(penalty.montoReferencia)}, sujeta a la aprobación del Administrador.
                </p>
            )}
            {showOperations && (
                <OperacionesAdjuntarDialog
                    document={document}
                    selected={operations}
                    onClose={() => setShowOperations(false)}
                    onConfirm={(items) => {
                        setOperations(items);
                        setShowOperations(false);
                    }}
                />
            )}
        </form>
    );
};
