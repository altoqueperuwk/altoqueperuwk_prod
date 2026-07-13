import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { codigoServicioService } from "@/services/codigo-servicio.service";
import { comunidadService } from "@/services/comunidad.service";
import { estadoService } from "@/services/estado.service";
import { InlineFormCard } from "@/features/operaciones/efectivizacion/shared/components/inline-form-card";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionRutaBancaria,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { cx } from "@/utils/cx";

interface BancariaInlineFormsProps {
    activeCompany: RutaOperacionCaja | null;
    activeCompanyCajas: RutaOperacionCaja[];
    onSaved: () => void;
    ruta: OperacionRutaBancaria;
}

interface CatalogItem {
    id: number;
    nombre: string;
    tipo?: string;
}

const getCajaSelectionKey = (caja: RutaOperacionCaja) => String(caja.id_caja ?? caja.id_empresa_cuenta_bancaria);

const Field = ({ children, className, label }: { children: ReactNode; className?: string; label: string }) => (
    <label className={cx("flex min-w-0 flex-col gap-1", className)}>
        <span className="text-sm font-normal leading-5 text-primary">{label}</span>
        {children}
    </label>
);

const compactControlClass =
    "h-8 w-full rounded-lg border border-primary bg-primary px-3 text-sm font-normal text-primary outline-hidden transition duration-100 placeholder:text-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60";

const CompactInput = ({
    disabled,
    onChange,
    placeholder,
    type = "text",
    value,
}: {
    disabled?: boolean;
    onChange?: (value: string) => void;
    placeholder?: string;
    type?: string;
    value: string;
}) => (
    <input
        className={compactControlClass}
        disabled={disabled}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
    />
);

const CompactSelect = ({
    onChange,
    options,
    value,
}: {
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
    value: string;
}) => (
    <select className={cx(compactControlClass, "appearance-none")} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
            <option key={option.value} value={option.value}>
                {option.label}
            </option>
        ))}
    </select>
);

const SegmentedControl = ({
    className,
    onChange,
    options,
    selectedKey,
}: {
    className?: string;
    onChange?: (key: string) => void;
    options: { label: string; value: string }[];
    selectedKey?: string;
}) => {
    if (!options.length) return null;

    return (
        <div className={cx("inline-grid h-9 grid-flow-col overflow-hidden rounded-xl border border-primary bg-primary", className)}>
            {options.map((option) => {
                const isSelected = option.value === selectedKey;

                return (
                    <button
                        key={option.value}
                        type="button"
                        className={cx(
                            "flex min-w-16 items-center justify-center px-4 text-center text-sm font-normal text-primary transition duration-100",
                            "border-l border-primary first:border-l-0",
                            isSelected && "bg-secondary shadow-xs",
                        )}
                        onClick={() => onChange?.(option.value)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};

const FormActions = ({
    isSaving,
    onCancel,
    onSave,
}: {
    isSaving: boolean;
    onCancel: () => void;
    onSave: () => void;
}) => (
    <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
        <button
            type="button"
            className="h-8 rounded-lg border border-primary bg-primary px-3 text-sm font-normal text-primary transition duration-100 hover:bg-primary_hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={onSave}
        >
            {isSaving ? "Guardando..." : "Guardar"}
        </button>
        <button
            type="button"
            className="h-8 rounded-lg border border-primary bg-primary px-3 text-sm font-normal text-primary transition duration-100 hover:bg-primary_hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            onClick={onCancel}
        >
            Cancelar
        </button>
    </div>
);

const cuentaOptions = (cajas: RutaOperacionCaja[]) =>
    cajas.map((caja) => ({
        label: caja.nombre_banco,
        value: getCajaSelectionKey(caja),
    }));

const CuentaTabs = ({
    cajas,
    onChange,
    selectedKey,
}: {
    cajas: RutaOperacionCaja[];
    onChange?: (key: string) => void;
    selectedKey?: string;
}) => {
    if (!cajas.length) return null;

    return <SegmentedControl options={cuentaOptions(cajas)} selectedKey={selectedKey ?? getCajaSelectionKey(cajas[0])} onChange={onChange} />;
};

export const BancariaInlineForms = ({ activeCompany, activeCompanyCajas, onSaved, ruta }: BancariaInlineFormsProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [transferOriginKey, setTransferOriginKey] = useState("");
    const [transferDestinationKey, setTransferDestinationKey] = useState("");
    const [transferAmount, setTransferAmount] = useState("");
    const [isSavingTransfer, setIsSavingTransfer] = useState(false);
    const [movementType, setMovementType] = useState<"Ingreso" | "Salida">("Ingreso");
    const [movementAccountKey, setMovementAccountKey] = useState("");
    const [movementAmount, setMovementAmount] = useState("");
    const [movementConcept, setMovementConcept] = useState("");
    const [isSavingMovement, setIsSavingMovement] = useState(false);
    const [manualCode, setManualCode] = useState("");
    const [manualDni, setManualDni] = useState("");
    const [manualAmount, setManualAmount] = useState("");
    const [manualCommunityId, setManualCommunityId] = useState("");
    const [isSavingManual, setIsSavingManual] = useState(false);
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [codigoEfectivizacion, setCodigoEfectivizacion] = useState<CatalogItem | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<CatalogItem | null>(null);

    const companyName = activeCompany?.nombre_empresa ?? "Empresa";
    const firstCuenta = activeCompanyCajas[0];
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const transferOrigin = activeCompanyCajas.find((caja) => getCajaSelectionKey(caja) === transferOriginKey) ?? firstCuenta ?? null;
    const transferDestination = activeCompanyCajas.find((caja) => getCajaSelectionKey(caja) === transferDestinationKey) ?? null;
    const movementAccount = activeCompanyCajas.find((caja) => getCajaSelectionKey(caja) === movementAccountKey) ?? firstCuenta ?? null;
    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === manualCommunityId) ?? null,
        [comunidades, manualCommunityId],
    );

    useEffect(() => {
        const first = activeCompanyCajas[0];
        const second = activeCompanyCajas[1];

        setTransferOriginKey(first ? getCajaSelectionKey(first) : "");
        setTransferDestinationKey(second ? getCajaSelectionKey(second) : "");
        setMovementAccountKey(first ? getCajaSelectionKey(first) : "");
    }, [activeCompanyCajas]);

    useEffect(() => {
        let ignore = false;

        Promise.all([
            comunidadService.getList({ p_id_estado: 1 }),
            codigoServicioService.getList({ p_id_estado: 1 }),
            estadoService.getList({}),
        ])
            .then(([comunidadRows, codigoRows, estadoRows]) => {
                if (ignore) return;

                const comunidadItems = comunidadRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));
                const codigoItems = codigoRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                    tipo: String(row.tipo ?? ""),
                }));
                const estadoItems = estadoRows.map((row) => ({
                    id: Number(row.id),
                    nombre: String(row.nombre ?? ""),
                }));

                setComunidades(comunidadItems);
                setCodigoEfectivizacion(
                    codigoItems.find((item) => item.tipo?.toUpperCase() === "EFECTIVIZACION") ??
                        codigoItems.find((item) => item.nombre.toUpperCase().includes("EFECTIVIZACION")) ??
                        null,
                );
                setEstadoPendiente(estadoItems.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ?? null);

                if (!manualCommunityId && comunidadItems[0]) {
                    setManualCommunityId(String(comunidadItems[0].id));
                }
            })
            .catch(() => addToast("error", "Error al cargar catálogos de operación."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

    const handleSaveTransfer = async () => {
        const amount = Number(transferAmount.replace(",", "."));

        if (!transferOrigin?.id_caja) {
            addToast("error", "La cuenta origen no tiene caja configurada.");
            return;
        }

        if (!transferDestination?.id_caja) {
            addToast("error", "Selecciona una cuenta destino con caja configurada.");
            return;
        }

        if (transferOrigin.id_caja === transferDestination.id_caja) {
            addToast("error", "La cuenta origen y destino no pueden ser la misma.");
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        setIsSavingTransfer(true);

        try {
            await operacionesRpcService.postTransferenciaCaja({
                p_id_caja_origen: transferOrigin.id_caja,
                p_id_caja_destino: transferDestination.id_caja,
                p_monto: amount,
                p_detalle: `Mover saldo ${companyName}`,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
            });
            await operacionesRpcService.syncRutaKpiCaja(ruta, userId);
            setTransferAmount("");
            onSaved();
            addToast("success", "Saldo movido correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al mover saldo.";
            addToast("error", message);
        } finally {
            setIsSavingTransfer(false);
        }
    };

    const handleSaveMovement = async () => {
        const amount = Number(movementAmount.replace(",", "."));

        if (!movementAccount?.id_caja) {
            addToast("error", "La cuenta seleccionada no tiene caja configurada.");
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        if (!movementConcept.trim()) {
            addToast("error", "El concepto es obligatorio.");
            return;
        }

        setIsSavingMovement(true);

        try {
            await operacionesRpcService.postMovimientoCaja({
                p_id_caja: movementAccount.id_caja,
                p_tipo_origen: "MANUAL",
                p_tipo_movimiento: movementType.toUpperCase(),
                p_detalle: movementConcept.trim(),
                p_monto_ingreso: movementType === "Ingreso" ? amount : 0,
                p_monto_salida: movementType === "Salida" ? amount : 0,
                p_flag_contabiliza_operacion: false,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
            });
            await operacionesRpcService.syncRutaKpiCaja(ruta, userId);
            setMovementAmount("");
            setMovementConcept("");
            onSaved();
            addToast("success", "Movimiento registrado correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar el movimiento.";
            addToast("error", message);
        } finally {
            setIsSavingMovement(false);
        }
    };

    const handleSaveManualOperation = async () => {
        const amount = Number(manualAmount.replace(",", "."));

        if (!codigoEfectivizacion) {
            addToast("error", "No se encontró el servicio de efectivización.");
            return;
        }

        if (!estadoPendiente) {
            addToast("error", "No se encontró el estado Pendiente.");
            return;
        }

        if (!activeCompany) {
            addToast("error", "Selecciona una empresa antes de registrar la operación.");
            return;
        }

        if (!selectedCommunity) {
            addToast("error", "La comunidad es obligatoria.");
            return;
        }

        if (!manualCode.trim()) {
            addToast("error", "El código de operación es obligatorio.");
            return;
        }

        if (!manualDni.trim()) {
            addToast("error", "El DNI es obligatorio.");
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        setIsSavingManual(true);

        try {
            const now = new Date().toISOString();
            const result = await operacionesRpcService.postOperacionProceso({
                p_id_codigo_servicio: codigoEfectivizacion.id,
                p_nombre_codigo_servicio: codigoEfectivizacion.nombre,
                p_tipo_servicio: "EFECTIVIZACION",
                p_id_comunidad: selectedCommunity.id,
                p_nombre_comunidad: selectedCommunity.nombre,
                p_dni_cliente: manualDni.trim(),
                p_monto_deposito_cliente: amount,
                p_monto_transferencia_cliente: amount,
                p_codigo_operacion_deposito_cliente: manualCode.trim(),
                p_fecha_deposito_cliente: now,
                p_id_empresa_ingreso: activeCompany.id_empresa,
                p_nombre_empresa_ingreso: activeCompany.nombre_empresa,
                p_id_estado: estadoPendiente.id,
                p_nombre_estado: estadoPendiente.nombre,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
                p_ruta_actual: ruta,
                p_fecha_pendiente: now,
            });

            if (result && "error" in result) {
                throw new Error(String((result as Record<string, unknown>).error));
            }

            setManualCode("");
            setManualDni("");
            setManualAmount("");
            onSaved();
            addToast("success", "Operación registrada correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar la operación.";
            addToast("error", message);
        } finally {
            setIsSavingManual(false);
        }
    };

    return (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <InlineFormCard
                title={`Mover Saldo: ${companyName}`}
                actions={<CuentaTabs cajas={activeCompanyCajas} selectedKey={transferOriginKey} onChange={setTransferOriginKey} />}
            >
                <div className="flex min-h-36 flex-col">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Empresa">
                            <CompactInput disabled value={companyName} />
                        </Field>
                        <Field label="Cuenta">
                            <CompactSelect options={cuentaOptions(activeCompanyCajas)} value={transferDestinationKey} onChange={setTransferDestinationKey} />
                        </Field>
                        <Field className="col-span-1" label="Monto a Depositar">
                            <CompactInput placeholder="S/ 0.00" value={transferAmount} onChange={setTransferAmount} />
                        </Field>
                    </div>
                    <FormActions isSaving={isSavingTransfer} onCancel={() => setTransferAmount("")} onSave={handleSaveTransfer} />
                </div>
            </InlineFormCard>

            <InlineFormCard
                title={`Ingreso y Salidas: ${companyName}`}
                actions={<CuentaTabs cajas={activeCompanyCajas} selectedKey={movementAccountKey} onChange={setMovementAccountKey} />}
            >
                <div className="flex min-h-36 flex-col">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Movimiento">
                            <SegmentedControl
                                className="w-full grid-cols-2 rounded-lg"
                                options={[
                                    { label: "Ingreso", value: "Ingreso" },
                                    { label: "Salida", value: "Salida" },
                                ]}
                                selectedKey={movementType}
                                onChange={(key) => setMovementType(key as "Ingreso" | "Salida")}
                            />
                        </Field>
                        <Field label="Monto">
                            <CompactInput placeholder="S/ 0.00" value={movementAmount} onChange={setMovementAmount} />
                        </Field>
                        <Field className="col-span-2" label="Concepto">
                            <CompactInput value={movementConcept} onChange={setMovementConcept} />
                        </Field>
                    </div>
                    <FormActions
                        isSaving={isSavingMovement}
                        onCancel={() => {
                            setMovementAmount("");
                            setMovementConcept("");
                        }}
                        onSave={handleSaveMovement}
                    />
                </div>
            </InlineFormCard>

            <InlineFormCard title={`Operacion Efectivizacion: ${companyName}`} actions={<CuentaTabs cajas={activeCompanyCajas} />}>
                <div className="flex min-h-36 flex-col">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Codigo Operacion">
                            <CompactInput value={manualCode} onChange={setManualCode} />
                        </Field>
                        <Field label="DNI">
                            <CompactInput value={manualDni} onChange={setManualDni} />
                        </Field>
                        <Field label="Monto">
                            <CompactInput placeholder="S/ 0.00" value={manualAmount} onChange={setManualAmount} />
                        </Field>
                        <Field label="Comunidad">
                            <CompactSelect
                                options={comunidades.map((item) => ({ label: item.nombre, value: String(item.id) }))}
                                value={manualCommunityId}
                                onChange={setManualCommunityId}
                            />
                        </Field>
                    </div>
                    <FormActions
                        isSaving={isSavingManual}
                        onCancel={() => {
                            setManualCode("");
                            setManualDni("");
                            setManualAmount("");
                        }}
                        onSave={handleSaveManualOperation}
                    />
                </div>
            </InlineFormCard>
        </section>
    );
};
