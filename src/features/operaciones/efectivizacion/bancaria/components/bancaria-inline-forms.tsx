import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Save01, XClose } from "@untitledui/icons";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
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
import { CompactBadgeLine } from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import {
    DocumentoInputGroup,
    cleanDocumento,
    getDocumentoValidationMessage,
    type TipoDocumentoOperacion,
} from "@/features/operaciones/efectivizacion/shared/components/documento-input-group";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    CajaOperativa,
    OperacionCajaMovimiento,
    OperacionRutaBancaria,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { sanitizeAmountInput } from "@/features/operaciones/efectivizacion/shared/utils/amount-input";
import { getPeruDateValue } from "@/features/operaciones/efectivizacion/shared/utils/date";
import { findCodigoServicioForRuta } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { formatMovimientoOrigen, formatMovimientoTipo } from "@/features/operaciones/efectivizacion/shared/utils/movement-labels";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import { cx } from "@/utils/cx";

interface BancariaInlineFormsProps {
    activeCajaId: number | null;
    activeCompany: RutaOperacionCaja | null;
    activeCompanyCajas: RutaOperacionCaja[];
    historyDate?: string | null;
    refreshKey?: number;
    routeCajas: RutaOperacionCaja[];
    showMiniMovimientos?: boolean;
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
const excludedTransferCompanyIds = new Set([10, 14, 15, 16]);
const OTHER_COMPANY_VALUE = "__OTRA_EMPRESA__";
const OTHER_ACCOUNT_VALUE = "__OTRA_CUENTA__";
const manualDateRoutes = new Set<OperacionRutaBancaria>(["banbif", "scotiabank"]);

const getLimaTime = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "America/Lima",
    }).formatToParts(date);
    const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";

    return `${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
};

const getManualDepositTimestamp = (dateValue: string) => `${dateValue}T${getLimaTime()}-05:00`;

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
                        className="selected:bg-brand-solid selected:text-primary_on-brand selected:hover:bg-brand-solid_hover selected:hover:text-primary_on-brand"
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
    <div className="grid grid-cols-2 gap-3 pt-3">
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

const getMovimientoMonto = (row: OperacionCajaMovimiento) => {
    const tipo = row.tipo_movimiento?.trim().toUpperCase();
    return tipo === "INGRESO" ? Number(row.monto_ingreso ?? 0) : Number(row.monto_salida ?? 0);
};

const MiniMovimientosTable = ({
    activeCajaId,
    historyDate,
    refreshKey = 0,
}: {
    activeCajaId: number | null;
    historyDate?: string | null;
    refreshKey?: number;
}) => {
    const [rows, setRows] = useState<OperacionCajaMovimiento[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!activeCajaId) {
            setRows([]);
            setError(null);
            return;
        }

        let ignore = false;
        setIsLoading(true);
        setError(null);

        operacionesRpcService
            .getMovimientos({
                p_id_caja: activeCajaId,
                p_fecha_caja_cierre_desde: historyDate ? `${historyDate}T00:00:00` : undefined,
                p_fecha_caja_cierre_hasta: historyDate ? `${historyDate}T23:59:59` : undefined,
            })
            .then((result) => {
                if (ignore) return;
                const visible = ((result ?? []) as OperacionCajaMovimiento[])
                    .filter((row) => (row.nombre_estado ?? "").trim().toUpperCase() !== "RETENIDO")
                    .slice(0, 8);
                setRows(visible);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar movimientos.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [activeCajaId, historyDate, refreshKey]);

    return (
        <div className="overflow-hidden rounded-lg border border-secondary">
            <div className="max-h-[177px] overflow-y-auto overflow-x-auto">
                <table className="w-full min-w-max divide-y divide-secondary">
                    <thead className="sticky top-0 bg-secondary">
                        <tr>
                            {["Origen", "Movimiento", "Monto", "Fecha"].map((label) => (
                                <th key={label} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-tertiary">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary bg-primary">
                        {isLoading ? (
                            Array.from({ length: 3 }).map((_, index) => (
                                <tr key={index}>
                                    <td className="px-3 py-2" colSpan={4}>
                                        <div className="h-4 w-full animate-pulse rounded bg-secondary" />
                                    </td>
                                </tr>
                            ))
                        ) : error ? (
                            <tr>
                                <td className="px-3 py-6 text-center text-sm text-error-primary" colSpan={4}>
                                    {error}
                                </td>
                            </tr>
                        ) : rows.length ? (
                            rows.map((row) => {
                                const tipo = row.tipo_movimiento?.trim().toUpperCase();
                                const isIngreso = tipo === "INGRESO";

                                return (
                                    <tr key={row.id}>
                                        <td className="whitespace-nowrap px-3 py-2 text-sm text-secondary">
                                            <CompactBadgeLine color="brand">{formatMovimientoOrigen(row.tipo_origen)}</CompactBadgeLine>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-sm text-secondary">
                                            <CompactBadgeLine color={isIngreso ? "success" : "error"}>{formatMovimientoTipo(row.tipo_movimiento)}</CompactBadgeLine>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums">
                                            <span className={isIngreso ? "font-medium text-concept-ingreso" : "font-medium text-concept-salida"}>
                                                {formatMoney(getMovimientoMonto(row))}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2 text-sm text-secondary">
                                            {new Date(row.fecha_registro).toLocaleDateString("es-PE")}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td className="px-3 py-8 text-center text-sm text-tertiary" colSpan={4}>
                                    Sin movimientos para esta caja.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const BancariaInlineForms = ({
    activeCajaId,
    activeCompany,
    activeCompanyCajas,
    historyDate = null,
    refreshKey = 0,
    routeCajas,
    showMiniMovimientos = false,
    onSaved,
    ruta,
}: BancariaInlineFormsProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [transferOriginKey, setTransferOriginKey] = useState("");
    const [transferDestinationCompanyId, setTransferDestinationCompanyId] = useState("");
    const [transferDestinationKey, setTransferDestinationKey] = useState("");
    const [transferAmount, setTransferAmount] = useState("");
    const [isSavingTransfer, setIsSavingTransfer] = useState(false);
    const [movementType, setMovementType] = useState<"Ingreso" | "Salida">("Ingreso");
    const [movementDestinationCompanyId, setMovementDestinationCompanyId] = useState(OTHER_COMPANY_VALUE);
    const [movementDestinationKey, setMovementDestinationKey] = useState(OTHER_ACCOUNT_VALUE);
    const [movementAccountKey, setMovementAccountKey] = useState("");
    const [movementAmount, setMovementAmount] = useState("");
    const [movementConcept, setMovementConcept] = useState("");
    const [isSavingMovement, setIsSavingMovement] = useState(false);
    const [manualCode, setManualCode] = useState("");
    const [manualTipoDocumento, setManualTipoDocumento] = useState<TipoDocumentoOperacion>(1);
    const [manualDni, setManualDni] = useState("");
    const [manualAmount, setManualAmount] = useState("");
    const [manualCommunityId, setManualCommunityId] = useState("");
    const [manualDepositDate, setManualDepositDate] = useState(() => getPeruDateValue());
    const [isSavingManual, setIsSavingManual] = useState(false);
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [codigoItems, setCodigoItems] = useState<CatalogItem[]>([]);
    const [estadoPendiente, setEstadoPendiente] = useState<CatalogItem | null>(null);
    const [cuentasActivas, setCuentasActivas] = useState<EmpresaCuentaActiva[]>([]);
    const [cajasOperativas, setCajasOperativas] = useState<CajaOperativa[]>([]);
    const { result: clienteLookup, isLoading: isClienteLoading } = useClienteLookup(manualDni, manualTipoDocumento);
    const previousManualDocumentoRef = useRef<string | null>(null);

    const companyName = activeCompany?.nombre_empresa ?? "Empresa";
    const firstCuenta = activeCompanyCajas[0];
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const transferOrigin = activeCompanyCajas.find((caja) => getCajaSelectionKey(caja) === transferOriginKey) ?? firstCuenta ?? null;
    const cajaMap = useMemo(() => {
        const map = new Map<string, CajaOperativa>();
        cajasOperativas.forEach((caja) => {
            map.set(`${caja.id_empresa}-${caja.id_empresa_cuenta_bancaria}`, caja);
        });
        return map;
    }, [cajasOperativas]);
    const transferDestinationAccountsWithCaja = useMemo(
        () =>
            cuentasActivas.filter((cuenta) => {
                if (excludedTransferCompanyIds.has(cuenta.id_empresa)) return false;
                if (activeCompany?.id_empresa && cuenta.id_empresa === activeCompany.id_empresa) return false;
                const caja = cajaMap.get(`${cuenta.id_empresa}-${cuenta.id}`);
                if (!caja) return false;
                if (transferOrigin?.id_caja && caja.id === transferOrigin.id_caja) return false;
                return true;
            }),
        [activeCompany?.id_empresa, cajaMap, cuentasActivas, transferOrigin?.id_caja],
    );
    const transferCompanies = useMemo(() => {
        const byId = new Map<number, { label: string; value: string }>();
        transferDestinationAccountsWithCaja.forEach((cuenta) => {
            if (!byId.has(cuenta.id_empresa)) {
                byId.set(cuenta.id_empresa, { label: cuenta.empresa_nombre, value: String(cuenta.id_empresa) });
            }
        });

        return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [transferDestinationAccountsWithCaja]);
    const transferDestinationAccounts = useMemo(
        () =>
            transferDestinationAccountsWithCaja
                .filter((cuenta) => String(cuenta.id_empresa) === transferDestinationCompanyId)
                .sort((a, b) => a.banco_nombre.localeCompare(b.banco_nombre)),
        [transferDestinationAccountsWithCaja, transferDestinationCompanyId],
    );
    const transferDestinationAccount = transferDestinationAccounts.find((cuenta) => String(cuenta.id) === transferDestinationKey) ?? null;
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
    const movementDestinationAccounts = useMemo(
        () =>
            transferDestinationAccountsWithCaja
                .filter((cuenta) => String(cuenta.id_empresa) === movementDestinationCompanyId)
                .sort((a, b) => a.banco_nombre.localeCompare(b.banco_nombre)),
        [movementDestinationCompanyId, transferDestinationAccountsWithCaja],
    );
    const movementDestinationAccount =
        movementDestinationAccounts.find((cuenta) => String(cuenta.id) === movementDestinationKey) ?? null;
    const movementMappedAccountOptions = movementDestinationAccounts.map((cuenta) => ({
        label: cuenta.banco_nombre,
        value: String(cuenta.id),
    }));
    const isOtherDestination = movementDestinationCompanyId === OTHER_COMPANY_VALUE;
    const movementDestinationAccountOptions = isOtherDestination
        ? [{ label: "Otra Cuenta", value: OTHER_ACCOUNT_VALUE }]
        : [{ label: "Seleccionar", value: "" }, ...movementMappedAccountOptions];
    const movementCompanyOptions = useMemo(() => {
        const byId = new Map<number, { label: string; value: string }>();
        cuentasActivas.forEach((cuenta) => {
            if (excludedTransferCompanyIds.has(cuenta.id_empresa)) return;
            if (!byId.has(cuenta.id_empresa)) {
                byId.set(cuenta.id_empresa, { label: cuenta.empresa_nombre, value: String(cuenta.id_empresa) });
            }
        });

        return [
            { label: "Otra Empresa", value: OTHER_COMPANY_VALUE },
            ...Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label)),
        ];
    }, [cuentasActivas]);
    const movementAccount = activeCompanyCajas.find((caja) => getCajaSelectionKey(caja) === movementAccountKey) ?? firstCuenta ?? null;
    const selectedCommunity = useMemo(
        () => comunidades.find((item) => String(item.id) === manualCommunityId) ?? null,
        [comunidades, manualCommunityId],
    );
    const codigoEfectivizacion = useMemo(() => findCodigoServicioForRuta(codigoItems, ruta), [codigoItems, ruta]);
    const allowsManualDepositDate = manualDateRoutes.has(ruta);
    const placeholderOption = { label: "Seleccionar", value: "" };

    useEffect(() => {
        setManualDepositDate(getPeruDateValue());
    }, [ruta]);

    useEffect(() => {
        const documentoKey = `${manualTipoDocumento}:${manualDni}`;
        if (previousManualDocumentoRef.current !== null && previousManualDocumentoRef.current !== documentoKey) {
            const defaultCommunity = comunidades[0];
            if (defaultCommunity) setManualCommunityId(String(defaultCommunity.id));
        }
        previousManualDocumentoRef.current = documentoKey;
    }, [comunidades, manualDni, manualTipoDocumento]);

    useEffect(() => {
        if (clienteLookup?.id_comunidad) {
            setManualCommunityId(String(clienteLookup.id_comunidad));
        }
    }, [clienteLookup]);

    useEffect(() => {
        const first = activeCompanyCajas[0];

        setTransferOriginKey(first ? getCajaSelectionKey(first) : "");
        setMovementAccountKey(first ? getCajaSelectionKey(first) : "");
    }, [activeCompanyCajas]);

    useEffect(() => {
        setTransferDestinationCompanyId("");
        setTransferDestinationKey("");
        setMovementDestinationCompanyId(OTHER_COMPANY_VALUE);
        setMovementDestinationKey(OTHER_ACCOUNT_VALUE);
    }, [activeCompany?.id_empresa]);

    useEffect(() => {
        setTransferDestinationCompanyId((current) =>
            current && transferCompanies.some((company) => company.value === current) ? current : "",
        );
    }, [transferCompanies]);

    useEffect(() => {
        setTransferDestinationKey((current) =>
            current && transferDestinationAccounts.some((cuenta) => String(cuenta.id) === current) ? current : "",
        );
    }, [transferDestinationAccounts]);

    useEffect(() => {
        setMovementDestinationCompanyId((current) =>
            current === OTHER_COMPANY_VALUE || movementCompanyOptions.some((company) => company.value === current)
                ? current
                : OTHER_COMPANY_VALUE,
        );
    }, [movementCompanyOptions]);

    useEffect(() => {
        setMovementDestinationKey((current) =>
            isOtherDestination
                ? OTHER_ACCOUNT_VALUE
                : movementDestinationAccounts.some((cuenta) => String(cuenta.id) === current)
                  ? current
                  : "",
        );
    }, [isOtherDestination, movementDestinationAccounts]);

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
            const destinationCompany = movementCompanyOptions.find((option) => option.value === movementDestinationCompanyId)?.label ?? "Otra Empresa";
            const destinationReference = `Destino: ${destinationCompany}`;
            await operacionesRpcService.postMovimientoCaja({
                p_id_caja: movementAccount.id_caja,
                p_tipo_origen: "OTROS",
                p_tipo_movimiento: movementType.toUpperCase(),
                p_detalle: `${movementConcept.trim()} | ${destinationReference}`,
                p_id_banco_tercero: null,
                p_nombre_banco_tercero: null,
                p_monto_ingreso: movementType === "Ingreso" ? amount : 0,
                p_monto_salida: movementType === "Salida" ? amount : 0,
                p_flag_contabiliza_operacion: false,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
            });
            await operacionesRpcService.syncRutaKpiCaja(ruta, userId);
            setMovementDestinationCompanyId(OTHER_COMPANY_VALUE);
            setMovementDestinationKey(OTHER_ACCOUNT_VALUE);
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

        const cleanManualDni = cleanDocumento(manualDni, manualTipoDocumento);
        const documentoError = getDocumentoValidationMessage(cleanManualDni, manualTipoDocumento);

        if (documentoError) {
            addToast("error", documentoError);
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        if (allowsManualDepositDate && !manualDepositDate) {
            addToast("error", "La fecha de depósito es obligatoria.");
            return;
        }

        setIsSavingManual(true);

        try {
            const now = new Date().toISOString();
            const fechaDeposito = allowsManualDepositDate ? getManualDepositTimestamp(manualDepositDate) : now;
            const result = await operacionesRpcService.postOperacionProceso({
                p_id_codigo_servicio: codigoEfectivizacion.id,
                p_nombre_codigo_servicio: codigoEfectivizacion.nombre,
                p_tipo_servicio: "EFECTIVIZACION",
                p_id_comunidad: selectedCommunity.id,
                p_nombre_comunidad: selectedCommunity.nombre,
                p_tipo_documento_cliente: manualTipoDocumento,
                p_dni_cliente: cleanManualDni,
                p_monto_deposito_cliente: amount,
                p_codigo_operacion_deposito_cliente: manualCode.trim(),
                p_fecha_deposito_cliente: fechaDeposito,
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
            setManualTipoDocumento(1);
            setManualDni("");
            setManualAmount("");
            setManualDepositDate(getPeruDateValue());
            onSaved();
            addToast("success", "Operación registrada correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al registrar la operación.";
            addToast("error", message);
        } finally {
            setIsSavingManual(false);
        }
    };

    const activeCajaBadges = (
        <div className="flex max-w-56 flex-wrap justify-end gap-1">
            {[activeCompany?.nombre_empresa ?? "Empresa", activeCompany?.nombre_banco ?? firstCuenta?.nombre_banco ?? "Cuenta"].map((label) => (
                <span
                    key={label}
                    className="max-w-full truncate rounded-md border border-secondary bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-4 text-secondary"
                >
                    {label}
                </span>
            ))}
        </div>
    );

    return (
        <>
            {false && <InlineFormCard title="Mover Saldo" actions={activeCajaBadges}>
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Empresa Destino">
                            <CompactSelect
                                options={[placeholderOption, ...transferCompanies]}
                                selectClassName={transferDestinationCompanyId ? "text-center font-semibold" : "text-center"}
                                value={transferDestinationCompanyId}
                                onChange={setTransferDestinationCompanyId}
                            />
                        </Field>
                        <Field label="Cuenta">
                            <CompactSelect
                                disabled={!transferDestinationCompanyId}
                                options={[placeholderOption, ...transferDestinationAccountOptions]}
                                selectClassName={transferDestinationKey ? "text-center font-semibold" : "text-center"}
                                value={transferDestinationKey}
                                onChange={setTransferDestinationKey}
                            />
                        </Field>
                        <Field className="col-span-1" label="Monto a Depositar">
                            <CompactInput
                                placeholder="S/ 0.00"
                                value={transferAmount}
                                onChange={(value) => setTransferAmount(sanitizeAmountInput(value))}
                            />
                        </Field>
                    </div>
                    <FormActions isSaving={isSavingTransfer} onCancel={() => setTransferAmount("")} onSave={handleSaveTransfer} />
                </div>
            </InlineFormCard>}

            <div className="h-full xl:col-span-2">
                <InlineFormCard className="h-full" title="Ingreso y Salidas" actions={activeCajaBadges}>
                    <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-4">
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
                        <Field label="Empresa">
                            <CompactSelect
                                options={movementCompanyOptions}
                                selectClassName={movementDestinationCompanyId ? "text-center font-semibold" : "text-center"}
                                value={movementDestinationCompanyId}
                                onChange={setMovementDestinationCompanyId}
                            />
                        </Field>
                        <Field label="Monto">
                            <CompactInput
                                placeholder="S/ 0.00"
                                value={movementAmount}
                                onChange={(value) => setMovementAmount(sanitizeAmountInput(value))}
                            />
                        </Field>
                        <Field label="Concepto">
                            <CompactInput value={movementConcept} onChange={setMovementConcept} />
                        </Field>
                    </div>
                    <FormActions
                        isSaving={isSavingMovement}
                        onCancel={() => {
                            setMovementDestinationCompanyId(OTHER_COMPANY_VALUE);
                            setMovementDestinationKey(OTHER_ACCOUNT_VALUE);
                            setMovementAmount("");
                            setMovementConcept("");
                        }}
                        onSave={handleSaveMovement}
                    />
                    </div>
                </InlineFormCard>
            </div>

            <div className="h-full xl:col-span-2">
                {showMiniMovimientos ? (
                    <InlineFormCard title="Movimientos" actions={activeCajaBadges}>
                        <MiniMovimientosTable activeCajaId={activeCajaId} historyDate={historyDate} refreshKey={refreshKey} />
                    </InlineFormCard>
                ) : (
                    <InlineFormCard title="Operacion Efectivizacion" actions={activeCajaBadges}>
                        <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Codigo Operacion">
                                <CompactInput value={manualCode} onChange={setManualCode} />
                            </Field>
                            <Field label="Documento">
                                <div className="flex min-w-0 flex-col gap-1">
                                    <DocumentoInputGroup
                                        label=""
                                        tipoDocumento={manualTipoDocumento}
                                        numeroDocumento={manualDni}
                                        onTipoDocumentoChange={setManualTipoDocumento}
                                        onNumeroDocumentoChange={setManualDni}
                                    />
                                    {isClienteLoading && (
                                        <div className="flex h-10 items-center justify-center">
                                            <LoadingIndicator type="line-spinner" size="sm" />
                                        </div>
                                    )}
                                </div>
                            </Field>
                            <Field label="Monto">
                                <CompactInput
                                    placeholder="S/ 0.00"
                                    value={manualAmount}
                                    onChange={(value) => setManualAmount(sanitizeAmountInput(value))}
                                />
                            </Field>
                            <Field label="Comunidad">
                                <CompactSelect
                                    options={comunidades.map((item) => ({ label: item.nombre, value: String(item.id) }))}
                                    value={manualCommunityId}
                                    onChange={setManualCommunityId}
                                />
                            </Field>
                            {allowsManualDepositDate ? (
                                <Field label="Fecha depósito">
                                    <CompactInput
                                        type="date"
                                        value={manualDepositDate}
                                        onChange={setManualDepositDate}
                                    />
                                </Field>
                            ) : null}
                        </div>
                        <FormActions
                            isSaving={isSavingManual}
                            onCancel={() => {
                                setManualCode("");
                                setManualTipoDocumento(1);
                                setManualDni("");
                                setManualAmount("");
                                setManualDepositDate(getPeruDateValue());
                            }}
                            onSave={handleSaveManualOperation}
                        />
                        </div>
                    </InlineFormCard>
                )}
            </div>
        </>
    );
};
