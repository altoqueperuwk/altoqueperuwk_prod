import { useEffect, useMemo, useRef, useState } from "react";
import { today } from "@internationalized/date";
import { Check, Save01, SearchLg, Send01, UploadCloud02, X, XClose } from "@untitledui/icons";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useAlert } from "@/components/shared/alert-center";
import { oracionValidacion } from "@/features/compensaciones/shared/compensacion-validacion";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import type { Colaborador } from "../colaboradores/colaboradores.types";
import { CompensacionDatePicker } from "../shared/compensacion-date-picker";
import { CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { CompensacionFechaCell } from "../shared/compensacion-fecha-cell";
import { CompensacionNoteField } from "../shared/compensacion-note-field";
import { advisorCanRegisterBonus, useCompensacionPerfil } from "../shared/compensacion-perfil";
import { CompensacionSurface } from "../shared/compensacion-surface";
import { compensationTableActionClass } from "../shared/compensacion-table-styles";
import { useCompensacionRequestScope } from "../shared/use-compensacion-request-scope";
import { evidenciasService } from "./evidencias.service";
import type { EvidenciaCreateValues, EvidenciaTipo } from "./evidencias.types";
import { innovacionFechaEvento } from "./innovacion-fecha";

interface EvidenciaPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    types: EvidenciaTipo[];
    collaborators: (Pick<Colaborador, "id" | "nombreCompleto" | "numeroDocumento"> & { idUsuario?: number | null })[];
    inline?: boolean;
    heading?: string;
}

const localDateTime = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
};

const emptyForm = (): EvidenciaCreateValues => ({
    idTipoEvento: 0,
    fechaEvento: localDateTime(),
    idBeneficiario: null,
    idResponsable: null,
    titulo: "",
    descripcion: "",
    clienteId: null,
    clienteDocumento: "",
    clienteNombre: "",
    operacionId: null,
    evidenciaUrl: "",
    estrellas: null,
});

export const EvidenciaPopup = ({ isOpen, onClose, onSave, types, collaborators, inline = false, heading = "Nueva evidencia" }: EvidenciaPopupProps) => {
    const notify = useAlert();
    const { isAdvisor: isAtc, isFacturacion, isPagos, isMarketing, isStoreManager, isResolving, userId } = useCompensacionPerfil();
    const isAdvisor = isAtc || isFacturacion || isPagos || isMarketing;
    const saveLock = useRef(false);
    const beginRequest = useCompensacionRequestScope();
    const pendingInnovation = useRef<{ payload: string; key: string } | null>(null);
    const tiktokFileInput = useRef<HTMLInputElement>(null);
    const ownBeneficiary = isAdvisor
        ? (collaborators.find((person) => person.idUsuario === userId) ??
          (collaborators.length === 1 && collaborators[0].idUsuario == null ? collaborators[0] : null))
        : isStoreManager
          ? (collaborators.find((person) => person.idUsuario === userId) ?? null)
          : null;
    const [form, setForm] = useState<EvidenciaCreateValues>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [tiktokCode, setTiktokCode] = useState("");
    const [tiktokOperation, setTiktokOperation] = useState<Awaited<ReturnType<typeof evidenciasService.searchTiktokOperations>>["items"][number] | null>(null);
    const [tiktokOperations, setTiktokOperations] = useState<Awaited<ReturnType<typeof evidenciasService.searchTiktokOperations>>["items"]>([]);
    const [tiktokSearchDone, setTiktokSearchDone] = useState(false);
    const [isSearchingTiktok, setIsSearchingTiktok] = useState(false);
    const [tiktokImage, setTiktokImage] = useState<File | null>(null);
    const [tiktokImagePreview, setTiktokImagePreview] = useState<string | null>(null);
    const { result: client, isLoading: isClientLoading } = useClienteLookup(form.clienteDocumento);
    const selectedType = types.find((item) => item.id === form.idTipoEvento) ?? null;
    const isTiktokLive = selectedType?.codigo === "TIKTOK_LIVE";
    const isInnovation = selectedType?.codigo === "PROPUESTA_INNOVACION";
    // TikTok conserva su bloque de resultados; Innovación usa la captura inline
    // estándar de Compensaciones, con una sola superficie y cabecera separada.
    const layeredInline = inline && isTiktokLive;
    const collaboratorItems = useMemo(
        () => collaborators.map((item) => ({ id: item.id, label: `${item.nombreCompleto} · ${item.numeroDocumento}` })),
        [collaborators],
    );

    useEffect(() => {
        if (!isOpen) return;
        setForm({
            ...emptyForm(),
            ...((isAdvisor || isStoreManager) && types[0]?.codigo === "PROPUESTA_INNOVACION" ? { fechaEvento: today("America/Lima").toString() } : {}),
            idTipoEvento: types[0]?.id ?? 0,
            idBeneficiario: ownBeneficiary?.id ?? null,
        });
        setTiktokCode("");
        setTiktokOperation(null);
        setTiktokOperations([]);
        setTiktokSearchDone(false);
        setTiktokImage(null);
        if (tiktokFileInput.current) tiktokFileInput.current.value = "";
    }, [isOpen, types, ownBeneficiary?.id]);

    useEffect(() => {
        if (!tiktokImage) {
            setTiktokImagePreview(null);
            return;
        }
        const preview = URL.createObjectURL(tiktokImage);
        setTiktokImagePreview(preview);
        return () => URL.revokeObjectURL(preview);
    }, [tiktokImage]);

    useEffect(() => {
        if (isTiktokLive && tiktokOperation) return;
        setForm((current) => ({ ...current, clienteId: client?.id ?? null, clienteNombre: client?.nombre ?? (client ? current.clienteNombre : "") }));
    }, [client, isTiktokLive, tiktokOperation]);

    const setValue = <K extends keyof EvidenciaCreateValues>(key: K, value: EvidenciaCreateValues[K]) => setForm((current) => ({ ...current, [key]: value }));

    const searchTiktokOperation = async () => {
        if (isSearchingTiktok) return;
        const dni = form.clienteDocumento.trim();
        const code = tiktokCode.trim();
        const problemasDeCampos1: string[] = [];
        if (!dni && !code) problemasDeCampos1.push("Ingresa el DNI del cliente o el código de operación.");
        if (dni && !/^\d{8}$/.test(dni)) problemasDeCampos1.push("El DNI debe tener 8 dígitos.");
        if (code && code.length < 3) problemasDeCampos1.push("El código debe tener al menos 3 caracteres.");
        if (problemasDeCampos1.length) return notify("validation", oracionValidacion(problemasDeCampos1));
        setIsSearchingTiktok(true);
        setTiktokOperation(null);
        setTiktokOperations([]);
        setTiktokSearchDone(false);
        setValue("operacionId", null);
        try {
            const result = await evidenciasService.searchTiktokOperations(code, dni);
            setTiktokOperations(result.items);
            setTiktokSearchDone(true);
            if (!result.items.length) notify("info", "No se encontraron operaciones pagadas para esos datos.");
        } catch (error) {
            notify("error", error instanceof Error ? error.message : "No se pudo verificar la operación de TikTok.");
        } finally {
            setIsSearchingTiktok(false);
        }
    };

    const selectTiktokOperation = (operation: (typeof tiktokOperations)[number]) => {
        if (!operation.elegible) return;
        setTiktokOperation(operation);
        setValue("operacionId", operation.id);
        setValue("clienteId", operation.id_cliente);
        setValue("clienteDocumento", operation.dni);
        setValue("clienteNombre", operation.cliente);
        setTiktokImage(null);
        if (tiktokFileInput.current) tiktokFileInput.current.value = "";
        notify("success", "Operación pagada seleccionada.");
    };

    const handleSave = async (sendAfterSave: boolean) => {
        if (saveLock.current || isResolving) return;
        const problemasDeCampos2: string[] = [];
        if (!selectedType) problemasDeCampos2.push("Selecciona un tipo de evidencia.");
        if (isInnovation && !form.titulo.trim()) problemasDeCampos2.push("El título de la propuesta es obligatorio.");
        if (isInnovation && !form.descripcion.trim()) problemasDeCampos2.push("La descripción de la propuesta es obligatoria.");
        if (problemasDeCampos2.length) return notify("validation", oracionValidacion(problemasDeCampos2));
        if (!selectedType) return;
        if (isAdvisor && (!advisorCanRegisterBonus(selectedType.codigo) || !ownBeneficiary || form.idBeneficiario !== ownBeneficiary.id))
            return notify("error", "No se pudo verificar el bono o tu ficha de colaborador.");
        const problemasDeCampos3: string[] = [];
        if (!form.fechaEvento) problemasDeCampos3.push("La fecha del evento es obligatoria.");
        if (selectedType.requiereBeneficiario && !form.idBeneficiario) problemasDeCampos3.push("Selecciona al colaborador beneficiario.");
        if (selectedType.requiereResponsable && !form.idResponsable) problemasDeCampos3.push("Selecciona al colaborador responsable.");
        if (!form.idBeneficiario && !form.idResponsable) problemasDeCampos3.push("Vincula al menos un colaborador.");
        if (selectedType.requiereCliente && !form.clienteId && !isTiktokLive) problemasDeCampos3.push("Ingresa el DNI de un cliente registrado.");
        if (isTiktokLive && (!tiktokOperation?.elegible || form.operacionId !== tiktokOperation.id))
            problemasDeCampos3.push("Busca y selecciona una operación pagada.");
        if (isTiktokLive && !tiktokImage) problemasDeCampos3.push("Adjunta la captura de evidencia de TikTok Live.");
        if (selectedType.requiereOperacion && !form.operacionId && selectedType.categoria !== "REFERIDO")
            problemasDeCampos3.push("La operación vinculada es obligatoria.");
        if (selectedType.categoria === "CALIFICACION" && (!form.estrellas || form.estrellas < 1 || form.estrellas > 5))
            problemasDeCampos3.push("La calificación debe estar entre 1 y 5 estrellas.");
        if (problemasDeCampos3.length) return notify("validation", oracionValidacion(problemasDeCampos3));

        saveLock.current = true;
        setIsSaving(true);
        const isCurrent = beginRequest();
        const atomicInnovation = (isAtc || isStoreManager || isFacturacion || isPagos || isMarketing) && isInnovation;
        if (atomicInnovation) {
            const payload = JSON.stringify([
                form.idTipoEvento,
                form.idBeneficiario,
                form.fechaEvento.slice(0, 10),
                form.titulo.trim(),
                form.descripcion.trim(),
            ]);
            if (pendingInnovation.current?.payload !== payload) pendingInnovation.current = { payload, key: crypto.randomUUID() };
        }
        let uploadedAttachment: Awaited<ReturnType<typeof evidenciasService.uploadTiktokEvidence>> | null = null;
        let eventCreated = false;
        try {
            if (isTiktokLive && tiktokImage) uploadedAttachment = await evidenciasService.uploadTiktokEvidence(tiktokImage);
            if (!isCurrent()) return;
            const id = atomicInnovation
                ? await evidenciasService.registerInnovation(form, pendingInnovation.current!.key, sendAfterSave)
                : await evidenciasService.create(
                      isInnovation
                          ? {
                                ...form,
                                titulo: form.titulo.trim(),
                                descripcion: form.descripcion.trim(),
                                fechaEvento: innovacionFechaEvento(form.fechaEvento.slice(0, 10)),
                            }
                          : form,
                      uploadedAttachment,
                  );
            if (!isCurrent()) return;
            eventCreated = true;
            let sent = atomicInnovation && sendAfterSave;
            if (sendAfterSave && !atomicInnovation) {
                try {
                    await evidenciasService.send(id);
                    if (!isCurrent()) return;
                    sent = true;
                } catch (error) {
                    if (!isCurrent()) return;
                    if (!isInnovation) throw error;
                    notify(
                        "error",
                        `Propuesta registrada. No se confirmó el envío; actualiza y revisa su estado en el listado antes de reintentar. ${error instanceof Error ? error.message : ""}`,
                    );
                }
            }
            if (!isCurrent()) return;
            pendingInnovation.current = null;
            if (!sendAfterSave || sent) notify("success", sent ? "Evidencia registrada y enviada a revisión" : "Evidencia guardada como borrador");
            onSave();
            setForm({
                ...emptyForm(),
                idTipoEvento: types[0]?.id ?? 0,
                ...(isInnovation ? { idBeneficiario: ownBeneficiary?.id ?? null, fechaEvento: today("America/Lima").toString() } : {}),
            });
            setTiktokCode("");
            setTiktokOperation(null);
            setTiktokImage(null);
            if (tiktokFileInput.current) tiktokFileInput.current.value = "";
        } catch (error) {
            if (!isCurrent()) return;
            if (uploadedAttachment && !eventCreated) await evidenciasService.removeTiktokEvidence(uploadedAttachment.path).catch(() => undefined);
            notify("error", error instanceof Error ? error.message : "No fue posible registrar la evidencia");
        } finally {
            saveLock.current = false;
            if (isCurrent()) setIsSaving(false);
        }
    };

    const innovationActions = (
        <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
            <Button size="sm" color="secondary" iconLeading={Save01} isDisabled={isSaving} isLoading={isSaving} onClick={() => void handleSave(false)}>
                Borrador
            </Button>
            <Button size="sm" color="primary" iconLeading={Save01} isDisabled={isSaving} isLoading={isSaving} onClick={() => void handleSave(true)}>
                Guardar
            </Button>
            <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={isSaving} onClick={onClose}>
                Cancelar
            </Button>
        </div>
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <CompensacionSurface title={heading} onClose={onClose} busy={isSaving} inline={inline} fullWidth={layeredInline || (inline && isInnovation)}>
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.18 }}
                        className={
                            inline
                                ? layeredInline
                                    ? "min-w-0 rounded-2xl border border-secondary bg-secondary"
                                    : "overflow-hidden rounded-xl border border-secondary bg-primary"
                                : `relative z-10 flex max-h-[92vh] w-full ${isTiktokLive ? "max-w-2xl" : "max-w-3xl"} flex-col overflow-hidden rounded-xl bg-primary shadow-xl`
                        }
                    >
                        <CompensacionDialogHeader title={<>{heading}</>} onClose={inline ? undefined : onClose} busy={isSaving} inline={inline} />
                        <div className={layeredInline ? "relative -mx-px -mt-2 -mb-px rounded-xl border border-secondary bg-primary shadow-xs" : "contents"}>
                            <div
                                className={
                                    layeredInline ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-4" : "min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
                                }
                            >
                                {!isInnovation &&
                                    (!isTiktokLive ||
                                        types.length > 1 ||
                                        !isAdvisor ||
                                        selectedType?.requiereResponsable ||
                                        selectedType?.categoria === "CALIFICACION") && (
                                        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
                                            {types.length > 1 && (
                                                <Select
                                                    label="Tipo"
                                                    placeholder="Selecciona"
                                                    size="sm"
                                                    isRequired
                                                    items={types.map((item) => ({ id: item.id, label: item.nombre }))}
                                                    selectedKey={form.idTipoEvento}
                                                    onSelectionChange={(key) => {
                                                        if (key === null) return;
                                                        setValue("idTipoEvento", Number(key));
                                                        setValue("operacionId", null);
                                                        setTiktokOperation(null);
                                                        setTiktokOperations([]);
                                                        setTiktokSearchDone(false);
                                                        setTiktokCode("");
                                                        setTiktokImage(null);
                                                        if (tiktokFileInput.current) tiktokFileInput.current.value = "";
                                                    }}
                                                >
                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                </Select>
                                            )}
                                            {!isTiktokLive && (
                                                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                                                    <CompensacionDatePicker
                                                        label="Fecha"
                                                        isRequired
                                                        value={form.fechaEvento.slice(0, 10)}
                                                        onChange={(value) => setValue("fechaEvento", `${value}T${form.fechaEvento.slice(11, 16) || "00:00"}`)}
                                                    />
                                                    <Input
                                                        label="Hora"
                                                        size="sm"
                                                        type="time"
                                                        isRequired
                                                        value={form.fechaEvento.slice(11, 16)}
                                                        onChange={(value) => setValue("fechaEvento", `${form.fechaEvento.slice(0, 10)}T${value}`)}
                                                    />
                                                </div>
                                            )}
                                            {isAdvisor && !isTiktokLive && (
                                                <p className="text-sm text-secondary">
                                                    Beneficiario: {ownBeneficiary?.nombreCompleto ?? "Ficha no disponible"}
                                                </p>
                                            )}
                                            {!isAdvisor && (selectedType?.requiereBeneficiario || !selectedType?.requiereResponsable) && (
                                                <Select
                                                    label="Colaborador que recibe el bono"
                                                    placeholder="Selecciona"
                                                    size="sm"
                                                    isRequired={selectedType?.requiereBeneficiario}
                                                    items={[{ id: 0, label: "Sin beneficiario" }, ...collaboratorItems]}
                                                    selectedKey={form.idBeneficiario ?? 0}
                                                    onSelectionChange={(key) => setValue("idBeneficiario", key && Number(key) > 0 ? Number(key) : null)}
                                                >
                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                </Select>
                                            )}
                                            {selectedType?.requiereResponsable && (
                                                <Select
                                                    label="Responsable"
                                                    placeholder="Selecciona"
                                                    size="sm"
                                                    isRequired
                                                    items={collaboratorItems}
                                                    selectedKey={form.idResponsable ?? 0}
                                                    onSelectionChange={(key) => setValue("idResponsable", key ? Number(key) : null)}
                                                >
                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                </Select>
                                            )}
                                            {selectedType?.categoria === "CALIFICACION" && (
                                                <Input
                                                    label="Estrellas"
                                                    size="sm"
                                                    type="number"
                                                    isRequired
                                                    value={form.estrellas?.toString() ?? ""}
                                                    onChange={(value) => setValue("estrellas", value ? Number(value) : null)}
                                                />
                                            )}
                                        </div>
                                    )}
                                {!isTiktokLive &&
                                    (selectedType?.requiereCliente ||
                                        ["CALIFICACION", "LLAMADA", "TARJETA_TERCERO"].includes(selectedType?.categoria ?? "")) && (
                                        <section className="rounded-lg border border-secondary bg-secondary p-4">
                                            <h3 className="text-sm font-semibold text-primary">Cliente relacionado</h3>
                                            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                                <Input
                                                    label="DNI"
                                                    size="sm"
                                                    isRequired={selectedType?.requiereCliente && !isTiktokLive}
                                                    value={form.clienteDocumento}
                                                    onChange={(value) => {
                                                        const dni = value.replace(/\D/g, "").slice(0, 8);
                                                        setValue("clienteDocumento", dni);
                                                        if (isTiktokLive) {
                                                            setTiktokOperation(null);
                                                            setTiktokOperations([]);
                                                            setTiktokSearchDone(false);
                                                            setValue("operacionId", null);
                                                            setTiktokImage(null);
                                                            if (tiktokFileInput.current) tiktokFileInput.current.value = "";
                                                        }
                                                    }}
                                                    hint={
                                                        isClientLoading
                                                            ? "Buscando cliente..."
                                                            : client
                                                              ? `Cliente encontrado: ${client.nombre}`
                                                              : form.clienteDocumento.length === 8
                                                                ? "No se encontró un cliente registrado"
                                                                : undefined
                                                    }
                                                />
                                                <Input
                                                    label="Nombre del cliente"
                                                    size="sm"
                                                    value={form.clienteNombre}
                                                    onChange={(value) => setValue("clienteNombre", value)}
                                                    isDisabled={Boolean(client)}
                                                />
                                            </div>
                                        </section>
                                    )}

                                {isTiktokLive && (
                                    <section className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap">
                                            <Input
                                                label="Nro. Documento"
                                                placeholder="8 dígitos"
                                                className="w-full sm:w-36 sm:shrink-0"
                                                size="sm"
                                                inputMode="numeric"
                                                maxLength={8}
                                                value={form.clienteDocumento}
                                                isDisabled={isSaving || isSearchingTiktok}
                                                onChange={(value) => {
                                                    setValue("clienteDocumento", value.replace(/\D/g, "").slice(0, 8));
                                                    setTiktokOperation(null);
                                                    setTiktokOperations([]);
                                                    setTiktokSearchDone(false);
                                                    setValue("operacionId", null);
                                                    setTiktokImage(null);
                                                    if (tiktokFileInput.current) tiktokFileInput.current.value = "";
                                                }}
                                            />
                                            <Input
                                                label="Operación"
                                                className="w-full sm:min-w-60 sm:flex-1"
                                                size="sm"
                                                maxLength={100}
                                                value={tiktokCode}
                                                isDisabled={isSaving || isSearchingTiktok}
                                                onChange={(value) => {
                                                    setTiktokCode(value);
                                                    setTiktokOperation(null);
                                                    setTiktokOperations([]);
                                                    setTiktokSearchDone(false);
                                                    setValue("operacionId", null);
                                                    setTiktokImage(null);
                                                    if (tiktokFileInput.current) tiktokFileInput.current.value = "";
                                                }}
                                            />
                                            <Button
                                                size="sm"
                                                color="primary"
                                                iconLeading={SearchLg}
                                                className="ml-auto shrink-0"
                                                isDisabled={isSaving || isSearchingTiktok}
                                                isLoading={isSearchingTiktok}
                                                onClick={() => void searchTiktokOperation()}
                                            >
                                                Buscar operación pagada
                                            </Button>
                                        </div>
                                        <p className="text-xs text-tertiary">
                                            Usa DNI, código o ambos. La operación final debe pagarse dentro de las 168 horas siguientes al registro del cliente.
                                        </p>
                                        {tiktokSearchDone && !tiktokOperations.length && (
                                            <p role="status" className="text-sm text-tertiary">
                                                No hay operaciones pagadas que coincidan con la búsqueda.
                                            </p>
                                        )}
                                        {tiktokOperations.map((operation) => (
                                            <article key={operation.id} className="space-y-2 rounded-lg border border-secondary bg-primary p-3">
                                                <p className="text-sm font-semibold text-primary">
                                                    {operation.codigo} · {operation.servicio}
                                                </p>
                                                <div className="text-xs">
                                                    <p className="font-medium text-primary">{operation.cliente}</p>
                                                    <p className="text-tertiary">DNI {operation.dni}</p>
                                                </div>
                                                <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-xs text-tertiary">
                                                    <span>
                                                        {new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(operation.monto)}
                                                    </span>
                                                    <div>
                                                        <p>Pagada</p>
                                                        {operation.fecha_deposito ? (
                                                            <CompensacionFechaCell value={operation.fecha_deposito} />
                                                        ) : (
                                                            "Sin fecha de depósito"
                                                        )}
                                                    </div>
                                                </div>
                                                {operation.elegible ? (
                                                    <Button
                                                        size="xs"
                                                        color={tiktokOperation?.id === operation.id ? "primary" : "secondary"}
                                                        isDisabled={isSaving}
                                                        onClick={() => selectTiktokOperation(operation)}
                                                    >
                                                        {tiktokOperation?.id === operation.id ? "Operación seleccionada" : "Usar esta operación"}
                                                    </Button>
                                                ) : (
                                                    <p className="text-xs text-warning-primary">
                                                        {operation.motivo || "No elegible para el bono TikTok Live."}
                                                    </p>
                                                )}
                                            </article>
                                        ))}
                                        {tiktokOperation && (
                                            <div className="space-y-3 rounded-lg border border-secondary bg-secondary p-4">
                                                <p className="text-sm font-semibold text-primary">Evidencia de TikTok Live · {tiktokOperation.codigo}</p>
                                                <input
                                                    ref={tiktokFileInput}
                                                    className="sr-only"
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp"
                                                    aria-label="Adjuntar imagen de TikTok Live"
                                                    disabled={isSaving || !tiktokOperation?.elegible}
                                                    onChange={(event) => {
                                                        const file = event.currentTarget.files?.[0] ?? null;
                                                        if (!file) return;
                                                        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                                                            setTiktokImage(null);
                                                            event.currentTarget.value = "";
                                                            return notify("validation", "La evidencia debe ser una imagen JPG, PNG o WEBP.");
                                                        }
                                                        if (file.size > 5 * 1024 * 1024) {
                                                            setTiktokImage(null);
                                                            event.currentTarget.value = "";
                                                            return notify("validation", "La imagen debe pesar hasta 5 MB.");
                                                        }
                                                        setTiktokImage(file);
                                                    }}
                                                />
                                                <Button
                                                    size="sm"
                                                    color="secondary"
                                                    iconLeading={UploadCloud02}
                                                    isDisabled={isSaving || !tiktokOperation?.elegible}
                                                    onClick={() => tiktokFileInput.current?.click()}
                                                >
                                                    {tiktokImage ? "Cambiar imagen" : "Adjuntar evidencia"}
                                                </Button>
                                                {tiktokImage && (
                                                    <div className="flex items-start gap-3 rounded-lg border border-secondary bg-primary p-3">
                                                        {tiktokImagePreview && (
                                                            <img
                                                                className="size-16 rounded-md border border-secondary object-cover"
                                                                src={tiktokImagePreview}
                                                                alt="Vista previa de la evidencia de TikTok Live"
                                                            />
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-sm font-medium text-primary">{tiktokImage.name}</p>
                                                            <p className="text-xs text-tertiary">
                                                                {(tiktokImage.size / (1024 * 1024)).toFixed(2)} MB · se almacena de forma privada
                                                            </p>
                                                        </div>
                                                        <ButtonUtility
                                                            size="xs"
                                                            color="tertiary"
                                                            icon={X}
                                                            tooltip="Quitar imagen adjunta"
                                                            className={compensationTableActionClass}
                                                            isDisabled={isSaving}
                                                            onClick={() => {
                                                                setTiktokImage(null);
                                                                if (tiktokFileInput.current) tiktokFileInput.current.value = "";
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </section>
                                )}
                                {selectedType?.requiereOperacion && selectedType.categoria !== "REFERIDO" && !isTiktokLive && (
                                    <Input
                                        label="Código de operación"
                                        size="sm"
                                        type="number"
                                        isRequired
                                        value={form.operacionId?.toString() ?? ""}
                                        onChange={(value) => setValue("operacionId", value ? Number(value) : null)}
                                    />
                                )}
                                {!isTiktokLive && (
                                    <section className={isInnovation ? "min-w-0" : "rounded-lg border border-secondary p-3"}>
                                        {!isInnovation && <h3 className="text-sm font-semibold text-primary">Notas y sustento adicional</h3>}
                                        <div
                                            className={
                                                isInnovation
                                                    ? inline
                                                        ? "flex flex-wrap items-end gap-3 [&_label]:whitespace-nowrap"
                                                        : "grid items-start gap-3 sm:grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_11rem] [&>div]:min-w-0"
                                                    : "mt-3 grid gap-3 sm:grid-cols-2"
                                            }
                                        >
                                            <Input
                                                label="Título"
                                                className={inline && isInnovation ? "w-full sm:min-w-40 sm:flex-1" : undefined}
                                                isRequired={isInnovation}
                                                size="sm"
                                                placeholder={isInnovation ? "Nombre de tu propuesta" : "Resumen breve del evento"}
                                                value={form.titulo}
                                                onChange={(value) => setValue("titulo", value)}
                                            />
                                            <div className={isInnovation ? (inline ? "w-full min-w-0 sm:min-w-32 sm:flex-[1.5]" : "min-w-0") : "sm:col-span-2"}>
                                                <CompensacionNoteField
                                                    label="Descripción"
                                                    isRequired={isInnovation}
                                                    value={form.descripcion}
                                                    onChange={(value) => setValue("descripcion", value)}
                                                    placeholder={
                                                        isInnovation
                                                            ? "Describe tu idea, qué mejora y cómo se podría aplicar"
                                                            : "Contexto necesario para que el revisor tome una decisión"
                                                    }
                                                />
                                            </div>
                                            {isInnovation && (
                                                <CompensacionDatePicker
                                                    label="Fecha"
                                                    className={inline ? "w-full sm:w-40 sm:shrink-0" : undefined}
                                                    isRequired
                                                    value={form.fechaEvento.slice(0, 10)}
                                                    onChange={(value) => setValue("fechaEvento", value)}
                                                />
                                            )}
                                            {inline && isInnovation && innovationActions}
                                        </div>
                                    </section>
                                )}
                            </div>
                            {!(inline && isInnovation) && (
                                <div
                                    className={
                                        layeredInline
                                            ? "flex flex-wrap justify-end gap-2 px-4 pb-4 sm:px-5"
                                            : "flex flex-wrap justify-end gap-2 border-t border-secondary px-4 py-3 sm:px-5"
                                    }
                                >
                                    {!inline && (
                                        <Button size="sm" color="secondary" iconLeading={X} isDisabled={isSaving} onClick={onClose}>
                                            Cancelar
                                        </Button>
                                    )}
                                    {isTiktokLive ? (
                                        <Button
                                            size="sm"
                                            color="primary"
                                            iconLeading={Send01}
                                            isDisabled={isSaving || !tiktokOperation?.elegible || !tiktokImage}
                                            isLoading={isSaving}
                                            onClick={() => void handleSave(true)}
                                        >
                                            Registrar esta operación
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                size="sm"
                                                color="secondary"
                                                iconLeading={isInnovation ? Save01 : Check}
                                                isLoading={isSaving}
                                                onClick={() => void handleSave(false)}
                                            >
                                                {isInnovation ? "Borrador" : "Guardar borrador"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                color="primary"
                                                iconLeading={isInnovation ? Save01 : Send01}
                                                isLoading={isSaving}
                                                onClick={() => void handleSave(true)}
                                            >
                                                {isInnovation ? "Guardar" : "Guardar y enviar"}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </CompensacionSurface>
            )}
        </AnimatePresence>
    );
};
