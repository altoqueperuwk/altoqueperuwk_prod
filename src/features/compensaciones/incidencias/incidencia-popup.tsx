import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, InfoCircle, Save01, Send01, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { AlertMessage, useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { type FacturacionOperacion, facturacionAuditoriaService } from "../evidencias/facturacion-auditoria.service";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { CompensacionPanel } from "../shared/compensacion-panel";
import { useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { type IncidenciaPersonalConcept, matchesPersonalIncidence, personalIncidenceTitle } from "./incidencia-personal-policy";
import { incidenciasService } from "./incidencias.service";
import type { IncidenciaCatalogo, IncidenciaCreateValues } from "./incidencias.types";
import { PagosOperacionSelect, pagosVinculo } from "./pagos-operacion-select";

const FacturacionOperacionSelect = ({
    dni,
    value,
    onChange,
    disabled,
}: {
    dni: string;
    value: number | null;
    onChange: (id: number | null) => void;
    disabled: boolean;
}) => {
    const [items, setItems] = useState<FacturacionOperacion[]>([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let active = true;
        setItems([]);
        setError("");
        setLoading(false);
        if (/^\d{8}$/.test(dni)) {
            setLoading(true);
            void facturacionAuditoriaService
                .operaciones(dni)
                .then((rows) => {
                    if (active) setItems(rows);
                })
                .catch((cause: unknown) => {
                    if (active)
                        setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudieron consultar las operaciones");
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        }
        return () => {
            active = false;
        };
    }, [dni]);
    return (
        <div className="min-w-64 flex-1">
            <Select
                label="Operación"
                size="sm"
                isRequired
                isDisabled={disabled || loading || items.length === 0}
                placeholder={loading ? "Consultando…" : "Seleccionar operación"}
                selectedKey={value == null ? null : String(value)}
                items={items.map((op) => ({ id: String(op.id), label: `${op.codigo ?? "Sin código"} · ${op.servicio} · ${op.estado}` }))}
                onSelectionChange={(key) => onChange(key ? Number(key) : null)}
            >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            {!loading && !error && dni.length === 8 && items.length === 0 && (
                <p role="status" className="mt-1 text-xs text-tertiary">
                    Sin operaciones autorizadas para este DNI.
                </p>
            )}
        </div>
    );
};

interface IncidenciaPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    catalog: IncidenciaCatalogo;
    inline?: boolean;
    concept?: IncidenciaPersonalConcept;
    /** Limita los conceptos a los de la opción; el reporte se envía directo, sin borradores. */
    penaltyPattern?: RegExp;
}
const localDateTime = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date());
    const part = (key: string) => parts.find((entry) => entry.type === key)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
const emptyForm = (): IncidenciaCreateValues => ({
    idTipoEvento: 0,
    idPenalidadTipo: 0,
    idReportante: null,
    idResponsable: 0,
    fechaEvento: localDateTime(),
    titulo: "",
    motivo: "",
    evidenciaUrl: "",
    clienteId: null,
    clienteDocumento: "",
    clienteNombre: "",
    operacionId: null,
});

const managerAuditConcepts: Record<string, { label: string; observation: string }> = {
    ATC_ERROR_DATOS: {
        label: "Error de Datos",
        observation: "Por dato errado remanente en formulario detectado por Facturación o por el Jefe de Tienda.",
    },
    ATC_ERROR_REGISTRO: {
        label: "Error en Registro Manual o Código",
        observation: "Por ingresar mal el DNI, Nombre, Celular, Correo o Código de Comunidad, detectado por Pagos antes de transferir.",
    },
    ATC_MAL_FLUJO: {
        label: "Mal Flujo SafetyPay",
        observation: "Por omitir el protocolo obligatorio (no solicitar monto ni generar código) y responder con textos rápidos genéricos.",
    },
    ATC_PROCESO_AIRE: {
        label: "Dejar Conversación / Proceso al Aire",
        observation: "Cuando el asesor deja el chat abandonado sin registrar datos obligatorios de cuentas o tarjetas, detectado por Pagos.",
    },
    ATC_ABANDONO_CHAT: {
        label: "Abandono Chat",
        observation:
            "Chat con más de 20 min sin respuesta / En cód. CMR, Safety, bancos o consultas. Dejar en visto o ignorar un comprobante/voucher de clientes por otra atención.",
    },
};
const managerAuditConceptOrder = ["ATC_ERROR_DATOS", "ATC_ERROR_REGISTRO", "ATC_MAL_FLUJO", "ATC_PROCESO_AIRE", "ATC_ABANDONO_CHAT"];

export const IncidenciaPopup = ({ isOpen, onClose, onSave, catalog, inline = false, concept, penaltyPattern }: IncidenciaPopupProps) => {
    const notify = useAlert();
    const { isStoreManager, isFacturacion, isAdministrator } = useCompensacionPerfil();
    const [form, setForm] = useState<IncidenciaCreateValues>(emptyForm);
    const [penalties, setPenalties] = useState(catalog.penalidades);
    const [isLoadingPenalties, setIsLoadingPenalties] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [destinationId, setDestinationId] = useState(0);
    const penaltyRequest = useRef(0);
    const submissionKey = useRef(crypto.randomUUID());
    const savingLock = useRef(false);
    const beginRequest = useCompensacionRequestScope();
    useEffect(
        () => () => {
            penaltyRequest.current += 1;
        },
        [],
    );
    const { result: client, isLoading: isClientLoading } = useClienteLookup(form.clienteDocumento);
    const selectedType = catalog.tipos.find((item) => item.id === form.idTipoEvento) ?? null;
    const isCritical = penalties.some((penalty) => penalty.id === form.idPenalidadTipo && /^PAG_[A-Z_]+_ERROR_PAGO_CRITICO$/.test(penalty.codigo));
    const vinculo = isAdministrator ? pagosVinculo(penalties.find((penalty) => penalty.id === form.idPenalidadTipo)?.codigo) : null;
    const elegirOperacion = useCallback((id: number | null) => setForm((current) => ({ ...current, operacionId: id })), []);
    const requiresClient = isCritical || isFacturacion || selectedType?.requiereCliente;
    const requiresOperation = isCritical || isFacturacion || selectedType?.requiereOperacion;
    const availablePenalties = useMemo(
        () =>
            (selectedType?.categoria === "AUDITORIA_PAGO" ? penalties.filter((item) => item.montoBonoReportante !== null) : penalties).filter(
                (item) => matchesPersonalIncidence(item.codigo, concept) && (!penaltyPattern || penaltyPattern.test(item.codigo)),
            ),
        [penalties, selectedType?.categoria, concept, penaltyPattern],
    );
    const displayedPenalties =
        isStoreManager && selectedType?.codigo === "AUDITORIA_ACTIVA"
            ? [...availablePenalties].sort((left, right) => managerAuditConceptOrder.indexOf(left.codigo) - managerAuditConceptOrder.indexOf(right.codigo))
            : availablePenalties;
    const destinationItems = useMemo(
        () => [
            { id: 0, label: "Todas las sedes" },
            ...Array.from(new Map(catalog.responsables.map((person) => [person.idSucursal, { id: person.idSucursal, label: person.sucursal }])).values()),
        ],
        [catalog.responsables],
    );
    const selectedPenalty = availablePenalties.find((penalty) => penalty.id === form.idPenalidadTipo);
    const responsiblePeople = catalog.responsables.filter((person) => person.id !== form.idReportante);
    const people = (items: IncidenciaCatalogo["responsables"]) =>
        items.map((item) => ({ id: item.id, label: `${item.nombre} · ${item.documento} · ${item.sucursal}` }));
    const setValue = <K extends keyof IncidenciaCreateValues>(key: K, value: IncidenciaCreateValues[K]) =>
        setForm((current) => ({
            ...current,
            [key]: value,
            ...((isFacturacion || isCritical) && key === "clienteDocumento" ? { operacionId: null } : {}),
            ...(isAdministrator && (key === "idResponsable" || key === "idPenalidadTipo") ? { operacionId: null } : {}),
        }));

    useEffect(() => {
        if (isOpen) {
            setDestinationId(0);
            setForm({
                ...emptyForm(),
                idTipoEvento: catalog.tipos.find((type) => type.codigo === "REPORTE_PENALIDAD")?.id ?? catalog.tipos[0]?.id ?? 0,
                idReportante: isStoreManager ? (catalog.reportantes[0]?.id ?? null) : catalog.reportantes.length === 1 ? catalog.reportantes[0].id : null,
            });
            setPenalties([]);
        }
    }, [catalog.reportantes, catalog.tipos, isOpen]);
    useEffect(() => {
        setForm((current) => ({ ...current, clienteId: client?.id ?? null, clienteNombre: client?.nombre ?? (client ? current.clienteNombre : "") }));
    }, [client]);

    const loadPenalties = async (responsibleId: number, dateTime: string) => {
        const request = ++penaltyRequest.current;
        setValue("idPenalidadTipo", 0);
        setPenalties([]);
        if (!responsibleId || !dateTime) {
            setIsLoadingPenalties(false);
            return;
        }
        setIsLoadingPenalties(true);
        try {
            const result = await incidenciasService.getCatalog(responsibleId, dateTime.slice(0, 10));
            if (request !== penaltyRequest.current) return;
            setPenalties(result.penalidades);
        } catch (error) {
            if (request !== penaltyRequest.current) return;
            notify("error", error instanceof Error ? error.message : "No fue posible consultar las penalidades aplicables");
        } finally {
            if (request === penaltyRequest.current) setIsLoadingPenalties(false);
        }
    };

    const save = async (sendAfterSave: boolean) => {
        if (savingLock.current || isSaving || isLoadingPenalties) return;
        const reportanteId = isStoreManager ? catalog.reportantes[0]?.id : form.idReportante;
        if (!selectedType || !form.idPenalidadTipo || !form.idResponsable || !reportanteId)
            return notify(
                "error",
                isStoreManager ? "Error detectado, colaborador y fecha son obligatorios" : "Tipo, penalidad, reportante y responsable son obligatorios",
            );
        const problemasDeCampos1: string[] = [];
        if (!isStoreManager && reportanteId === form.idResponsable) problemasDeCampos1.push("El reportante y el responsable deben ser personas diferentes.");
        if (!form.fechaEvento || !form.motivo.trim()) problemasDeCampos1.push("La fecha y el motivo son obligatorios.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        if (!selectedPenalty || !matchesPersonalIncidence(selectedPenalty.codigo, concept))
            return notify("validation", "Selecciona el concepto aplicable a este reporte.");
        const problemasDeCampos2: string[] = [];
        if (requiresClient && !form.clienteId) problemasDeCampos2.push("Ingresa el DNI de un cliente registrado.");
        if ((requiresOperation || vinculo) && !form.operacionId) problemasDeCampos2.push("La operación relacionada es obligatoria.");
        if (isCritical && (!/^\d+(\.\d{1,2})?$/.test(form.montoPerdido ?? "") || Number(form.montoPerdido) <= 0))
            problemasDeCampos2.push("Ingresa la pérdida real sustentada con hasta dos decimales.");
        if (problemasDeCampos2.length) return notify("validation", oracionValidacion(problemasDeCampos2));
        const isCurrent = beginRequest();
        savingLock.current = true;
        setIsSaving(true);
        try {
            if (concept && isStoreManager) {
                await incidenciasService.savePersonal({ ...form, idReportante: reportanteId }, concept, submissionKey.current, sendAfterSave);
            } else {
                const formToSave = { ...form, idReportante: reportanteId };
                const id = isCritical
                    ? await incidenciasService.create(formToSave, sendAfterSave, submissionKey.current)
                    : await incidenciasService.create({ ...formToSave, montoPerdido: undefined }, false, submissionKey.current);
                if (!isCurrent()) return;
                if (sendAfterSave && !isCritical) await incidenciasService.send(id);
            }
            if (!isCurrent()) return;
            notify(
                "success",
                sendAfterSave
                    ? concept && isStoreManager
                        ? "Reporte enviado a Administración"
                        : "Incidencia enviada a la sede responsable"
                    : "Incidencia guardada como borrador",
            );
            onSave();
        } catch (error) {
            if (!isCurrent()) return;
            notify("error", error instanceof Error ? error.message : "No fue posible registrar la incidencia");
        } finally {
            savingLock.current = false;
            if (isCurrent()) setIsSaving(false);
        }
    };

    if ((isStoreManager || isFacturacion || isAdministrator) && inline)
        return isOpen ? (
            <CompensacionPanel
                title={concept ? `Registrar ${personalIncidenceTitle(concept)}` : isStoreManager ? "Registrar Hallazgo" : "Registrar Reporte"}
                trailing={
                    <ButtonUtility
                        size="xs"
                        color="tertiary"
                        icon={InfoCircle}
                        tooltip={
                            concept
                                ? "El registro queda sujeto a revisión. El descuento requiere comprobar la pérdida previa del bono y la regla vigente."
                                : isStoreManager
                                  ? "Reporta el error detectado y cuya corrección ordenaste antes de escalar a Pagos o Facturación. La comisión requiere revisión administrativa."
                                  : "Registrar envía el reporte a revisión. Los descuentos y bonos requieren una decisión autorizada independiente."
                        }
                        className={compensationTableActionClass}
                    />
                }
            >
                <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                    {!isStoreManager && (
                        <div className="w-full min-w-0 sm:min-w-48 sm:flex-1">
                            <Select
                                label="Reportante"
                                placeholder="Seleccionar reportante"
                                size="sm"
                                isRequired
                                isDisabled={isSaving || catalog.reportantes.length === 1}
                                items={catalog.reportantes.map((person) => ({ id: person.id, label: person.nombre }))}
                                selectedKey={form.idReportante ?? 0}
                                onSelectionChange={(key) => setValue("idReportante", key ? Number(key) : null)}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                    )}
                    {catalog.tipos.length > 1 && (
                        <div className="w-full min-w-0 sm:min-w-40 sm:flex-1">
                            <Select
                                label="Tipo"
                                size="sm"
                                isDisabled={isSaving}
                                items={catalog.tipos.map((type) => ({ id: type.id, label: type.nombre }))}
                                selectedKey={form.idTipoEvento}
                                onSelectionChange={(key) => {
                                    setValue("idTipoEvento", Number(key));
                                    setValue("idPenalidadTipo", 0);
                                }}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                    )}
                    <div className="w-full min-w-0 sm:min-w-48 sm:flex-1">
                        <Select
                            label={isStoreManager ? "Colaborador" : "Responsable"}
                            placeholder={isStoreManager ? "Seleccionar colaborador" : "Seleccionar responsable"}
                            size="sm"
                            isRequired
                            isDisabled={isSaving || responsiblePeople.length === 0}
                            hint={responsiblePeople.length === 0 ? "No hay colaboradores habilitados en tu equipo para esta fecha." : undefined}
                            items={responsiblePeople.map((person) => ({ id: person.id, label: person.nombre }))}
                            selectedKey={form.idResponsable}
                            onSelectionChange={(key) => {
                                const id = Number(key ?? 0);
                                setValue("idResponsable", id);
                                void loadPenalties(id, form.fechaEvento);
                            }}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    </div>
                    <div className="w-full min-w-0 sm:min-w-48 sm:flex-1">
                        <Select
                            label={isStoreManager && selectedType?.codigo === "AUDITORIA_ACTIVA" ? "Error Detectado" : "Penalidad"}
                            placeholder={
                                isLoadingPenalties
                                    ? "Consultando..."
                                    : isStoreManager && selectedType?.codigo === "AUDITORIA_ACTIVA"
                                      ? "Seleccionar error"
                                      : "Seleccionar penalidad"
                            }
                            size="sm"
                            isRequired
                            isDisabled={isSaving || !form.idResponsable || isLoadingPenalties}
                            items={displayedPenalties.map((p) => ({
                                id: p.id,
                                label:
                                    isStoreManager && selectedType?.codigo === "AUDITORIA_ACTIVA"
                                        ? (managerAuditConcepts[p.codigo]?.label ?? p.nombre)
                                        : p.nombre,
                            }))}
                            selectedKey={form.idPenalidadTipo}
                            onSelectionChange={(key) => setValue("idPenalidadTipo", Number(key ?? 0))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    </div>
                    {requiresClient && (
                        <>
                            <div className="w-full sm:w-36 sm:shrink-0">
                                <Input
                                    label="Nro. Documento"
                                    size="sm"
                                    placeholder="8 dígitos"
                                    isRequired
                                    isDisabled={isSaving}
                                    maxLength={8}
                                    value={form.clienteDocumento}
                                    onChange={(value) => setValue("clienteDocumento", value.replace(/\D/g, "").slice(0, 8))}
                                    hint={
                                        isClientLoading
                                            ? "Buscando cliente..."
                                            : form.clienteDocumento.length === 8 && !client
                                              ? "Cliente no encontrado"
                                              : undefined
                                    }
                                />
                            </div>
                            <div className="w-full min-w-0 sm:min-w-48 sm:flex-1">
                                <Input label="Nombre" size="sm" value={form.clienteNombre} isDisabled />
                            </div>
                        </>
                    )}
                    {(isFacturacion || isCritical) && (
                        <FacturacionOperacionSelect
                            dni={form.clienteDocumento}
                            value={form.operacionId}
                            onChange={(id) => setValue("operacionId", id)}
                            disabled={isSaving}
                        />
                    )}
                    {vinculo && (
                        <PagosOperacionSelect
                            className="w-full min-w-0 sm:min-w-64 sm:flex-1"
                            colaboradorId={form.idResponsable || null}
                            vinculo={vinculo}
                            fechaHecho={form.fechaEvento}
                            value={form.operacionId}
                            onChange={elegirOperacion}
                            disabled={isSaving}
                        />
                    )}
                    {!isFacturacion && !isCritical && !vinculo && selectedType?.requiereOperacion && (
                        <div className="w-full sm:w-48">
                            <Input
                                label="Operación relacionada"
                                size="sm"
                                type="number"
                                isRequired
                                isDisabled={isSaving}
                                value={form.operacionId?.toString() ?? ""}
                                onChange={(value) => setValue("operacionId", value ? Number(value) : null)}
                            />
                        </div>
                    )}
                    {isCritical && (
                        <div className="w-44">
                            <Input
                                label="Monto Perdido"
                                size="sm"
                                type="number"
                                isRequired
                                value={form.montoPerdido ?? ""}
                                onChange={(value) => setValue("montoPerdido", value)}
                                hint="Pérdida real sustentada."
                            />
                        </div>
                    )}
                    <div className="w-full min-w-0 sm:min-w-52 sm:flex-1">
                        <CompensacionNoteField
                            label="Motivo"
                            placeholder="Describe el error y su corrección"
                            isRequired
                            isDisabled={isSaving}
                            value={form.motivo}
                            onChange={(value) => setValue("motivo", value)}
                        />
                    </div>
                    <div className="w-full sm:w-40 sm:shrink-0">
                        <CompensacionDatePicker
                            label="Fecha"
                            isRequired
                            isDisabled={isSaving}
                            value={form.fechaEvento.slice(0, 10)}
                            onChange={(day) => {
                                const value = `${day}T${form.fechaEvento.slice(11) || localDateTime().slice(11)}`;
                                setValue("fechaEvento", value);
                                void loadPenalties(form.idResponsable, value);
                            }}
                        />
                    </div>
                    <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
                        {!penaltyPattern && (
                            <Button
                                size="sm"
                                color="secondary"
                                iconLeading={Save01}
                                isDisabled={isSaving || responsiblePeople.length === 0}
                                onClick={() => void save(false)}
                            >
                                Borrador
                            </Button>
                        )}
                        <Button size="sm" iconLeading={Save01} isLoading={isSaving} isDisabled={responsiblePeople.length === 0} onClick={() => void save(true)}>
                            Guardar
                        </Button>
                        <Button
                            size="sm"
                            color="secondary"
                            iconLeading={XClose}
                            isDisabled={isSaving}
                            onClick={() => {
                                penaltyRequest.current += 1;
                                submissionKey.current = crypto.randomUUID();
                                setPenalties([]);
                                setIsLoadingPenalties(false);
                                setForm({
                                    ...emptyForm(),
                                    idTipoEvento: catalog.tipos[0]?.id ?? 0,
                                    idReportante: isStoreManager || catalog.reportantes.length === 1 ? (catalog.reportantes[0]?.id ?? null) : null,
                                });
                                onClose();
                            }}
                        >
                            Cancelar
                        </Button>
                    </div>
                </div>
                {selectedPenalty &&
                    !concept &&
                    (isStoreManager && selectedType?.codigo === "AUDITORIA_ACTIVA" ? (
                        <div className="mt-3 space-y-1 text-xs text-tertiary">
                            <p>
                                Penalidad de referencia: S/ {selectedPenalty.montoReferencia.toFixed(2)} · Comisión por detección:{" "}
                                {selectedPenalty.montoBonoReportante == null ? "No aplica" : `S/ ${selectedPenalty.montoBonoReportante.toFixed(2)}`}
                            </p>
                            <p>
                                Observación:{" "}
                                {managerAuditConcepts[selectedPenalty.codigo]?.observation ?? selectedPenalty.descripcion ?? "Sin observación registrada."}
                            </p>
                        </div>
                    ) : (
                        <p className="mt-3 text-xs text-tertiary">
                            Importes sujetos a revisión: descuento de referencia S/ {selectedPenalty.montoReferencia.toFixed(2)} · Comisión del reportante{" "}
                            {isFacturacion || selectedPenalty.montoBonoReportante == null
                                ? "No aplica"
                                : `S/ ${selectedPenalty.montoBonoReportante.toFixed(2)}`}
                            .
                        </p>
                    ))}
            </CompensacionPanel>
        ) : null;

    return (
        <AnimatePresence>
            {isOpen && (
                <CompensacionSurface title="Nuevo reporte" onClose={onClose} busy={isSaving} inline={inline}>
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className={
                            inline
                                ? "overflow-hidden rounded-xl border border-secondary bg-primary"
                                : "relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-primary shadow-xl"
                        }
                    >
                        <CompensacionDialogHeader title={<>Nuevo reporte</>} onClose={inline ? undefined : onClose} busy={isSaving} inline={inline}>
                            <div>
                                <p className="mt-1 text-sm text-tertiary">Reporta una penalidad o auditoría a la sede responsable.</p>
                            </div>
                        </CompensacionDialogHeader>
                        <div className="flex-1 space-y-5 overflow-y-auto p-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                {catalog.tipos.length > 1 && (
                                    <Select
                                        label="Tipo de reporte"
                                        placeholder="Selecciona"
                                        size="sm"
                                        isRequired
                                        items={catalog.tipos.map((item) => ({ id: item.id, label: item.nombre }))}
                                        selectedKey={form.idTipoEvento}
                                        onSelectionChange={(key) => {
                                            if (key !== null) {
                                                setValue("idTipoEvento", Number(key));
                                                setValue("idPenalidadTipo", 0);
                                            }
                                        }}
                                    >
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>
                                )}
                                <Input
                                    label="Fecha y hora"
                                    size="sm"
                                    type="datetime-local"
                                    isRequired
                                    value={form.fechaEvento}
                                    onChange={(value) => {
                                        setValue("fechaEvento", value);
                                        void loadPenalties(form.idResponsable, value);
                                    }}
                                />
                                <Select
                                    label="Reportante"
                                    placeholder="Selecciona"
                                    size="sm"
                                    isRequired
                                    items={people(catalog.reportantes)}
                                    selectedKey={form.idReportante ?? 0}
                                    onSelectionChange={(key) => setValue("idReportante", key ? Number(key) : null)}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select
                                    label="Sede responsable"
                                    size="sm"
                                    items={destinationItems}
                                    selectedKey={destinationId}
                                    onSelectionChange={(key) => {
                                        setDestinationId(key ? Number(key) : 0);
                                        setValue("idResponsable", 0);
                                        void loadPenalties(0, form.fechaEvento);
                                    }}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select
                                    label="Responsable"
                                    placeholder="Selecciona"
                                    size="sm"
                                    isRequired
                                    items={people(catalog.responsables.filter((person) => !destinationId || person.idSucursal === destinationId))}
                                    selectedKey={form.idResponsable}
                                    onSelectionChange={(key) => {
                                        const id = key ? Number(key) : 0;
                                        setValue("idResponsable", id);
                                        void loadPenalties(id, form.fechaEvento);
                                    }}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select
                                    label={isStoreManager && selectedType?.codigo === "AUDITORIA_ACTIVA" ? "Error Detectado" : "Penalidad aplicable"}
                                    size="sm"
                                    isRequired
                                    isDisabled={!form.idResponsable || isLoadingPenalties}
                                    placeholder={isLoadingPenalties ? "Consultando..." : "Seleccionar"}
                                    items={availablePenalties.map((item) => ({ id: item.id, label: `${item.nombre} · S/ ${item.montoReferencia.toFixed(2)}` }))}
                                    selectedKey={form.idPenalidadTipo}
                                    onSelectionChange={(key) => setValue("idPenalidadTipo", key ? Number(key) : 0)}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Input
                                    label="Título"
                                    size="sm"
                                    value={form.titulo}
                                    onChange={(value) => setValue("titulo", value)}
                                    placeholder="Opcional; se usará el nombre de la penalidad"
                                />
                            </div>
                            {selectedPenalty && (
                                <section aria-label="Importes del reporte" className="rounded-xl border border-secondary bg-secondary p-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <p className="text-xs text-tertiary">Descuento previsto</p>
                                            <p className="mt-1 font-semibold text-error-primary">S/ {selectedPenalty.montoReferencia.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-tertiary">Bono previsto al reportante</p>
                                            <p className="mt-1 font-semibold text-success-primary">
                                                {selectedPenalty.montoBonoReportante === null
                                                    ? "No aplica"
                                                    : `S/ ${selectedPenalty.montoBonoReportante.toFixed(2)}`}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-xs text-secondary">Se aplican únicamente si el reporte es aprobado.</p>
                                </section>
                            )}
                            {selectedType && (requiresClient || requiresOperation) && (
                                <section className="rounded-lg border border-secondary bg-secondary p-4">
                                    <h3 className="text-sm font-semibold text-primary">Referencia operativa</h3>
                                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                        {requiresClient && (
                                            <>
                                                <Input
                                                    label="DNI del cliente"
                                                    size="sm"
                                                    isRequired
                                                    value={form.clienteDocumento}
                                                    onChange={(value) => setValue("clienteDocumento", value.replace(/\D/g, "").slice(0, 8))}
                                                    hint={
                                                        isClientLoading
                                                            ? "Buscando cliente..."
                                                            : client
                                                              ? `Cliente encontrado: ${client.nombre}`
                                                              : form.clienteDocumento.length === 8
                                                                ? "Cliente no encontrado"
                                                                : undefined
                                                    }
                                                />
                                                <Input
                                                    label="Cliente"
                                                    size="sm"
                                                    value={form.clienteNombre}
                                                    onChange={(value) => setValue("clienteNombre", value)}
                                                    isDisabled={Boolean(client)}
                                                />
                                            </>
                                        )}
                                        {(isFacturacion || isCritical) && (
                                            <FacturacionOperacionSelect
                                                dni={form.clienteDocumento}
                                                value={form.operacionId}
                                                onChange={(id) => setValue("operacionId", id)}
                                                disabled={isSaving}
                                            />
                                        )}
                                        {!isFacturacion && !isCritical && selectedType.requiereOperacion && (
                                            <Input
                                                label="Código de operación"
                                                size="sm"
                                                type="number"
                                                isRequired
                                                value={form.operacionId?.toString() ?? ""}
                                                onChange={(value) => setValue("operacionId", value ? Number(value) : null)}
                                            />
                                        )}
                                    </div>
                                </section>
                            )}
                            {vinculo && (
                                <PagosOperacionSelect
                                    colaboradorId={form.idResponsable || null}
                                    vinculo={vinculo}
                                    fechaHecho={form.fechaEvento}
                                    value={form.operacionId}
                                    onChange={elegirOperacion}
                                    disabled={isSaving}
                                />
                            )}
                            {isCritical && (
                                <Input
                                    label="Monto Perdido"
                                    size="sm"
                                    type="number"
                                    isRequired
                                    value={form.montoPerdido ?? ""}
                                    onChange={(value) => setValue("montoPerdido", value)}
                                    hint="100% de la pérdida sustentada, con mínimo de la configuración. Fraccionar requiere un plan mensual autorizado."
                                />
                            )}
                            <TextArea
                                label="Motivo"
                                size="sm"
                                rows={4}
                                isRequired
                                value={form.motivo}
                                onChange={(value) => setValue("motivo", value)}
                                placeholder="Describe el error, contexto y criterio aplicado"
                            />
                        </div>
                        <div className="flex flex-wrap justify-end gap-3 border-t border-secondary px-6 py-4">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="secondary" iconLeading={Check} isLoading={isSaving} onClick={() => void save(false)}>
                                Guardar borrador
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Send01} isLoading={isSaving} onClick={() => void save(true)}>
                                Guardar y enviar
                            </Button>
                        </div>
                    </motion.div>
                </CompensacionSurface>
            )}
        </AnimatePresence>
    );
};
