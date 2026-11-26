import { useEffect, useMemo, useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CazaErroresCheckboxGroup } from "./caza-errores-checkbox-group";
import { type CazaErroresOption, cazaErroresConceptChoices, cazaErroresDetailOptions, cazaErroresLabel, cazaErroresOptions } from "./caza-errores-policy";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaCatalogo, IncidenciaCreateValues } from "./incidencias.types";

const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const localDateTime = (date: string) =>
    `${date}T${new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())}`;

export const CazaErroresForm = ({
    option,
    catalog,
    onCancel,
    onSave,
}: {
    option: CazaErroresOption;
    catalog: IncidenciaCatalogo;
    onCancel: () => void;
    onSave: () => void;
}) => {
    const notify = useAlert();
    const [attempted, setAttempted] = useState(false);
    const [date, setDate] = useState(localDate());
    const [employeeId, setEmployeeId] = useState<number | null>(null);
    const [clientDocument, setClientDocument] = useState("");
    const [selectedChoiceId, setSelectedChoiceId] = useState("");
    const [checks, setChecks] = useState<string[]>([]);
    const [errorType, setErrorType] = useState("");
    const [notes, setNotes] = useState("");
    const [penalties, setPenalties] = useState(catalog.penalidades);
    const [loadingPenalties, setLoadingPenalties] = useState(false);
    const [saving, setSaving] = useState(false);
    const [catalogError, setCatalogError] = useState("");
    const requestId = useRef(0);
    const submissionKey = useRef(crypto.randomUUID());
    const savingLock = useRef(false);
    const { result: client, isLoading: loadingClient } = useClienteLookup(clientDocument);
    const eventType = catalog.tipos.find((item) => item.codigo === "AUDITORIA_ACTIVA");
    const config = cazaErroresOptions[option];
    const conceptChoices = cazaErroresConceptChoices[option];
    const selectedChoice = conceptChoices.find((choice) => choice.id === selectedChoiceId);
    const selectedCode = option === "MAL_FLUJO_SAFETYPAY" ? "ATC_MAL_FLUJO" : (selectedChoice?.code ?? "");
    const employeeOptions = useMemo(() => catalog.responsables.map((person) => ({ id: person.id, label: person.nombre })), [catalog.responsables]);
    const availableCodes = config.codes;
    const checksForCode = selectedCode && availableCodes.includes(selectedCode) ? cazaErroresDetailOptions[selectedCode] : [];
    const observationChoices = (option === "CONVERSACION_PROCESO" ? availableCodes : selectedCode ? [selectedCode] : []).flatMap((code) =>
        cazaErroresDetailOptions[code].map((label) => ({ code, label })),
    );
    const selectedPenalty = penalties.find((item) => item.codigo === selectedCode);

    const reset = () => {
        setAttempted(false);
        setDate(localDate());
        setEmployeeId(null);
        setClientDocument("");
        setSelectedChoiceId("");
        setChecks([]);
        setErrorType("");
        setNotes("");
        submissionKey.current = crypto.randomUUID();
    };

    useEffect(() => {
        setSelectedChoiceId("");
        setChecks([]);
        setErrorType("");
        setDate(localDate());
    }, [option]);

    useEffect(() => {
        const request = ++requestId.current;
        if (!employeeId || !date) {
            setPenalties([]);
            setCatalogError("");
            setLoadingPenalties(false);
            return () => {
                requestId.current += 1;
            };
        }
        setLoadingPenalties(true);
        setCatalogError("");
        void incidenciasService
            .getCatalog(employeeId, date)
            .then((result) => {
                if (request === requestId.current) setPenalties(result.penalidades);
            })
            .catch((error: unknown) => {
                if (request === requestId.current) {
                    setPenalties([]);
                    setCatalogError(error instanceof Error ? error.message : "No se pudo consultar el catálogo vigente");
                }
            })
            .finally(() => {
                if (request === requestId.current) setLoadingPenalties(false);
            });
        return () => {
            requestId.current += 1;
        };
    }, [employeeId, date]);

    const toggleCheck = (label: string, selected: boolean) =>
        setChecks((current) => (selected ? [...new Set([...current, label])] : current.filter((item) => item !== label)));

    const save = async () => {
        if (savingLock.current || saving) return;
        if (!eventType) return notify("notice", "No está habilitado el tipo de evento de Auditoría Activa.");
        setAttempted(true);
        const problemasDeCampos1: string[] = [];
        if (!employeeId) problemasDeCampos1.push("Selecciona al colaborador.");
        if (!/^\d{8}$/.test(clientDocument) || loadingClient || !client?.id) problemasDeCampos1.push("Ingresa el DNI de un cliente registrado.");
        if (!selectedCode || !availableCodes.includes(selectedCode)) problemasDeCampos1.push("Selecciona el tipo de hallazgo.");
        if (option === "ERROR_REGISTRO" ? !errorType : !checks.length)
            problemasDeCampos1.push(option === "ERROR_REGISTRO" ? "Selecciona el tipo de error." : "Selecciona al menos una observación.");
        if (!date) problemasDeCampos1.push("La fecha es obligatoria.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        if (!employeeId || !client?.id || !selectedCode) return;
        if (loadingPenalties) return;
        if (!selectedPenalty) return notify("error", catalogError || "La penalidad del concepto no está habilitada para esta fecha y colaborador");
        const observation = option === "ERROR_REGISTRO" ? `Tipo de error: ${errorType}` : `Observaciones: ${checks.join("; ")}`;
        const motive = [selectedChoice ? `Hallazgo: ${selectedChoice.label}` : "", observation, notes.trim() ? `Notas: ${notes.trim()}` : ""]
            .filter(Boolean)
            .join("\n");
        const values: IncidenciaCreateValues = {
            idTipoEvento: eventType.id,
            idPenalidadTipo: selectedPenalty.id,
            idReportante: null,
            idResponsable: employeeId,
            fechaEvento: localDateTime(date),
            titulo: cazaErroresLabel[selectedCode],
            motivo: motive,
            evidenciaUrl: "",
            clienteId: client.id,
            clienteDocumento: clientDocument,
            clienteNombre: client.nombre,
            operacionId: null,
        };

        savingLock.current = true;
        setSaving(true);
        try {
            const id = await incidenciasService.createCazaErrores(values, option, submissionKey.current);
            await incidenciasService.sendCazaErrores(id, option);
            notify("success", "Hallazgo enviado a Administración.");
            reset();
            onSave();
        } catch (error) {
            notify("error", error instanceof Error ? error.message : "No fue posible registrar el hallazgo");
        } finally {
            savingLock.current = false;
            setSaving(false);
        }
    };

    return (
        <form
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                <div className="w-full min-w-0 sm:min-w-48 sm:flex-1">
                    <Select
                        isInvalid={attempted && !employeeId}
                        label="Colaborador"
                        placeholder="Seleccionar colaborador"
                        size="sm"
                        isRequired
                        isDisabled={saving || employeeOptions.length === 0}
                        items={employeeOptions}
                        selectedKey={employeeId}
                        onSelectionChange={(key) => setEmployeeId(key ? Number(key) : null)}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                </div>
                <div className="w-full sm:w-48 sm:shrink-0">
                    <Input
                        isInvalid={attempted && (!/^\d{8}$/.test(clientDocument) || (!loadingClient && !client?.id))}
                        label="Nro. Documento"
                        size="sm"
                        placeholder="8 dígitos"
                        isRequired
                        isDisabled={saving}
                        maxLength={8}
                        value={clientDocument}
                        onChange={(value) => setClientDocument(value.replace(/\D/g, "").slice(0, 8))}
                        hint={
                            loadingClient
                                ? "Buscando cliente…"
                                : clientDocument.length === 8
                                  ? client
                                      ? `Cliente: ${client.nombre}`
                                      : "Cliente no encontrado"
                                  : undefined
                        }
                    />
                </div>
                {conceptChoices.length > 0 && (
                    <CazaErroresCheckboxGroup
                        label="Concepto"
                        options={conceptChoices}
                        selected={selectedChoiceId ? [selectedChoiceId] : []}
                        disabled={saving}
                        onToggle={(id, selected) => {
                            setSelectedChoiceId(selected ? id : "");
                            setChecks([]);
                            setErrorType("");
                        }}
                    />
                )}
                {option === "ERROR_REGISTRO" && checksForCode.length > 0 && (
                    <div className="w-full min-w-0 sm:min-w-60 sm:flex-1">
                        <Select
                            label="Tipo de error"
                            placeholder="Seleccionar tipo de error"
                            size="sm"
                            isRequired
                            isDisabled={saving}
                            items={checksForCode.map((label) => ({ id: label, label }))}
                            selectedKey={errorType || null}
                            onSelectionChange={(key) => setErrorType(String(key ?? ""))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    </div>
                )}
                {option !== "ERROR_REGISTRO" && observationChoices.length > 0 && (
                    <CazaErroresCheckboxGroup
                        label="Observación"
                        options={observationChoices.map(({ code, label }) => ({ id: `${code}:${label}`, label }))}
                        selected={checks.map((label) => `${selectedCode}:${label}`)}
                        disabled={saving}
                        fullWidth
                        onToggle={(id, selected) => {
                            const separator = id.indexOf(":");
                            const code = id.slice(0, separator);
                            const label = id.slice(separator + 1);
                            if (option === "CONVERSACION_PROCESO" && code !== selectedCode) {
                                setSelectedChoiceId(conceptChoices.find((choice) => choice.code === code)?.id ?? "");
                                setChecks(selected ? [label] : []);
                            } else toggleCheck(label, selected);
                        }}
                    />
                )}
                <div className="w-full min-w-0 sm:min-w-52 sm:flex-1">
                    <CompensacionNoteField
                        label="Notas"
                        placeholder="Agrega contexto breve si hace falta"
                        value={notes}
                        onChange={setNotes}
                        isDisabled={saving}
                    />
                </div>
                <div className="w-full sm:w-40 sm:shrink-0">
                    <CompensacionDatePicker label="Fecha" isRequired isDisabled={saving} value={date} onChange={setDate} />
                </div>
                <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button
                        type="submit"
                        size="sm"
                        color="primary"
                        iconLeading={Save01}
                        isLoading={saving}
                        isDisabled={saving || !employeeId || !selectedCode || (option === "ERROR_REGISTRO" ? !errorType : checks.length === 0)}
                    >
                        Guardar
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        color="secondary"
                        iconLeading={XClose}
                        isDisabled={saving}
                        onClick={() => {
                            reset();
                            onCancel();
                        }}
                    >
                        Cancelar
                    </Button>
                </div>
            </div>
            {(loadingPenalties || catalogError) && (
                <p role={catalogError ? "alert" : "status"} className="mt-3 text-xs text-tertiary">
                    {loadingPenalties ? "Consultando concepto vigente…" : catalogError}
                </p>
            )}
            {selectedPenalty && (
                <p className="mt-3 text-xs text-tertiary">Concepto: {selectedPenalty.nombre}. Importe de referencia sujeto a revisión administrativa.</p>
            )}
        </form>
    );
};
