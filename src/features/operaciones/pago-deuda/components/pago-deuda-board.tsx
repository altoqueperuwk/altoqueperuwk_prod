import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronDown, Coins01, Edit03, Percent01, Trash01 } from "@untitledui/icons";
import { SubmenuTrigger } from "react-aria-components";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";
import { bancoService } from "@/services/banco.service";
import { comunidadService } from "@/services/comunidad.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import { OperationTable } from "@/features/operaciones/efectivizacion/shared/components/operation-table";
import { OperationToolbar } from "@/features/operaciones/efectivizacion/shared/components/operation-toolbar";
import {
    CompactBadgeLine,
    CompactCellText,
    CompactMoneyCell,
} from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import {
    DocumentoInputGroup,
    cleanDocumento,
    getDocumentoValidationMessage,
    type TipoDocumentoOperacion,
} from "@/features/operaciones/efectivizacion/shared/components/documento-input-group";
import { sanitizeAmountInput } from "@/features/operaciones/efectivizacion/shared/utils/amount-input";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { useClienteLookup } from "@/features/operaciones/efectivizacion/asistida/hooks/use-cliente-lookup";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import { cx } from "@/utils/cx";
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";

interface PagoDeudaBoardProps {
    onChanged?: () => void;
    refreshKey?: number;
    selectedDate: string;
}

interface EmpresaCuentaActiva {
    id: number;
    id_empresa: number;
    empresa_nombre: string;
    id_banco: number;
    banco_nombre: string;
    billetera_digital: string;
    flag_deposito_comision: boolean;
}

interface CatalogItem {
    id: number;
    nombre: string;
}

interface EditSolicitudState {
    row: OperacionProceso;
    tipoDocumento: TipoDocumentoOperacion;
    dni: string;
    nombre: string;
    whatsapp: string;
    comunidadId: string;
    bancoId: string;
    monto: string;
    commissionMode: CommissionMode;
    manualCommission: string;
}

type CommissionMode = "preferencial" | "ultimo_dia";

interface PagoDeudaRegla {
    id_banco: number;
    id_comunidad: number | null;
    comision_servicio: number;
}

interface ManualCommissionState {
    row: OperacionProceso;
    type: "especial" | "extra";
    value: string;
}

interface PagoDeudaCodigoCellProps {
    code?: string | null;
    editable: boolean;
    isEditing: boolean;
    isSaving: boolean;
    value: string;
    onChange: (value: string) => void;
    onEdit: () => void;
    onBlur: () => void;
}

const PagoDeudaCodigoCell = ({ code, editable, isEditing, isSaving, value, onChange, onEdit, onBlur }: PagoDeudaCodigoCellProps) => {
    if (isEditing) {
        return (
            <Input
                autoFocus
                size="sm"
                value={value}
                isDisabled={isSaving}
                onChange={onChange}
                onBlur={onBlur}
                aria-label="Código de operación"
            />
        );
    }

    return (
        <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="font-medium text-primary">{code || "-"}</span>
            {editable && <Button size="xs" color="tertiary" iconLeading={Edit03} aria-label="Editar código de operación" onClick={onEdit} />}
        </div>
    );
};

const filters = ["Todos", "Pendiente Transferencia", "Pendiente Devolución", "Pendiente Comisión"];
const actions = ["Confirmar Comision"];
const allowedBankNames = new Set(["BCP", "BBVA", "INTERBANK", "BANBIF", "SCOTIABANK"]);

const sanitizeWhatsapp = (value: string) => value.replace(/\D/g, "").slice(0, 9);

export const hasDevolucionConfirmada = (row: OperacionProceso) =>
    Boolean(row.id_operacion_match) ||
    Number(row.monto_devuelto ?? 0) >= Number(row.monto_deposito_cliente ?? 0);

const formatDate = (value?: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
};

const formatTime = (value?: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
};

const normalizeFilterToken = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();

const getEstadoToken = (estado?: string | null) => estado?.trim().toUpperCase() ?? "";

const inferTipoDocumentoOperacion = (documento?: string | null): TipoDocumentoOperacion =>
    documento?.replace(/\D/g, "").length === 9 ? 2 : 1;

type PagoDeudaEstadoAccion = "transferencia" | "finalizar" | "none";

export const getPagoDeudaEstadoVisual = (row: OperacionProceso): { action: PagoDeudaEstadoAccion; label: string } => {
    const estado = getEstadoToken(row.nombre_estado);
    const isTransferido = estado === "PROCESADO" || estado === "PAGADO";

    if (Boolean(row.flag_comision_registrada)) return { action: "none", label: "Pagado" };
    if (hasDevolucionConfirmada(row)) return { action: "finalizar", label: "Devuelto" };
    if (isTransferido) return { action: "none", label: "Transferido" };
    return { action: "transferencia", label: "Solicitado" };
};

interface PagoDeudaEstadoButtonProps {
    row: OperacionProceso;
    isLoading?: boolean;
    onFinalizar?: (row: OperacionProceso) => void;
    onTransferencia?: (row: OperacionProceso) => void;
}

export const PagoDeudaEstadoButton = ({
    isLoading = false,
    onFinalizar,
    onTransferencia,
    row,
}: PagoDeudaEstadoButtonProps) => {
    const visual = getPagoDeudaEstadoVisual(row);
    const handleClick = () => {
        if (visual.action === "transferencia") onTransferencia?.(row);
        if (visual.action === "finalizar") onFinalizar?.(row);
    };
    const isActionable =
        (visual.action === "transferencia" && Boolean(onTransferencia)) ||
        (visual.action === "finalizar" && Boolean(onFinalizar));

    return (
        <Button
            size="xs"
            color={isActionable ? "primary" : "secondary"}
            isDisabled={!isActionable || isLoading}
            isLoading={isLoading}
            onClick={handleClick}
        >
            {visual.label}
        </Button>
    );
};

export const PagoDeudaSteps = ({ row }: { row: OperacionProceso }) => {
    const estado = getEstadoToken(row.nombre_estado);
    const completed = [
        true,
        estado === "PROCESADO" || estado === "PAGADO",
        hasDevolucionConfirmada(row) || estado === "PAGADO",
        Boolean(row.flag_comision_registrada),
    ];

    return (
        <div className="flex items-center gap-1.5">
            {completed.map((isDone, index) => (
                <div
                    key={index}
                    className={cx(
                        "flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
                        isDone
                            ? "border-success-primary bg-success-solid text-primary_on-brand"
                            : "border-secondary bg-primary text-tertiary",
                    )}
                    title={`Paso ${index + 1}`}
                >
                    {isDone ? <Check className="size-3.5" /> : index + 1}
                </div>
            ))}
        </div>
    );
};

interface CuentaComisionSelectorProps {
    cuentasPorEmpresa: { empresa: string; cuentas: EmpresaCuentaActiva[] }[];
    currentCuenta?: EmpresaCuentaActiva;
    disabled?: boolean;
    isSaving?: boolean;
    onSelect: (idCuenta: string) => void;
    row: OperacionProceso;
}

const CuentaComisionSelector = ({
    cuentasPorEmpresa,
    currentCuenta,
    disabled = false,
    isSaving = false,
    onSelect,
    row,
}: CuentaComisionSelectorProps) => {
    const cuentaLabel = row.nombre_banco_empresa_cuenta_ingreso || currentCuenta?.banco_nombre || "Cuenta";
    const billeteraLabel = currentCuenta?.billetera_digital ? ` (${currentCuenta.billetera_digital})` : "";
    const selectedLabel = `${cuentaLabel}${billeteraLabel}`;
    const enabledGroups = cuentasPorEmpresa.filter((group) => group.cuentas.length > 0);

    return (
        <div className="inline-flex max-w-full">
            <Dropdown.Root>
                <Button
                    size="xs"
                    color="secondary"
                    iconTrailing={ChevronDown}
                    isDisabled={disabled || isSaving || enabledGroups.length === 0}
                    className="max-w-full justify-between"
                >
                    <span className="truncate">{selectedLabel}</span>
                </Button>

                <Dropdown.Popover className="w-60">
                    <Dropdown.Menu>
                        {enabledGroups.length ? (
                            <Dropdown.Section>
                                {enabledGroups.map((group) => (
                                    <SubmenuTrigger key={group.empresa}>
                                        <Dropdown.Item>{group.empresa}</Dropdown.Item>
                                        <Dropdown.Popover placement="right top" offset={-6} className="w-56">
                                            <Dropdown.Menu
                                                onAction={(key) => onSelect(String(key))}
                                            >
                                                {group.cuentas.map((cuenta) => (
                                                    <Dropdown.Item
                                                        key={cuenta.id}
                                                        id={String(cuenta.id)}
                                                        addon={cuenta.billetera_digital || undefined}
                                                    >
                                                        {cuenta.banco_nombre}
                                                    </Dropdown.Item>
                                                ))}
                                            </Dropdown.Menu>
                                        </Dropdown.Popover>
                                    </SubmenuTrigger>
                                ))}
                            </Dropdown.Section>
                        ) : (
                            <Dropdown.Item isDisabled>Sin cuentas habilitadas</Dropdown.Item>
                        )}
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown.Root>
        </div>
    );
};

export const PagoDeudaBoard = ({ onChanged, refreshKey = 0, selectedDate }: PagoDeudaBoardProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [dni, setDni] = useState("");
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [solicitudes, setSolicitudes] = useState<OperacionProceso[]>([]);
    const [cuentasActivas, setCuentasActivas] = useState<EmpresaCuentaActiva[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [savingCuentaIds, setSavingCuentaIds] = useState<number[]>([]);
    const [deletingSolicitud, setDeletingSolicitud] = useState<OperacionProceso | null>(null);
    const [isDeletingSolicitud, setIsDeletingSolicitud] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [editSolicitud, setEditSolicitud] = useState<EditSolicitudState | null>(null);
    const [manualCommission, setManualCommission] = useState<ManualCommissionState | null>(null);
    const [codigoOperacionEdit, setCodigoOperacionEdit] = useState<{
        row: OperacionProceso;
        type: "transferencia" | "comision";
        value: string;
    } | null>(null);
    const [isSavingCodigoOperacion, setIsSavingCodigoOperacion] = useState(false);
    const [isSavingSolicitud, setIsSavingSolicitud] = useState(false);
    const [isSavingCommission, setIsSavingCommission] = useState(false);
    const [savingEstadoIds, setSavingEstadoIds] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [actionRefreshKey, setActionRefreshKey] = useState(0);
    const [comunidades, setComunidades] = useState<CatalogItem[]>([]);
    const [bancos, setBancos] = useState<CatalogItem[]>([]);
    const [reglas, setReglas] = useState<PagoDeudaRegla[]>([]);
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const { result: editClienteLookup, isLoading: isEditClienteLoading } = useClienteLookup(
        editSolicitud?.dni ?? "",
        editSolicitud?.tipoDocumento ?? 1,
    );

    const bancosPermitidos = useMemo(
        () => bancos.filter((item) => allowedBankNames.has(item.nombre.trim().toUpperCase())),
        [bancos],
    );

    const getReglaPagoDeuda = (bancoId: string, comunidadId: string) => {
        const bankRules = reglas.filter((item) => item.id_banco === Number(bancoId));
        return bankRules.find((item) => item.id_comunidad === Number(comunidadId)) ?? bankRules[0] ?? null;
    };

    useEffect(() => {
        if (!editSolicitud || !editClienteLookup) return;
        setEditSolicitud((current) => current ? {
            ...current,
            nombre: editClienteLookup.nombre,
            whatsapp: editClienteLookup.celular[0] ?? "",
            comunidadId: editClienteLookup.id_comunidad ? String(editClienteLookup.id_comunidad) : current.comunidadId,
        } : current);
    }, [editClienteLookup]);

    const params = useMemo(() => {
        const values: Record<string, unknown> = {
            p_fecha_desde: `${selectedDate}T00:00:00`,
            p_fecha_hasta: `${selectedDate}T23:59:59`,
            p_id_usuario_solicitud: userId,
        };
        if (dni.trim()) values.p_dni_cliente = dni.trim();
        return values;
    }, [dni, selectedDate]);

    const cuentasComisionHabilitadas = useMemo(
        () => cuentasActivas.filter((cuenta) => cuenta.flag_deposito_comision),
        [cuentasActivas],
    );

    const cuentasPorEmpresa = useMemo(() => {
        const byId = new Map<number, { empresa: string; cuentas: EmpresaCuentaActiva[] }>();
        cuentasActivas.forEach((cuenta) => {
            if (!byId.has(cuenta.id_empresa)) {
                byId.set(cuenta.id_empresa, { empresa: cuenta.empresa_nombre, cuentas: [] });
            }
            if (cuenta.flag_deposito_comision) byId.get(cuenta.id_empresa)?.cuentas.push(cuenta);
        });
        return Array.from(byId.values());
    }, [cuentasActivas]);

    useEffect(() => {
        let ignore = false;

        estadoService
            .getList({})
            .then((rows) => {
                if (ignore) return;
                const estados = rows.map((row) => ({ id: Number(row.id), nombre: String(row.nombre ?? "") }));
                setEstadoPagado(estados.find((item) => item.nombre.toUpperCase() === "PAGADO") ?? null);
            })
            .catch(() => addToast("error", "Error al cargar estados."));

        pagoDeudaService
            .getEmpresasComision({ p_id_estado: 1 })
            .then((rows) => {
                if (ignore) return;
                setCuentasActivas(
                    (rows ?? []).map((row) => ({
                        id: Number(row.id_empresa_cuenta_bancaria),
                        id_empresa: Number(row.id_empresa),
                        empresa_nombre: String(row.empresa_nombre ?? ""),
                        id_banco: Number(row.id_banco),
                        banco_nombre: String(row.banco_nombre ?? ""),
                        billetera_digital: String(row.billetera_digital ?? ""),
                        flag_deposito_comision: Boolean(row.flag_deposito_comision),
                    })),
                );
            })
            .catch(() => addToast("error", "Error al cargar empresas de comision."));

        Promise.all([
            comunidadService.getList({ p_id_estado: 1 }),
            bancoService.getList({ p_id_estado: 1 }),
        ])
            .then(([comunidadRows, bancoRows]) => {
                if (ignore) return;

                setComunidades(
                    (comunidadRows ?? []).map((row) => ({
                        id: Number(row.id),
                        nombre: String(row.nombre ?? ""),
                    })),
                );
                setBancos(
                    (bancoRows ?? []).map((row) => ({
                        id: Number(row.id),
                        nombre: String(row.nombre ?? ""),
                    })),
                );
            })
            .catch(() => addToast("error", "Error al cargar catalogos de Pago Deuda."));

        reglasEfectivizacionService
            .getList({ p_id_estado: 1 })
            .then((rows) => {
                if (ignore) return;
                setReglas(
                    (rows ?? [])
                        .filter((row) => String(row.codigo_servicio_nombre ?? "").toUpperCase().includes("PAGO DEUDA"))
                        .map((row) => ({
                            id_banco: Number(row.id_banco),
                            id_comunidad: row.id_comunidad == null ? null : Number(row.id_comunidad),
                            comision_servicio: Number(row.comision_servicio ?? 0),
                        })),
                );
            })
            .catch(() => addToast("error", "Error al cargar reglas de Pago Deuda."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

    useEffect(() => {
        setSelectedIds([]);
    }, [activeFilter, dni, refreshKey, selectedDate]);

    const filterSolicitudes = (rows: OperacionProceso[], filter: string) => {
        if (filter === "Todos") return rows;
        const filterToken = normalizeFilterToken(filter);

        return rows.filter((row) => {
            const estado = getEstadoToken(row.nombre_estado);
            const isProcesado = estado === "PROCESADO" || estado === "PAGADO";
            const hasMatch = hasDevolucionConfirmada(row);
            const hasComision = Boolean(row.flag_comision_registrada);

            if (filterToken.includes("TRANSFERENCIA")) return !isProcesado;
            if (activeFilter === "Pendiente Devolución") return isProcesado && !hasMatch;
            if (activeFilter === "Pendiente Comisión") return hasMatch && !hasComision;
            return true;
        });
    };

    const solicitudesFiltradas = useMemo(
        () => filterSolicitudes(solicitudes, activeFilter),
        [activeFilter, solicitudes],
    );

    useEffect(() => {
        let ignore = false;
        if (userId === null) {
            setSolicitudes([]);
            setIsLoading(false);
            return () => { ignore = true; };
        }
        setIsLoading(true);
        setError(null);

        pagoDeudaService
            .getSolicitudes(params)
            .then((result) => {
                if (!ignore) setSolicitudes(result ?? []);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar Pago Deuda.");
            })
            .finally(() => {
                if (!ignore) setIsLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [actionRefreshKey, params, refreshKey, userId]);

    useEffect(() => {
        const handleFocus = () => setActionRefreshKey((value) => value + 1);
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, []);

    const handleToggleRow = (id: number) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    };

    const updateSolicitud = (updated: OperacionProceso) => {
        setSolicitudes((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    };

    const getSolicitudActualizada = async (row: OperacionProceso, fallback: OperacionProceso) => {
        const rootId = row.id_operacion_padre ?? row.id;
        const rows = await pagoDeudaService.getSolicitudes({ p_id: rootId });
        return rows?.[0] ?? fallback;
    };

    const persistComisionCuenta = async (row: OperacionProceso, cuenta: EmpresaCuentaActiva) => {
        setSavingCuentaIds((current) => [...current, row.id]);
        try {
            const updated = await pagoDeudaService.patchComisionCuenta({
                p_id_operacion: row.id,
                p_id_empresa_ingreso: cuenta.id_empresa,
                p_id_empresa_cuenta_ingreso: cuenta.id,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
            });
            updateSolicitud(updated);
            addToast("success", "Cuenta de comision actualizada.");
            onChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo guardar la cuenta de comision.");
        } finally {
            setSavingCuentaIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const handleCuentaComisionSelect = (row: OperacionProceso, value: string) => {
        const cuenta = cuentasComisionHabilitadas.find((item) => item.id === Number(value));
        if (!cuenta) {
            addToast("error", "Cuenta de comision no habilitada.");
            return;
        }

        void persistComisionCuenta(row, cuenta);
    };

    const handleDeleteSolicitud = async () => {
        if (!deletingSolicitud) return;

        setIsDeletingSolicitud(true);
        try {
            await pagoDeudaService.deleteSolicitud({
                p_id_operacion: deletingSolicitud.id,
                p_id_usuario: userId,
            });
            setSolicitudes((current) => current.filter((row) => row.id !== deletingSolicitud.id));
            setSelectedIds((current) => current.filter((id) => id !== deletingSolicitud.id));
            setDeletingSolicitud(null);
            addToast("success", "Solicitud eliminada.");
            onChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo eliminar la solicitud.");
        } finally {
            setIsDeletingSolicitud(false);
        }
    };

    const handleConfirmarComision = async () => {
        if (!selectedIds.length) {
            addToast("error", "Selecciona al menos una solicitud.");
            return;
        }

        if (!estadoPagado) {
            addToast("error", "No se encontro el estado Pagado.");
            return;
        }

        const eligible = solicitudes.filter(
            (row) => selectedIds.includes(row.id) && hasDevolucionConfirmada(row) && !Boolean(row.flag_comision_registrada),
        );
        if (!eligible.length) {
            addToast("error", "Las solicitudes seleccionadas no tienen devolucion confirmada o ya tienen comision.");
            return;
        }

        setIsApplyingAction(true);

        try {
            const updatedRows: OperacionProceso[] = [];
            for (const row of eligible) {
                const saved = await pagoDeudaService.patchPagado({
                    p_id_operacion: row.id,
                    p_id_usuario_gestor: userId,
                    p_nombre_usuario_gestor: userName,
                });
                updatedRows.push(await getSolicitudActualizada(row, saved));
            }

            setSelectedIds([]);
            setActiveFilter("Todos");
            setSolicitudes((current) => current.map((row) => updatedRows.find((item) => item.id === row.id) ?? row));
            addToast("success", `Comisiones confirmadas: ${eligible.length}`);
            onChanged?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al confirmar comision.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    const handleAction = (action: string) => {
        if (action === "Confirmar Comision") void handleConfirmarComision();
    };

    const canEditSolicitud = (row: OperacionProceso) => getPagoDeudaEstadoVisual(row).action === "transferencia";

    const openEditSolicitud = (row: OperacionProceso) => {
        if (!canEditSolicitud(row)) return;

        const bancoId = row.id_banco_cliente ? String(row.id_banco_cliente) : "";
        const comunidadId = row.id_comunidad ? String(row.id_comunidad) : "";
        const regla = getReglaPagoDeuda(bancoId, comunidadId);
        const currentCommission = Number(row.comision_servicio ?? 0);
        const isPreferential = regla != null && Math.abs(currentCommission - regla.comision_servicio) < 0.000001;

        setEditSolicitud({
            row,
            tipoDocumento: inferTipoDocumentoOperacion(row.dni_cliente),
            dni: row.dni_cliente ?? "",
            nombre: row.nombre_cliente ?? "",
            whatsapp: "",
            comunidadId,
            bancoId,
            monto: row.monto_deposito_cliente != null ? String(row.monto_deposito_cliente) : "",
            commissionMode: isPreferential ? "preferencial" : "ultimo_dia",
            manualCommission: isPreferential ? "" : String(row.comision_servicio ?? ""),
        });
    };

    const openManualCommission = (row: OperacionProceso, type: ManualCommissionState["type"]) => {
        if (type === "especial" && !canEditSolicitud(row)) return;
        if (type === "extra" && Boolean(row.flag_comision_registrada)) return;

        setManualCommission({
            row,
            type,
            value: String(type === "especial" ? row.comision_servicio ?? 0 : row.comision_monto_extra_servicio ?? 0),
        });
    };

    const handleManualCommissionSave = async () => {
        if (!manualCommission) return;

        const value = Number(manualCommission.value);

        if (!Number.isFinite(value) || value < 0) {
            addToast("error", "Ingresa un valor mayor o igual a 0.");
            return;
        }

        if (manualCommission.type === "extra" && !Number.isInteger(value)) {
            addToast("error", "La comision extra debe ser un monto entero en soles.");
            return;
        }

        setIsSavingCommission(true);
        try {
            const saved =
                manualCommission.type === "especial"
                    ? await pagoDeudaService.patchComisionEspecial({
                        p_id_operacion: manualCommission.row.id,
                        p_comision_servicio: value,
                        p_id_usuario_gestor: userId,
                        p_nombre_usuario_gestor: userName,
                    })
                    : await pagoDeudaService.patchComisionExtra({
                        p_id_operacion: manualCommission.row.id,
                        p_comision_monto_extra_servicio: value,
                        p_id_usuario_gestor: userId,
                        p_nombre_usuario_gestor: userName,
                    });

            updateSolicitud(saved);
            setManualCommission(null);
            addToast("success", manualCommission.type === "especial" ? "Comision especial actualizada." : "Comision extra actualizada.");
            onChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo actualizar la comision.");
        } finally {
            setIsSavingCommission(false);
        }
    };

    const handleCodigoOperacionSave = async () => {
        if (!codigoOperacionEdit) return;

        const { row, type, value } = codigoOperacionEdit;
        setIsSavingCodigoOperacion(true);
        try {
            await pagoDeudaService.patchCodigoOperacion({
                p_id_operacion: type === "transferencia" ? (row.id_operacion_banco ?? row.id) : row.id,
                p_tipo_codigo: type === "transferencia" ? "TRANSFERENCIA" : "COMISION",
                p_codigo_operacion: value,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
            });
            setCodigoOperacionEdit(null);
            setActionRefreshKey((current) => current + 1);
            addToast("success", "Código de operación actualizado.");
            onChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo actualizar el código de operación.");
        } finally {
            setIsSavingCodigoOperacion(false);
        }
    };

    const handleEditSolicitudSave = async () => {
        if (!editSolicitud) return;

        const selectedBanco = bancos.find((item) => String(item.id) === editSolicitud.bancoId);
        const selectedComunidad = comunidades.find((item) => String(item.id) === editSolicitud.comunidadId);
        const amount = Number(editSolicitud.monto.replace(",", "."));
        const newDni = cleanDocumento(editSolicitud.dni, editSolicitud.tipoDocumento);
        const documentoError = getDocumentoValidationMessage(newDni, editSolicitud.tipoDocumento);

        if (!userId) {
            addToast("error", "No se pudo resolver el usuario actual.");
            return;
        }

        if (documentoError) {
            addToast("error", documentoError);
            return;
        }

        if (!selectedComunidad) {
            addToast("error", "Selecciona una comunidad.");
            return;
        }

        if (!selectedBanco) {
            addToast("error", "Selecciona un banco.");
            return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            addToast("error", "El monto debe ser mayor a cero.");
            return;
        }

        const regla = getReglaPagoDeuda(editSolicitud.bancoId, editSolicitud.comunidadId);
        if (!regla) {
            addToast("error", "No se encontro una regla activa para el banco seleccionado.");
            return;
        }

        const manualCommissionValue = editSolicitud.commissionMode === "ultimo_dia"
            ? Number(editSolicitud.manualCommission.replace(",", "."))
            : 0;
        const manualCommissionPayload = editSolicitud.commissionMode === "ultimo_dia" ? manualCommissionValue : null;

        if (editSolicitud.commissionMode === "ultimo_dia" && (!Number.isFinite(manualCommissionValue) || manualCommissionValue < 0)) {
            addToast("error", "La comision debe ser mayor o igual a 0.");
            return;
        }

        setIsSavingSolicitud(true);
        try {
            const saved = await pagoDeudaService.postSolicitud({
                p_id_operacion: editSolicitud.row.id,
                p_id_usuario: userId,
                p_tipo_documento_cliente: editSolicitud.tipoDocumento,
                p_dni_cliente: newDni,
                p_nombre_cliente: editSolicitud.nombre.trim() || null,
                p_celular_cliente: editSolicitud.whatsapp || null,
                p_id_banco_cliente: selectedBanco.id,
                p_nombre_banco_cliente: selectedBanco.nombre,
                p_monto_deposito_cliente: amount,
                p_comision_servicio_manual: manualCommissionPayload,
                p_id_comunidad: selectedComunidad.id,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
                p_id_usuario_solicitud: editSolicitud.row.id_usuario_solicitud ?? userId,
                p_nombre_usuario_solicitud: editSolicitud.row.nombre_usuario_solicitud ?? userName,
                p_ruta_origen: "deuda",
                p_ruta_destino: "deuda",
            });

            updateSolicitud(saved);
            setEditSolicitud(null);
            addToast("success", "Solicitud actualizada.");
            onChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo actualizar la solicitud.");
        } finally {
            setIsSavingSolicitud(false);
        }
    };

    const handleTransferenciaEstado = async (row: OperacionProceso) => {
        const rutaDestino = row.ruta_destino ?? row.ruta_origen;
        if (!rutaDestino) {
            addToast("error", "La solicitud no tiene ruta destino para confirmar transferencia.");
            return;
        }

        setSavingEstadoIds((current) => [...current, row.id]);
        try {
            const saved = await operacionesRpcService.patchPagoDeudaSalida({
                p_id_operacion: row.id,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
                p_ruta_destino: rutaDestino,
            });
            updateSolicitud(saved);
            addToast("success", "Transferencia confirmada.");
            onChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo confirmar la transferencia.");
        } finally {
            setSavingEstadoIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const handleFinalizarEstado = async (row: OperacionProceso) => {
        setSavingEstadoIds((current) => [...current, row.id]);
        try {
            const saved = await pagoDeudaService.patchPagado({
                p_id_operacion: row.id,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
            });
            updateSolicitud(await getSolicitudActualizada(row, saved));
            addToast("success", "Pago Deuda finalizado.");
            onChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo finalizar Pago Deuda.");
        } finally {
            setSavingEstadoIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const isActionDisabled = (action: string) => {
        if (isApplyingAction || isLoading || !selectedIds.length) return true;
        if (action === "Confirmar Comision") {
            return !solicitudes.some(
                (row) => selectedIds.includes(row.id) && hasDevolucionConfirmada(row) && !Boolean(row.flag_comision_registrada),
            );
        }
        return false;
    };

    const columns = [
        {
            key: "pasos",
            label: "Pasos",
            render: (row: OperacionProceso) => <PagoDeudaSteps row={row} />,
        },
        {
            key: "dni_cliente",
            label: "DNI",
            render: (row: OperacionProceso) => <CompactCellText primary={row.dni_cliente ?? "-"} />,
        },
        {
            key: "nombre_cliente",
            label: "Cliente",
            cellClassName: "w-[25ch] max-w-[25ch]",
            render: (row: OperacionProceso) => (
                <CompactCellText
                    primary={row.nombre_cliente || "-"}
                    className="max-w-[25ch]"
                    title={row.nombre_cliente || undefined}
                />
            ),
        },
        {
            key: "nombre_banco_cliente",
            label: "Banco Solicitado",
            render: (row: OperacionProceso) => <CompactCellText primary={row.nombre_banco_cliente ?? "-"} />,
        },
        {
            key: "monto_deposito_cliente",
            label: "Monto Solicitado",
            render: (row: OperacionProceso) => <CompactMoneyCell value={row.monto_deposito_cliente} />,
        },
        {
            key: "resultado_comision_servicio",
            label: "Comision",
            render: (row: OperacionProceso) => (
                <div className="tabular-nums">
                    <div className="flex items-center gap-1">
                        <CompactMoneyCell value={row.resultado_comision_servicio} />
                        <CompactBadgeLine>{row.comision_servicio != null ? `${row.comision_servicio}%` : "-"}</CompactBadgeLine>
                    </div>
                    {Number(row.comision_monto_extra_servicio ?? 0) > 0 && (
                        <div className="mt-1 flex">
                            <CompactBadgeLine color="warning">Extra S/ {formatInteger(row.comision_monto_extra_servicio)}</CompactBadgeLine>
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: "monto_devuelto",
            label: "Monto Devuelto",
            render: (row: OperacionProceso) => (
                <CompactMoneyCell value={hasDevolucionConfirmada(row) ? row.monto_deposito_cliente : row.monto_devuelto} />
            ),
        },
        {
            key: "codigo_operacion_comision",
            label: "Cod. Op. Comision",
            render: (row: OperacionProceso) => {
                const isEditing = codigoOperacionEdit?.row.id === row.id && codigoOperacionEdit.type === "comision";
                const editable = hasDevolucionConfirmada(row)
                    && !Boolean(row.flag_comision_registrada)
                    && !["PAGADO", "ELIMINADO"].includes(getEstadoToken(row.nombre_estado));

                return (
                    <PagoDeudaCodigoCell
                        code={row.pd_codigo_operacion_comision}
                        editable={editable}
                        isEditing={isEditing}
                        isSaving={isSavingCodigoOperacion}
                        value={isEditing ? codigoOperacionEdit.value : (row.pd_codigo_operacion_comision ?? "")}
                        onChange={(value) => setCodigoOperacionEdit((current) => current ? { ...current, value } : current)}
                        onEdit={() => setCodigoOperacionEdit({ row, type: "comision", value: row.pd_codigo_operacion_comision ?? "" })}
                        onBlur={() => void handleCodigoOperacionSave()}
                    />
                );
            },
        },
        {
            key: "cuenta_comision",
            label: "Cuenta Comision",
            cellClassName: "w-1 whitespace-nowrap",
            render: (row: OperacionProceso) => {
                const currentCuenta = cuentasActivas.find((cuenta) => cuenta.id === Number(row.id_empresa_cuenta_ingreso));

                return (
                    <CuentaComisionSelector
                        cuentasPorEmpresa={cuentasPorEmpresa}
                        currentCuenta={currentCuenta}
                        disabled={!hasDevolucionConfirmada(row) || Boolean(row.flag_comision_registrada)}
                        isSaving={savingCuentaIds.includes(row.id)}
                        onSelect={(idCuenta) => handleCuentaComisionSelect(row, idCuenta)}
                        row={row}
                    />
                );
            },
        },
        {
            key: "estado_visual",
            label: "Estado",
            render: (row: OperacionProceso) => (
                <PagoDeudaEstadoButton
                    row={row}
                    isLoading={savingEstadoIds.includes(row.id)}
                    onFinalizar={handleFinalizarEstado}
                />
            ),
        },
        {
            key: "fecha_registro",
            label: "Fecha Hora",
            render: (row: OperacionProceso) => (
                <CompactCellText primary={formatTime(row.fecha_registro) || "-"} secondary={formatDate(row.fecha_registro)} />
            ),
        },
        {
            key: "acciones",
            label: "Acciones",
            render: (row: OperacionProceso) => {
                const canEdit = canEditSolicitud(row);
                const canEditExtra = !Boolean(row.flag_comision_registrada);
                const canOpenActions = canEdit || canEditExtra;

                return (
                    <Dropdown.Root>
                        <Dropdown.DotsButton aria-label="Acciones de Pago Deuda" isDisabled={!canOpenActions} />
                        <Dropdown.Popover>
                            <Dropdown.Menu
                                onAction={(key) => {
                                    if (key === "Editar") openEditSolicitud(row);
                                    if (key === "ComisionEspecial") openManualCommission(row, "especial");
                                    if (key === "ComisionExtra") openManualCommission(row, "extra");
                                    if (key === "EliminarSolicitud") setDeletingSolicitud(row);
                                }}
                            >
                                {canEdit && <Dropdown.Item id="Editar" icon={Edit03}>Editar</Dropdown.Item>}
                                {canEdit && <Dropdown.Item id="ComisionEspecial" icon={Percent01}>Com. Especial</Dropdown.Item>}
                                {canEditExtra && <Dropdown.Item id="ComisionExtra" icon={Coins01}>S/ Com. Extra</Dropdown.Item>}
                                {canEdit && <Dropdown.Separator />}
                                {canEdit && <Dropdown.Item id="EliminarSolicitud" icon={Trash01}>Eliminar Solicitud</Dropdown.Item>}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown.Root>
                );
            },
        },
    ];

    return (
        <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs"
        >
            <OperationToolbar
                activeFilter={activeFilter}
                actions={actions}
                dni={dni}
                filters={filters}
                isActionDisabled={isActionDisabled}
                onAction={handleAction}
                onDniChange={setDni}
                onFilterChange={setActiveFilter}
            />

            {error && <div className="border-t border-secondary px-4 py-3 text-sm text-error-primary">{error}</div>}

            <OperationTable
                columns={columns}
                data={solicitudesFiltradas}
                emptyText="Sin solicitudes de Pago Deuda."
                isLoading={isLoading}
                selectedIds={selectedIds}
                onToggleRow={handleToggleRow}
            />
            {editSolicitud && (
                <ModalOverlay isOpen onOpenChange={(open) => !open && setEditSolicitud(null)}>
                    <Modal className="max-w-lg">
                        <Dialog aria-label="Editar solicitud de pago deuda">
                            <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">Editar Solicitud</h2>
                                    <p className="mt-1 text-sm text-tertiary">Pago Deuda {editSolicitud.row.id}</p>
                                </div>
                                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                    <div className="flex w-full min-w-0 items-end gap-2">
                                        <DocumentoInputGroup
                                            isRequired
                                            tipoDocumento={editSolicitud.tipoDocumento}
                                            numeroDocumento={editSolicitud.dni}
                                            onTipoDocumentoChange={(value) =>
                                                setEditSolicitud((current) => current ? { ...current, tipoDocumento: value, dni: cleanDocumento(current.dni, value) } : current)
                                            }
                                            onNumeroDocumentoChange={(value) =>
                                                setEditSolicitud((current) => current ? { ...current, dni: value } : current)
                                            }
                                            className="min-w-0 flex-1"
                                        />
                                        {isEditClienteLoading && (
                                            <div className="flex size-10 shrink-0 items-center justify-center">
                                                <LoadingIndicator type="line-spinner" size="sm" />
                                            </div>
                                        )}
                                    </div>
                                    <Input
                                        size="sm"
                                        label="Nombre"
                                        value={editSolicitud.nombre}
                                        onChange={(value) => setEditSolicitud((current) => current ? { ...current, nombre: value } : current)}
                                        className="w-full min-w-0"
                                    />
                                    <Input
                                        size="sm"
                                        label="Whatsapp"
                                        placeholder="Número de Whatsapp"
                                        value={editSolicitud.whatsapp}
                                        onChange={(value) => setEditSolicitud((current) => current ? { ...current, whatsapp: sanitizeWhatsapp(value) } : current)}
                                        className="w-full min-w-0"
                                    />
                                    <NativeSelect
                                        size="sm"
                                        label="Banco Solicitado"
                                        value={editSolicitud.bancoId}
                                        onChange={(event) => {
                                            const value = event.currentTarget.value;
                                            setEditSolicitud((current) => current ? { ...current, bancoId: value } : current);
                                        }}
                                        options={[{ label: "Seleccionar", value: "" }, ...bancosPermitidos.map((item) => ({ label: item.nombre, value: String(item.id) }))]}
                                        className="w-full min-w-0"
                                    />
                                    <Input
                                        size="sm"
                                        label="Monto Solicitado"
                                        placeholder="S/ 0.00"
                                        value={editSolicitud.monto}
                                        onChange={(value) =>
                                            setEditSolicitud((current) => current ? { ...current, monto: sanitizeAmountInput(value) } : current)
                                        }
                                        className="w-full min-w-0"
                                    />
                                    <NativeSelect
                                        size="sm"
                                        label="Comision"
                                        value={editSolicitud.commissionMode}
                                        onChange={(event) => setEditSolicitud((current) => current ? {
                                            ...current,
                                            commissionMode: event.currentTarget.value as CommissionMode,
                                            manualCommission: "",
                                        } : current)}
                                        options={[
                                            { label: "Preferencial", value: "preferencial" },
                                            { label: "Último Día", value: "ultimo_dia" },
                                        ]}
                                        className="w-full min-w-0"
                                    />
                                    <Input
                                        size="sm"
                                        label="Comision %"
                                        placeholder="%"
                                        value={editSolicitud.commissionMode === "preferencial"
                                            ? (getReglaPagoDeuda(editSolicitud.bancoId, editSolicitud.comunidadId)?.comision_servicio != null
                                                ? `${getReglaPagoDeuda(editSolicitud.bancoId, editSolicitud.comunidadId)?.comision_servicio}%`
                                                : "")
                                            : editSolicitud.manualCommission}
                                        isDisabled={editSolicitud.commissionMode === "preferencial"}
                                        onChange={(value) => setEditSolicitud((current) => current ? {
                                            ...current,
                                            manualCommission: sanitizeAmountInput(value),
                                        } : current)}
                                        className="w-full min-w-0"
                                    />
                                </div>
                                <div className="mt-6 flex justify-end gap-2">
                                    <Button color="secondary" isDisabled={isSavingSolicitud} onClick={() => setEditSolicitud(null)}>Cancelar</Button>
                                    <Button isLoading={isSavingSolicitud} onClick={() => void handleEditSolicitudSave()}>Guardar</Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            )}
            {manualCommission && (
                <ModalOverlay isOpen onOpenChange={(open) => !open && setManualCommission(null)}>
                    <Modal className="max-w-sm">
                        <Dialog aria-label="Comision de pago deuda">
                            <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">
                                        {manualCommission.type === "especial" ? "Com. Especial" : "S/ Com. Extra"}
                                    </h2>
                                    <p className="mt-1 text-sm text-tertiary">
                                        {manualCommission.type === "especial"
                                            ? "Porcentaje manual para esta solicitud."
                                            : "Monto adicional en soles para esta solicitud."}
                                    </p>
                                </div>

                                <div className="mt-5">
                                    <Input
                                        size="sm"
                                        label={manualCommission.type === "especial" ? "Porcentaje" : "Monto"}
                                        type="number"
                                        value={manualCommission.value}
                                        onChange={(value) => setManualCommission((current) => current ? { ...current, value } : current)}
                                    />
                                </div>

                                <div className="mt-6 flex justify-end gap-2">
                                    <Button color="secondary" isDisabled={isSavingCommission} onClick={() => setManualCommission(null)}>Cancelar</Button>
                                    <Button isLoading={isSavingCommission} onClick={() => void handleManualCommissionSave()}>Guardar</Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            )}
            <OperacionConfirmModal
                confirmLabel="Eliminar"
                description="Se eliminara la solicitud y su operacion bancaria. Esta accion solo es valida en paso 1."
                intent="destructive"
                isLoading={isDeletingSolicitud}
                isOpen={Boolean(deletingSolicitud)}
                onClose={() => setDeletingSolicitud(null)}
                onConfirm={() => void handleDeleteSolicitud()}
                title="Eliminar Solicitud"
            />
        </motion.section>
    );
};
