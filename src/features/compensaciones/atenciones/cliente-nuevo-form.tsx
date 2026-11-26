import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { ValidationAlert } from "@/components/shared/validation-alert";
import { useSessionCache } from "@/providers/session-cache-provider";
import { CompensacionDialogFooter, CompensacionDialogHeader } from "../shared/compensacion-dialog-chrome";
import { oracionValidacion, soloDigitos } from "../shared/compensacion-validacion";
import { canEditCliente } from "./cliente-nuevo-eligibility";
import { type ClienteNuevo, clientesNuevosService } from "./clientes-nuevos.service";

const existsMessages: Record<string, string> = {
    PROPIO: "Este cliente ya está registrado a tu nombre.",
    OTRO_USUARIO: "Este cliente ya pertenece al registro de otro usuario.",
    VENCIDO: "El cliente ya existe y pasó su plazo de siete días.",
};

export const ClienteNuevoForm = ({
    initial,
    onSaved,
    onCancel,
    onBusyChange,
    inline = false,
    registration,
}: {
    initial?: ClienteNuevo;
    onSaved: (date: string) => void;
    onCancel: () => void;
    onBusyChange: (value: boolean) => void;
    inline?: boolean;
    registration?: {
        title: string;
        register: typeof clientesNuevosService.register;
        validate: typeof clientesNuevosService.validate;
        ready: boolean;
        missingDataMessage?: string;
        extra: ReactNode;
        channel?: ReactNode;
        actions?: ReactNode;
    };
}) => {
    const { comunidades } = useSessionCache();
    const [tipo, setTipo] = useState(initial?.tipo_documento ?? 1);
    const [documento, setDocumento] = useState(initial?.documento ?? "");
    const [nombre, setNombre] = useState(initial?.nombre ?? "");
    const [celular, setCelular] = useState(initial?.celular ? String(initial.celular) : "");
    const [comunidad, setComunidad] = useState(initial?.id_comunidad ? String(initial.id_comunidad) : "");
    const defaultCommunityId = comunidades?.find((item) => String(item.nombre).trim().toUpperCase() === "ATK1")?.id;
    useEffect(() => {
        if (!initial && defaultCommunityId != null) setComunidad((current) => current || String(defaultCommunityId));
    }, [initial, defaultCommunityId]);
    const key = `${tipo}:${documento}`;
    const [validation, setValidation] = useState<{ key: string; exists: boolean } | null>(initial ? { key, exists: false } : null);
    const [checking, setChecking] = useState(false),
        [saving, setSaving] = useState(false),
        [error, setError] = useState("");
    const [validationPopup, setValidationPopup] = useState<"available" | "exists" | null>(null);
    const [existsReason, setExistsReason] = useState("");
    const [alertItems, setAlertItems] = useState<string[]>([]);
    const [attempted, setAttempted] = useState(false);
    const closeAlert = useCallback(() => setAlertItems([]), []);
    const documentLength = tipo === 1 ? 8 : 9;
    const generation = useRef(0),
        lock = useRef(false);
    useEffect(
        () => () => {
            ++generation.current;
        },
        [],
    );
    const invalidate = () => {
        ++generation.current;
        setChecking(false);
        setValidation(null);
        setError("");
        setValidationPopup(null);
    };
    const validate = useCallback(async () => {
        if (lock.current) return;
        if (!new RegExp(`^\\d{${tipo === 1 ? 8 : 9}}$`).test(documento)) {
            setError(`El documento requiere ${tipo === 1 ? 8 : 9} dígitos`);
            return;
        }
        const version = ++generation.current;
        setChecking(true);
        setValidation(null);
        setError("");
        try {
            const result = await (registration?.validate ?? clientesNuevosService.validate)(documento, tipo, initial?.id);
            if (typeof result?.existe !== "boolean") throw new Error("No se confirmó la disponibilidad del documento");
            if (version === generation.current) {
                setValidation({ key, exists: result.existe });
                setAlertItems([]);
                setExistsReason(existsMessages[(result as { motivo?: string }).motivo ?? ""] ?? "");
                setValidationPopup(result.existe ? "exists" : "available");
            }
        } catch (cause) {
            if (version === generation.current)
                setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo validar el cliente");
        } finally {
            if (version === generation.current) setChecking(false);
        }
    }, [documento, tipo, key, initial?.id, registration?.validate]);
    useEffect(() => {
        if (!new RegExp(`^\\d{${tipo === 1 ? 8 : 9}}$`).test(documento)) return;
        if (initial && tipo === initial.tipo_documento && documento === initial.documento) return;
        const timer = setTimeout(() => void validate(), 250);
        return () => {
            clearTimeout(timer);
            ++generation.current;
        };
    }, [documento, tipo, initial?.documento, initial?.tipo_documento, validate]);
    const save = async () => {
        if (lock.current) return;
        const issues: string[] = [];
        if (documento.length !== documentLength) issues.push(`el documento necesita ${documentLength} dígitos`);
        else if (checking) issues.push("el documento aún se está validando");
        else if (validation?.key !== key) issues.push("el documento no se pudo validar, reintenta");
        else if (validation.exists) issues.push("el documento ya está registrado");
        if (nombre.trim().length < 3) issues.push("el nombre, al menos 3 letras");
        if (celular && celular.length !== 9) issues.push("el Whatsapp, 9 dígitos");
        const extra = registration && !registration.ready;
        if (extra) issues.push(registration.missingDataMessage ?? "faltan datos del registro");
        if (issues.length || extra) {
            setAttempted(true);
            setAlertItems([oracionValidacion(issues)]);
            return;
        }
        setAlertItems([]);
        if (initial && !canEditCliente(initial)) {
            setError("El cliente ya no admite edición: revisa el vínculo y el plazo de 168 horas");
            return;
        }
        lock.current = true;
        const version = generation.current;
        setSaving(true);
        onBusyChange(true);
        setError("");
        try {
            const result = initial
                ? await clientesNuevosService.update(initial.id, documento, nombre, tipo, celular, comunidad ? Number(comunidad) : null)
                : await (registration?.register ?? clientesNuevosService.register)(documento, nombre, tipo, celular, comunidad ? Number(comunidad) : null);
            if (version === generation.current) onSaved(result.fecha_registro);
        } catch (cause) {
            if (version !== generation.current) return;
            const detail = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "No se pudo guardar el cliente";
            if (/ya existe|pertenece a otro cliente|ya esta registrado|pertenece al registro/i.test(detail)) {
                setExistsReason(detail);
                setValidationPopup("exists");
            } else setError(detail);
            setValidation(null);
        } finally {
            lock.current = false;
            if (version === generation.current) {
                setSaving(false);
                onBusyChange(false);
            }
        }
    };
    const actions = (
        <>
            {error && documento.length === (tipo === 1 ? 8 : 9) && (
                <Button size="sm" color="secondary" isLoading={checking} isDisabled={saving} onClick={() => void validate()}>
                    Reintentar validación
                </Button>
            )}
            {registration?.actions}
            <Button size="sm" color="primary" iconLeading={Save01} isLoading={saving} onClick={() => void save()}>
                Guardar
            </Button>
            <Button size="sm" color="secondary" iconLeading={XClose} isDisabled={saving} onClick={onCancel}>
                Cancelar
            </Button>
        </>
    );
    return (
        <div
            className={
                inline
                    ? "w-full min-w-0 overflow-hidden rounded-2xl border border-secondary bg-primary shadow-xs"
                    : "mx-auto flex w-full max-w-md flex-col overflow-hidden! rounded-xl border border-secondary bg-primary shadow-xl"
            }
        >
            {inline ? (
                <h2 className="border-b border-secondary bg-secondary px-4 py-3 text-xs font-medium text-tertiary">
                    {initial ? "Editar Cliente" : (registration?.title ?? "Registrar Cliente Nuevo")}
                </h2>
            ) : (
                <CompensacionDialogHeader
                    title={initial ? "Editar Cliente" : (registration?.title ?? "Registrar Cliente Nuevo")}
                    onClose={onCancel}
                    busy={saving}
                />
            )}
            <div className={inline ? "space-y-3 p-4" : "min-h-0 flex-1 shrink! space-y-3 overflow-y-auto p-4"}>
                <div className={inline ? "flex flex-wrap items-end gap-3" : "space-y-3"}>
                    <div className={inline ? "contents" : "flex items-end gap-3"}>
                        <Select
                            label="Tipo Doc."
                            size="sm"
                            className={inline ? "w-full shrink-0 sm:w-24" : "w-24 shrink-0"}
                            items={[
                                { id: "1", label: "DNI" },
                                { id: "2", label: "CE" },
                            ]}
                            selectedKey={String(tipo)}
                            isDisabled={saving}
                            onSelectionChange={(value) => {
                                invalidate();
                                setTipo(Number(value));
                                setDocumento("");
                            }}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                        <Input
                            label="Nro. Documento"
                            size="sm"
                            className={inline ? "w-full sm:w-36 sm:shrink-0" : "min-w-0 flex-1"}
                            placeholder={tipo === 1 ? "8 dígitos" : "9 dígitos"}
                            inputMode="numeric"
                            value={documento}
                            maxLength={tipo === 1 ? 8 : 9}
                            isRequired
                            isLoading={checking}
                            isInvalid={attempted && (documento.length !== documentLength || validation?.exists === true)}
                            isDisabled={saving}
                            onChange={(value) => {
                                const next = soloDigitos(value, tipo === 1 ? 8 : 9);
                                if (next !== documento) {
                                    invalidate();
                                    setDocumento(next);
                                }
                            }}
                        />
                    </div>
                    <Input
                        label="Nombre"
                        className={inline ? "w-full sm:min-w-56 sm:flex-1" : undefined}
                        placeholder="Ingrese el nombre"
                        size="sm"
                        value={nombre}
                        maxLength={200}
                        onChange={setNombre}
                        isRequired
                        isInvalid={attempted && nombre.trim().length < 3}
                        isDisabled={saving}
                    />
                    <div className={inline ? "contents" : "grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3"}>
                        <Input
                            label="Whatsapp"
                            className={inline ? "w-full sm:min-w-36 sm:flex-1" : "min-w-0"}
                            placeholder="9 dígitos"
                            size="sm"
                            value={celular}
                            maxLength={9}
                            inputMode="numeric"
                            onChange={(value) => setCelular(soloDigitos(value, 9))}
                            isInvalid={attempted && celular.length > 0 && celular.length !== 9}
                            isDisabled={saving}
                        />
                        <Select
                            label="Comunidad"
                            className={inline ? "w-full sm:min-w-36 sm:flex-1" : "min-w-0"}
                            placeholder="Seleccione una comunidad"
                            size="sm"
                            selectedKey={comunidad || null}
                            items={(comunidades ?? []).map((item) => ({ id: String(item.id), label: String(item.nombre) }))}
                            isDisabled={saving}
                            onSelectionChange={(value) => setComunidad(String(value ?? ""))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    </div>
                    {registration?.channel}
                    {checking && (
                        <p role="status" className="sr-only">
                            Validando documento…
                        </p>
                    )}
                    {inline && <div className="ml-auto flex flex-wrap justify-end gap-2">{actions}</div>}
                </div>
                {registration?.extra}
                <ValidationAlert items={alertItems} onClose={closeAlert} />
                <ValidationAlert tone="error" items={error ? [error] : []} onClose={() => setError("")} />
            </div>
            {!inline && <CompensacionDialogFooter>{actions}</CompensacionDialogFooter>}
            <ValidationAlert
                tone={validationPopup === "available" ? "success" : "validation"}
                items={[
                    validationPopup === "exists"
                        ? existsReason || "El cliente ya existe, revisa el documento."
                        : initial
                          ? "El documento está disponible."
                          : "El cliente es apto para registrar.",
                ]}
                open={validationPopup !== null}
                onClose={() => setValidationPopup(null)}
            />
        </div>
    );
};
