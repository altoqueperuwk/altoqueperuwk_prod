import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { codigoServicioService } from "@/services/codigo-servicio.service";
import { comunidadService } from "@/services/comunidad.service";
import { empresaCuentaBancariaService } from "@/services/empresa-cuenta-bancaria.service";
import { estadoService } from "@/services/estado.service";
import { InlineFormCard } from "@/features/operaciones/efectivizacion/shared/components/inline-form-card";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    CajaOperativa,
    OperacionRutaBancaria,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { findCodigoServicioForRuta } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { cx } from "@/utils/cx";

interface BancariaInlineFormsProps {
    activeCompany: RutaOperacionCaja | null;
    activeCompanyCajas: RutaOperacionCaja[];
    routeCajas: RutaOperacionCaja[];
    onSaved: () => void;
    ruta: OperacionRutaBancaria;
}

interface CatalogItem {
    id: number;
    nombre: string;
    tipo?: string;
}

interface EmpresaCuentaActiva {
    id: number;
    id_empresa: number;
    empresa_nombre: string;
    id_banco: number;
    banco_nombre: string;
}

const getCajaSelectionKey = (caja: RutaOperacionCaja) => String(caja.id_caja ?? caja.id_empresa_cuenta_bancaria);

const Field = ({ children, className, label }: { children: ReactNode; className?: string; label: string }) => (
    <label className={cx("flex min-w-0 flex-col gap-1", className)}>
        <span className="text-sm font-normal leading-5 text-primary">{label}</span>
        {children}
    </label>
);

const CompactInput = ({
    disabled,
    inputClassName,
    onChange,
    placeholder,
    type = "text",
    value,
}: {
    disabled?: boolean;
    inputClassName?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    type?: string;
    value: string;
}) => (
    <Input
        className="w-full"
        inputClassName={cx("text-sm", inputClassName)}
        isDisabled={disabled}
        placeholder={placeholder}
        size="sm"
        type={type}
        value={value}
        onChange={onChange}
    />
);

const CompactSelect = ({
    disabled,
    onChange,
    options,
    selectClassName,
    value,
}: {
    disabled?: boolean;
    onChange: (value: string) => void;
    options: { label: string; value: string }[];
    selectClassName?: string;
    value: string;
}) => (
    <NativeSelect
        className="w-full"
        disabled={disabled}
        options={options}
        selectClassName={cx("w-full font-normal", selectClassName)}
        size="sm"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
    />
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
        <ButtonGroup
            className={cx("grid w-full grid-flow-col [&>*]:w-full [&>*]:justify-center", className)}
            selectedKeys={selectedKey ? [selectedKey] : []}
            size="sm"
            onSelectionChange={(keys) => {
                const next = Array.from(keys)[0];
                if (next) onChange?.(String(next));
            }}
        >
            {options.map((option) => {
                return (
                    <ButtonGroupItem
                        id={option.value}
                        key={option.value}
                    >
                        {option.label}
                    </ButtonGroupItem>
                );
            })}
        </ButtonGroup>
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
        <Button
            type="button"
            color="primary"
            iconLeading={Save01}
            isDisabled={isSaving}
            isLoading={isSaving}
            showTextWhileLoading
            size="sm"
            onClick={onSave}
        >
            {isSaving ? "Guardando..." : "Guardar"}
        </Button>
        <Button
            type="button"
            color="secondary"
            iconLeading={XClose}
            isDisabled={isSaving}
            size="sm"
            onClick={onCancel}
        >
            Cancelar
        </Button>
    </div>
);

const cuentaOptions = (cajas: RutaOperacionCaja[]) =>
    cajas.map((caja) => ({
        label: caja.nombre_banco,
        value: getCajaSelectionKey(caja),
    }));

export const BancariaInlineForms = ({ activeCompany, activeCompanyCajas, routeCajas, onSaved, ruta }: BancariaInlineFormsProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [transferOriginKey, setTransferOriginKey] = useState("");
    const [transferDestinationCompanyId, setTransferDestinationCompanyId] = useState("");
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
    const [codigoItems, setCodigoItems] = useState<CatalogItem[]>([]);
    const [estadoPendiente, setEstadoPendiente] = useState<CatalogItem | null>(null);
    const [cuentasActivas, setCuentasActivas] = useState<EmpresaCuentaActiva[]>([]);
    const [cajasOperativas, setCajasOperativas] = useState<CajaOperativa[]>([]);

    const companyName = activeCompany?.nombre_empresa ?? "Empresa";
    const firstCuenta = activeCompanyCajas[0];
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const transferOrigin = activeCompanyCajas.find((caja) => getCajaSelectionKey(caja) === transferOriginKey) ?? firstCuenta ?? null;
    const transferCompanies = useMemo(() => {
        const byId = new Map<number, { label: string; value: string }>();
        cuentasActivas.forEach((cuenta) => {
            if (!byId.has(cuenta.id_empresa)) {
                byId.set(cuenta.id_empresa, { label: cuenta.empresa_nombre, value: String(cuenta.id_empresa) });
            }
        });

        return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [cuentasActivas]);
    const transferDestinationAccounts = useMemo(
        () =>
            cuentasActivas
                .filter((cuenta) => String(cuenta.id_empresa) === transferDestinationCompanyId)
                .sort((a, b) => a.banco_nombre.localeCompare(b.banco_nombre)),
        [cuentasActivas, transferDestinationCompanyId],
    );
    const transferDestinationAccount = transferDestinationAccounts.find((cuenta) => String(cuenta.id) === transferDestinationKey) ?? null;
    const cajaMap = useMemo(() => {
        const map = new Map<string, CajaOperativa>();
        cajasOperativas.forEach((caja) => {
            map.set(`${caja.id_empresa}-${caja.id_empresa_cuenta_bancaria}`, caja);
        });
        return map;
    }, [cajasOperativas]);
    const transferDestination = transferDestinationAccount
        ? (() => {
              const caja = cajaMap.get(`${transferDestinationAccount.id_empresa}-${transferDestinationAccount.id}`);
              return caja ? { id_caja: caja.id } : null;
          })()
        : null;
    const transferDestinationAccountOptions = transferDestinationAccounts.map((cuenta) => ({
        label: cuenta.banco_nombre,
        value: String(cuenta.id),
    }));
    const movementAccount = activeCompanyCajas.find((caja) => getCajaSelectionKey(caja) === movementAccountKey) ?? firstCuenta ?? null;
    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === manualCommunityId) ?? null,
        [comunidades, manualCommunityId],
    );
    const codigoEfectivizacion = useMemo(() => findCodigoServicioForRuta(codigoItems, ruta), [codigoItems, ruta]);
    const originCuentaOptions = activeCompanyCajas.length ? cuentaOptions(activeCompanyCajas) : [{ label: "Sin cuentas", value: "" }];
    const lockedCuentaName = firstCuenta?.nombre_banco ?? "";
    const placeholderOption = { label: "Seleccionar", value: "" };
    const renderOriginCompanyInput = () => (
        <CompactInput disabled inputClassName="text-center font-semibold text-primary" value={companyName} />
    );

    useEffect(() => {
        const first = activeCompanyCajas[0];

        setTransferOriginKey(first ? getCajaSelectionKey(first) : "");
        setMovementAccountKey(first ? getCajaSelectionKey(first) : "");
    }, [activeCompanyCajas]);

    useEffect(() => {
        setTransferDestinationCompanyId("");
        setTransferDestinationKey("");
    }, [activeCompany?.id_empresa]);

    useEffect(() => {
        setTransferDestinationKey((current) =>
            current && transferDestinationAccounts.some((cuenta) => String(cuenta.id) === current) ? current : "",
        );
    }, [transferDestinationAccounts]);

    useEffect(() => {
        let ignore = false;

        Promise.all([
            comunidadService.getList({ p_id_estado: 1 }),
            codigoServicioService.getList({ p_id_estado: 1 }),
            estadoService.getList({}),
            empresaCuentaBancariaService.getList({ p_id_estado: 1 }),
            operacionesRpcService.getCajaOperativa({ p_id_estado: 1 }),
        ])
            .then(([comunidadRows, codigoRows, estadoRows, cuentaRows, cajaRows]) => {
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
                const cuentaItems = cuentaRows
                    .map((row) => ({
                        id: Number(row.id),
                        id_empresa: Number(row.id_empresa),
                        empresa_nombre: String(row.empresa_nombre ?? ""),
                        id_banco: Number(row.id_banco),
                        banco_nombre: String(row.banco_nombre ?? ""),
                    }))
                    .filter((cuenta) => cuenta.id && cuenta.id_empresa && cuenta.empresa_nombre && cuenta.banco_nombre);

                setComunidades(comunidadItems);
                setCodigoItems(codigoItems);
                setEstadoPendiente(estadoItems.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ?? null);
                setCuentasActivas(cuentaItems);
                setCajasOperativas((cajaRows ?? []) as CajaOperativa[]);

                if (!manualCommunityId && comunidadItems[0]) {
                    setManualCommunityId(String(comunidadItems[0].id));
                }
            })
            .catch(() => addToast("error", "Error al cargar catálogos de operación."));

        return () => {
            ignore = true;
        };
    }, [addToast, manualCommunityId]);

    const handleSaveTransfer = async () => {
        const amount = Number(transferAmount.replace(",", "."));

        if (!transferOrigin?.id_caja) {
            addToast("error", "La cuenta origen no tiene caja configurada.");
            return;
        }

        if (!transferDestinationAccount) {
            addToast("error", "Selecciona una empresa y cuenta destino.");
            return;
        }

        if (!transferDestination?.id_caja) {
            addToast("error", "La cuenta destino seleccionada no tiene caja operativa configurada.");
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
                p_detalle: `Mover saldo ${companyName} a ${transferDestinationAccount.empresa_nombre}`,
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
                p_tipo_origen: "EFECTIVIZACION",
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
            addToast("error", `No se encontro el codigo de servicio para ${ruta}.`);
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
            <InlineFormCard title="Mover Saldo">
                <div className="flex min-h-64 flex-col">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Empresa">
                            {renderOriginCompanyInput()}
                        </Field>
                        <Field label="Cuenta">
                            <CompactSelect
                                options={originCuentaOptions}
                                selectClassName="text-center font-semibold"
                                value={transferOriginKey}
                                onChange={setTransferOriginKey}
                            />
                        </Field>
                        <Field label="Empresa Destino">
                            <CompactSelect
                                options={[placeholderOption, ...transferCompanies]}
                                selectClassName={transferDestinationCompanyId ? "text-center font-semibold" : "text-center"}
                                value={transferDestinationCompanyId}
                                onChange={setTransferDestinationCompanyId}
                            />
                        </Field>
                        <Field label="Cuenta Destino">
                            <CompactSelect
                                disabled={!transferDestinationCompanyId}
                                options={[placeholderOption, ...transferDestinationAccountOptions]}
                                selectClassName={transferDestinationKey ? "text-center font-semibold" : "text-center"}
                                value={transferDestinationKey}
                                onChange={setTransferDestinationKey}
                            />
                        </Field>
                        <Field className="col-span-1" label="Monto a Depositar">
                            <CompactInput placeholder="S/ 0.00" value={transferAmount} onChange={setTransferAmount} />
                        </Field>
                    </div>
                    <FormActions isSaving={isSavingTransfer} onCancel={() => setTransferAmount("")} onSave={handleSaveTransfer} />
                </div>
            </InlineFormCard>

            <InlineFormCard title="Ingreso y Salidas">
                <div className="flex min-h-64 flex-col">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Empresa">
                            {renderOriginCompanyInput()}
                        </Field>
                        <Field label="Cuenta">
                            <CompactSelect
                                options={originCuentaOptions}
                                selectClassName="text-center font-semibold"
                                value={movementAccountKey}
                                onChange={setMovementAccountKey}
                            />
                        </Field>
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

            <InlineFormCard title="Operacion Efectivizacion">
                <div className="flex min-h-64 flex-col">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Empresa">
                            {renderOriginCompanyInput()}
                        </Field>
                        <Field label="Cuenta">
                            <CompactInput disabled inputClassName="text-center font-semibold text-primary" value={lockedCuentaName} />
                        </Field>
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
