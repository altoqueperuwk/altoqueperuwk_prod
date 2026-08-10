import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Tabs } from "@/components/application/tabs/tabs";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";
import { clienteService } from "@/services/cliente.service";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Edit03, ReverseLeft, Send01, Trash01 } from "@untitledui/icons";
import { EmpresaTabs } from "@/features/operaciones/efectivizacion/shared/components/empresa-tabs";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import { OperationTable } from "@/features/operaciones/efectivizacion/shared/components/operation-table";
import { OperationToolbar } from "@/features/operaciones/efectivizacion/shared/components/operation-toolbar";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionCajaMovimiento,
    OperacionProceso,
    OperacionRuta,
    OperacionRutaBancaria,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { CompactBadgeLine } from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import { CopyableDni } from "@/features/operaciones/efectivizacion/shared/components/copyable-dni";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { downloadCsv } from "@/features/operaciones/efectivizacion/shared/utils/csv";
import { isDigitalWalletBank } from "@/features/operaciones/efectivizacion/shared/utils/digital-wallet";
import { bancariaRouteKeys, getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { formatMovimientoOrigen, formatMovimientoTipo } from "@/features/operaciones/efectivizacion/shared/utils/movement-labels";
import { isBancariaActionDisabled, procesoActionTabs } from "@/features/operaciones/efectivizacion/shared/utils/action-rules";
import {
    buildOperacionDerivacionPayload,
    buildOperacionEmpresaIngresoPayload,
    buildOperacionEmpresaSalidaPayload,
    buildOperacionPagadoPayload,
    buildOperacionReanudarPayload,
    buildOperacionRetencionConfirmPayload,
    buildOperacionUsuarioPayload,
    buildPagoDeudaSalidaPayload,
} from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { BancariaActionModal, type BancariaBankDestination } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-action-modal";
import { BancariaEfectivizacionTable } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-efectivizacion-table";
import { BancariaExcelRollbackModal } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-excel-rollback-modal";
import { type BancariaTab, type MovimientoMerged, tabContracts, useBancariaBandeja } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja";
import {
    useBancariaEmpresaBadges,
    useBancariaTabBadges,
} from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-tab-badges";
import { PagoDeudaActionModal } from "@/features/operaciones/pago-deuda/components/pago-deuda-action-modal";
import {
    getPagoDeudaEstadoVisual,
    hasDevolucionConfirmada,
    PagoDeudaEstadoButton,
    PagoDeudaSteps,
} from "@/features/operaciones/pago-deuda/components/pago-deuda-board";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";

const tabs: BancariaTab[] = ["Efectivizacion", "Pago Deuda", "Derivados", "POS", "Movimientos", "Retenidos", "Eliminados"];
const retentionRoutes = new Set<OperacionRutaBancaria>(["bcp", "scotiabank", "banbif", "safetypay"]);
const softDeleteRoutes = new Set<OperacionRutaBancaria>(["bcp", "bbva", "scotiabank", "banbif", "interbank", "safetypay"]);

interface BancariaOperationalTabsProps {
    activeAccountId: number | null;
    activeCajaId: number | null;
    activeCompanyCaja: RutaOperacionCaja | null;
    activeCompanyId: number | null;
    companies: RutaOperacionCaja[];
    downloadKey?: number;
    emptyText?: string;
    enabled?: boolean;
    historyDate?: string | null;
    embedded?: boolean;
    presentation?: "operational" | "plain";
    readOnly?: boolean;
    showCompanyTabs?: boolean;
    flowTabsAsButtons?: boolean;
    onChanged?: () => void;
    onMetricsChanged?: () => void;
    onCompanyChange: (id: number) => void;
    refreshKey?: number;
    ruta: OperacionRutaBancaria;
    visibleTabs?: BancariaTab[];
}

const baseOperationColumns = [
    { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
    { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => <CopyableDni value={row.dni_cliente} /> },
    { key: "nombre_cliente", label: "Cliente" },
    { key: "nombre_estado", label: "Estado" },
    { key: "monto_transferencia_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
    { key: "nombre_empresa_ingreso", label: "Empresa" },
    { key: "fecha_registro", label: "Fecha", render: (row: OperacionProceso) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
];

const formatOperationTime = (value?: string | null) => value
    ? new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
    : "-";

const formatOperationDate = (value?: string | null) => value
    ? new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(value))
    : "-";

const isDeletableMovement = (row: MovimientoMerged) => {
    if (row.id_operacion_proceso != null) return false;
    const origen = (row.tipo_origen ?? "").trim().toUpperCase().replaceAll("_", " ");
    return origen === "OTROS" || origen === "TRANSFERENCIA INTERNA";
};

const getMovementColumns = (
    showModalidad: boolean,
    onDelete?: (row: MovimientoMerged) => void,
    onReturnRetencion?: (row: MovimientoMerged) => void,
) => [
    { key: "tipo_origen", label: "Origen", render: (row: MovimientoMerged) => <CompactBadgeLine color="brand">{formatMovimientoOrigen(row.tipo_origen)}</CompactBadgeLine> },
    ...(showModalidad ? [{
        key: "tipo_recaudacion_sf",
        label: "Modalidad",
        render: (row: MovimientoMerged) => (
            <CompactBadgeLine color={row.tipo_recaudacion_sf ? "brand" : "gray"}>
                {row.tipo_recaudacion_sf ?? "-"}
            </CompactBadgeLine>
        ),
    }] : []),
    {
        key: "movimientos",
        label: "Movimiento",
        render: (row: MovimientoMerged) => (
            <div className="flex flex-wrap gap-1">
                        {row.movimientos.map((mov) => (
                            <CompactBadgeLine key={mov} color={mov.toUpperCase() === "INGRESO" ? "success" : "error"}>
                                {formatMovimientoTipo(mov)}
                            </CompactBadgeLine>
                        ))}
            </div>
        ),
    },
    { key: "dni_cliente", label: "DNI", render: (row: MovimientoMerged) => <CopyableDni value={row.dni_cliente} /> },
    {
        key: "empresa_movimiento",
        label: "Empresa",
        render: (row: MovimientoMerged) => {
            const isTransfer = row.tipo_origen.trim().toUpperCase().replaceAll("_", " ") === "TRANSFERENCIA INTERNA";
            return isTransfer ? row.nombre_empresa_relacionada || "-" : row.nombre_empresa || "-";
        },
    },
    {
        key: "cuenta_movimiento",
        label: "Cuenta",
        render: (row: MovimientoMerged) => {
            const isTransfer = row.tipo_origen.trim().toUpperCase().replaceAll("_", " ") === "TRANSFERENCIA INTERNA";
            return isTransfer ? row.nombre_banco_relacionada || "-" : row.nombre_banco || "-";
        },
    },
    {
        key: "monto_ingreso",
        label: "Ingreso",
        render: (row: MovimientoMerged) => (
            <span className={row.monto_ingreso ? "font-medium text-concept-ingreso" : "text-concept-zero"}>
                {formatMoney(row.monto_ingreso)}
            </span>
        ),
    },
    {
        key: "monto_salida",
        label: "Salida",
        render: (row: MovimientoMerged) => (
            <span className={row.monto_salida ? "font-medium text-concept-salida" : "text-concept-zero"}>
                {formatMoney(row.monto_salida)}
            </span>
        ),
    },
    {
        key: "tipo_facturacion",
        label: "Facturacion",
        render: (row: MovimientoMerged) => (
            <CompactBadgeLine color={row.tipo_facturacion === "Sin Boleta" ? "gray" : "brand"}>
                {row.tipo_facturacion}
            </CompactBadgeLine>
        ),
    },
    { key: "fecha_registro", label: "Fecha Hora", render: (row: MovimientoMerged) => {
        const date = new Date(row.fecha_registro);
        return <span className="whitespace-pre-line">{date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}{"\n"}{date.toLocaleDateString("es-PE")}</span>;
    } },
    ...(onDelete || onReturnRetencion ? [{
        key: "acciones",
        label: "Acciones",
        render: (row: MovimientoMerged) => (
            <div className="flex items-center gap-1">
                {onReturnRetencion && row.flag_paso_retencion && row.movimientos.includes("INGRESO") && (
                    <Button
                        size="xs"
                        color="tertiary"
                        iconLeading={ReverseLeft}
                        aria-label="Retornar retencion"
                        title="Retornar retencion"
                        onClick={() => onReturnRetencion(row)}
                    />
                )}
                {onDelete && isDeletableMovement(row) && (
                    <Button
                        size="xs"
                        color="tertiary"
                        iconLeading={Trash01}
                        aria-label="Eliminar movimiento"
                        title="Eliminar movimiento"
                        onClick={() => onDelete(row)}
                    />
                )}
            </div>
        ),
    }] : []),
];

const EmpresaCuentaBadges = ({ cuenta, empresa, monto }: { cuenta?: string | null; empresa?: string | null; monto?: number | null }) => (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
        <CompactBadgeLine color="brand">{empresa || "-"}</CompactBadgeLine>
        <CompactBadgeLine>{cuenta || "-"}</CompactBadgeLine>
        {monto !== undefined && monto !== null ? <CompactBadgeLine>{formatMoney(monto)}</CompactBadgeLine> : null}
    </div>
);

const PagoDeudaCodigosRetorno = ({ row }: { row: OperacionProceso }) => {
    const codes = (row.pd_retorno_codigos_operacion || "")
        .split(/\r?\n|,\s*/)
        .map((code) => code.trim())
        .filter(Boolean);

    if (!codes.length) return <span>-</span>;

    return (
        <div className="flex min-w-0 flex-col gap-1">
            {codes.map((code, index) => (
                <span key={`${code}-${index}`} className="text-sm text-secondary tabular-nums">
                    {code}
                </span>
            ))}
        </div>
    );
};

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

const PagoDeudaCodigoCell = ({
    code,
    editable,
    isEditing,
    isSaving,
    value,
    onBlur,
    onChange,
    onEdit,
}: PagoDeudaCodigoCellProps) => {
    if (isEditing) {
        return (
            <Input
                autoFocus
                size="sm"
                aria-label="Codigo de operacion"
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                isDisabled={isSaving}
                className="min-w-32"
            />
        );
    }

    return (
        <div className="flex items-center gap-1">
            <span className="font-medium text-primary">{code || "-"}</span>
            {editable && (
                <Button
                    size="xs"
                    color="tertiary"
                    iconLeading={Edit03}
                    aria-label="Editar codigo de operacion"
                    title="Editar codigo de operacion"
                    onClick={onEdit}
                />
            )}
        </div>
    );
};

const PagoDeudaRetornoEmpresaCuentaBadges = ({ row }: { row: OperacionProceso }) => {
    const retornos = row.pd_retorno_empresas_cuentas?.filter((item) => item.empresa || item.cuenta) ?? [];

    if (!retornos.length) {
        if (!row.pd_retorno_id && !row.pd_retorno_nombre_empresa_ingreso && !row.pd_retorno_nombre_banco_empresa_cuenta_ingreso) {
            return <span>-</span>;
        }

        return (
            <EmpresaCuentaBadges
                empresa={row.pd_retorno_nombre_empresa_ingreso ?? row.nombre_empresa_ingreso}
                cuenta={row.pd_retorno_nombre_banco_empresa_cuenta_ingreso ?? row.nombre_banco_empresa_cuenta_ingreso}
            />
        );
    }

    return (
        <div className="flex min-w-0 flex-col gap-1">
            {retornos.map((item, index) => (
                <div
                    key={`${item.codigo ?? index}-${item.empresa ?? ""}-${item.cuenta ?? ""}`}
                    className="flex min-w-0 flex-col items-start gap-1"
                >
                    <CompactBadgeLine color="brand">{item.empresa || "-"}</CompactBadgeLine>
                    <div className="flex flex-wrap items-center gap-1">
                        <CompactBadgeLine>{item.cuenta || "-"}</CompactBadgeLine>
                        {item.monto !== undefined && item.monto !== null ? <CompactBadgeLine>{formatMoney(item.monto)}</CompactBadgeLine> : null}
                    </div>
                </div>
            ))}
        </div>
    );
};

const PagoDeudaRetornoEmpresaCuentaText = ({ row }: { row: OperacionProceso }) => {
    const retornos = row.pd_retorno_empresas_cuentas?.filter((item) => item.empresa || item.cuenta) ?? [];

    if (retornos.length) {
        return (
            <div className="flex min-w-0 flex-col gap-1 text-sm text-secondary">
                {retornos.map((item, index) => (
                    <span key={`${item.codigo ?? index}-${item.empresa ?? ""}-${item.cuenta ?? ""}`}>
                        {[item.empresa, item.cuenta, item.monto == null ? null : formatMoney(item.monto)].filter(Boolean).join(" | ") || "-"}
                    </span>
                ))}
            </div>
        );
    }

    const empresa = row.pd_retorno_nombre_empresa_ingreso ?? row.nombre_empresa_ingreso;
    const cuenta = row.pd_retorno_nombre_banco_empresa_cuenta_ingreso ?? row.nombre_banco_empresa_cuenta_ingreso;
    return <span className="text-sm text-secondary">{[empresa, cuenta].filter(Boolean).join(" | ") || "-"}</span>;
};

const getPagoDeudaStepLabel = (row: OperacionProceso) => {
    const estado = (row.nombre_estado ?? "").trim().toUpperCase();
    if (row.flag_comision_registrada || estado === "PAGADO") return "Paso 4";
    if (hasDevolucionConfirmada(row) || estado === "DEVUELTO") return "Paso 3";
    if (estado === "PROCESADO" || estado === "TRANSFERIDO") return "Paso 2";
    return "Paso 1";
};

const getExportValue = <T extends { id: number }>(
    row: T,
    column: { key: keyof T | string; render?: (row: T) => unknown },
) => {
    const rendered = column.render?.(row);
    if (typeof rendered === "string" || typeof rendered === "number") return rendered;

    const raw = row[column.key as keyof T];
    if (Array.isArray(raw)) return raw.join(", ");
    return raw ?? "";
};

const isPendingOperation = (row: OperacionProceso) => row.nombre_estado?.trim().toUpperCase() === "PENDIENTE";
const isPaidOperation = (row: OperacionProceso) => row.nombre_estado?.trim().toUpperCase() === "PAGADO";
const isProcessedOperation = (row: OperacionProceso) => row.nombre_estado?.trim().toUpperCase() === "PROCESADO";
const isPagoDeudaTransferido = (row: OperacionProceso) => getPagoDeudaEstadoVisual(row).label === "Transferido";
const isPosSolicitado = (row: OperacionProceso) => {
    const estado = row.nombre_estado?.trim().toUpperCase() ?? "";
    return estado === "PENDIENTE" || estado === "SOLICITADO";
};
const isPagoDeudaDerivable = (row: OperacionProceso) => getPagoDeudaEstadoVisual(row).action === "transferencia";
const quickActionRuleTabs: BancariaTab[] = ["Efectivizacion", "Derivados", "POS"];
const toNumber = (value: unknown) => Number(value ?? 0);

const getCalculationPayload = (row: OperacionProceso) => ({
    p_monto_deposito_cliente: toNumber(row.monto_deposito_cliente),
    p_comision_servicio: toNumber(row.comision_servicio),
    p_monto_minimo_deposito_servicio: toNumber(row.monto_minimo_deposito_servicio),
    p_comision_minima_servicio: toNumber(row.comision_minima_servicio),
    p_comision_monto_extra_servicio: toNumber(row.comision_monto_extra_servicio),
    p_flag_por_sol_comision_banco_ingreso: Boolean(row.flag_por_sol_comision_banco_ingreso),
    p_comision_banco_ingreso: toNumber(row.comision_banco_ingreso),
    p_comision_minimo_banco_ingreso: toNumber(row.comision_minimo_banco_ingreso),
    p_comision_igv_banco_ingreso: toNumber(row.comision_igv_banco_ingreso),
    p_monto_itf_ingreso: toNumber(row.monto_itf_ingreso),
    p_comision_transf_banco_salida: toNumber(row.comision_transf_banco_salida),
    p_comision_transf_inter_banco_salida: toNumber(row.comision_transf_inter_banco_salida),
    p_monto_itf_salida: toNumber(row.monto_itf_salida),
    p_id_empresa_salida: row.id_empresa_salida ?? null,
    p_id_empresa_cuenta_salida: row.id_empresa_cuenta_salida ?? null,
    p_id_banco_empresa_cuenta_salida: row.id_banco_empresa_cuenta_salida ?? null,
    p_id_banco_cliente_transferencia: row.id_banco_cliente_transferencia ?? row.id_banco_empresa_cuenta_salida ?? null,
});

export const BancariaOperationalTabs = ({
    activeAccountId,
    activeCajaId,
    activeCompanyCaja,
    activeCompanyId,
    companies,
    downloadKey = 0,
    emptyText = "Sin operaciones para esta bandeja.",
    enabled = true,
    embedded = false,
    historyDate = null,
    presentation = "operational",
    readOnly = false,
    showCompanyTabs = true,
    flowTabsAsButtons = false,
    onChanged,
    onMetricsChanged,
    onCompanyChange,
    refreshKey = 0,
    ruta,
    visibleTabs: requestedTabs,
}: BancariaOperationalTabsProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState<BancariaTab>("Efectivizacion");
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [actionRefreshKey, setActionRefreshKey] = useState(0);
    const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);
    const [code, setCode] = useState("");
    const [dni, setDni] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [pendingAction, setPendingAction] = useState<"Derivar" | "Emp. Ingreso" | "Emp. Salida" | "Reasignar" | "Transferencia" | "Match" | "Modalidad" | null>(null);
    const [bankDestinations, setBankDestinations] = useState<BancariaBankDestination[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [selectedOperationsById, setSelectedOperationsById] = useState<Record<number, { row: OperacionProceso; tab: BancariaTab }>>({});
    const [individualActionIds, setIndividualActionIds] = useState<number[]>([]);
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [dniEdit, setDniEdit] = useState<{ row: OperacionProceso; value: string } | null>(null);
    const [isSavingDni, setIsSavingDni] = useState(false);
    const [codigoOperacionEdit, setCodigoOperacionEdit] = useState<{
        row: OperacionProceso;
        type: "transferencia" | "comision";
        value: string;
    } | null>(null);
    const [isSavingCodigoOperacion, setIsSavingCodigoOperacion] = useState(false);
    const [savingPagoDeudaEstadoIds, setSavingPagoDeudaEstadoIds] = useState<number[]>([]);
    const [savingPosEstadoIds, setSavingPosEstadoIds] = useState<number[]>([]);
    const [confirmQuickAction, setConfirmQuickAction] = useState<"Directo" | null>(null);
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const [isRollbackProcessing, setIsRollbackProcessing] = useState(false);
    const [movementToDelete, setMovementToDelete] = useState<MovimientoMerged | null>(null);
    const [isDeletingMovement, setIsDeletingMovement] = useState(false);
    const [movementToReturn, setMovementToReturn] = useState<MovimientoMerged | null>(null);
    const [isReturningRetention, setIsReturningRetention] = useState(false);
    const [operationToDelete, setOperationToDelete] = useState<OperacionProceso | null>(null);
    const [operationToRestore, setOperationToRestore] = useState<OperacionProceso | null>(null);
    const [isProcessingOperationDelete, setIsProcessingOperationDelete] = useState(false);
    const [isProcessingOperationRestore, setIsProcessingOperationRestore] = useState(false);
    const handledDownloadKeyRef = useRef(0);
    const isActiveDigitalWallet = isDigitalWalletBank(activeCompanyCaja);
    const clearSelection = useCallback(() => {
        setSelectedIds([]);
        setSelectedOperationsById({});
    }, []);
    const visibleTabs = useMemo(
        () => {
            if (requestedTabs) return requestedTabs;
            if (isActiveDigitalWallet) return [] as BancariaTab[];
            if (ruta === "safetypay") return ["Efectivizacion", "Movimientos", "Retenidos", "Eliminados"] as BancariaTab[];
            const hasRetencion = retentionRoutes.has(ruta) ||
                companies.some((c) => c.flag_retencion_cuenta);
            const available = hasRetencion ? tabs : tabs.filter((tab) => tab !== "Retenidos");
            return softDeleteRoutes.has(ruta) ? available : available.filter((tab) => tab !== "Eliminados");
        },
        [isActiveDigitalWallet, requestedTabs, ruta, companies],
    );

    useEffect(() => {
        setActiveFilter("Todos");
        setCode("");
        setDateFrom("");
        setDateTo("");
        setIndividualActionIds([]);
    }, [activeTab]);

    useEffect(() => {
        clearSelection();
        setIndividualActionIds([]);
        setPendingAction(null);
        setConfirmQuickAction(null);
    }, [activeAccountId, activeCompanyId, clearSelection, code, dateFrom, dateTo, dni, historyDate, refreshKey]);

    useEffect(() => {
        if (isActiveDigitalWallet) {
            setActiveTab("Movimientos");
            setActiveFilter("Todos");
            setCode("");
            setDateFrom("");
            setDateTo("");
            clearSelection();
            setPendingAction(null);
            setConfirmQuickAction(null);
        }
    }, [clearSelection, isActiveDigitalWallet]);

    useEffect(() => {
        if (!visibleTabs.includes(activeTab)) {
            setActiveTab(visibleTabs[0] ?? "Efectivizacion");
        }
    }, [activeTab, visibleTabs]);

    const currentTab = activeTab;

    useEffect(() => {
        if (currentTab !== "POS" && currentTab !== "Pago Deuda") {
            setBankDestinations([]);
            return;
        }

        let ignore = false;
        Promise.all(
            bancariaRouteKeys
                .filter((route) => route !== "safetypay")
                .map((route) => operacionesRpcService.getRutaCajas(route)),
        )
            .then((groups) => {
                if (ignore) return;

                const destinations = new Map<number, BancariaBankDestination>();
                groups.flat().forEach((item) => {
                    if (
                        item.id_estado === 1 &&
                        item.flag_caja_ingreso_principal &&
                        item.id_banco &&
                        item.ruta !== ruta
                    ) {
                        destinations.set(item.id_banco, {
                            id: item.id_banco,
                            nombre: item.nombre_banco,
                            ruta: item.ruta as BancariaBankDestination["ruta"],
                        });
                    }
                });

                setBankDestinations([...destinations.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            })
            .catch(() => {
                if (!ignore) setBankDestinations([]);
            });

        return () => {
            ignore = true;
        };
    }, [currentTab, ruta]);

    useEffect(() => {
        let ignore = false;

        estadoService
            .getList({})
            .then((rows) => {
                if (ignore) return;
                const estados = rows.map((row) => ({ id: Number(row.id), nombre: String(row.nombre ?? "") }));
                setEstadoPagado(estados.find((item) => item.nombre.toUpperCase() === "PAGADO") ?? null);
                setEstadoPendiente(estados.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ?? null);
            })
            .catch(() => addToast("error", "Error al cargar estados operativos."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

    const contract = useMemo(() => {
        const base = tabContracts[currentTab];

        if (currentTab === "POS") {
            return { ...base, actions: ["Emp. Salida", "Pagar", "Derivar", "Reiniciar"] };
        }

        if (currentTab === "Pago Deuda") {
            return { ...base, actions: ["Emp. Salida", "Transferencia", "Derivar", "Reiniciar"] };
        }

        if (ruta === "safetypay" && currentTab === "Efectivizacion") {
            return {
                ...base,
                actions: ["Emp. Salida", "Pagar", "Derivar", "Reiniciar", "Eliminar Excel"],
            };
        }

        return base;
    }, [currentTab, ruta]);
    const {
        error,
        isLoading,
        movimientos,
        operaciones,
        refreshBandeja,
        replaceOperacion,
        replaceOperaciones,
    } = useBancariaBandeja({
        activeAccountId,
        activeCajaId,
        activeCompanyId,
        activeFilter,
        code,
        dateFrom,
        dateTo,
        dni,
        historyDate,
        enabled,
        refreshKey: refreshKey + actionRefreshKey,
        ruta,
        tab: currentTab,
    });

    useEffect(() => {
        setSelectedOperationsById((current) => {
            const next = { ...current };
            let changed = false;

            Object.keys(next).forEach((id) => {
                if (!selectedIds.includes(Number(id))) {
                    delete next[Number(id)];
                    changed = true;
                }
            });

            operaciones.forEach((row) => {
                const existing = next[row.id];
                if (selectedIds.includes(row.id) && (!existing || existing.tab === currentTab) && existing?.row !== row) {
                    next[row.id] = { row, tab: currentTab };
                    changed = true;
                }
            });

            return changed ? next : current;
        });
    }, [currentTab, operaciones, selectedIds]);

    const { data: tabBadges, error: tabBadgesError } = useBancariaTabBadges(
        ruta,
        null,
        activeAccountId,
        historyDate,
        refreshKey + actionRefreshKey + metricsRefreshKey,
        enabled,
    );
    const { data: empresaBadges, error: empresaBadgesError } = useBancariaEmpresaBadges(
        ruta,
        currentTab,
        null,
        historyDate,
        refreshKey + actionRefreshKey + metricsRefreshKey,
        enabled,
    );
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const isHistoryMode = Boolean(historyDate);
    const canUseProcesoActions = procesoActionTabs.includes(currentTab) && !isHistoryMode && !readOnly;
    const hasSelection = selectedIds.length > 0;
    const commercialCompanies = useMemo(() => companies.filter((company) => !isDigitalWalletBank(company)), [companies]);
    const actionCompanies = useMemo(
        () => commercialCompanies.filter((company) => !activeCompanyId || company.id_empresa !== activeCompanyId),
        [activeCompanyId, commercialCompanies],
    );
    const handlePagoDeudaTransferenciaRow = useCallback(async (row: OperacionProceso) => {
        if (!String(row.pd_codigo_operacion_transferencia ?? row.codigo_operacion_deposito_cliente ?? "").trim()) {
            addToast("error", "Registra el codigo de operacion de la transferencia antes de continuar.");
            return;
        }

        setSavingPagoDeudaEstadoIds((current) => [...current, row.id]);
        try {
            const saved = await operacionesRpcService.patchPagoDeudaSalida({
                p_id_operacion: row.id,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
                p_ruta_destino: ruta,
            });
            replaceOperacion(saved);
            setMetricsRefreshKey((value) => value + 1);
            onMetricsChanged?.();
            addToast("success", "Transferencia confirmada.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo confirmar la transferencia.");
        } finally {
            setSavingPagoDeudaEstadoIds((current) => current.filter((id) => id !== row.id));
        }
    }, [addToast, onMetricsChanged, replaceOperacion, ruta, userId, userName]);

    const handleCodigoOperacionSave = useCallback(async () => {
        if (!codigoOperacionEdit) return;

        setIsSavingCodigoOperacion(true);
        try {
            await pagoDeudaService.patchCodigoOperacion({
                p_id_operacion: codigoOperacionEdit.row.id,
                p_tipo_codigo: codigoOperacionEdit.type === "transferencia" ? "TRANSFERENCIA" : "COMISION",
                p_codigo_operacion: codigoOperacionEdit.value,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
            });
            setCodigoOperacionEdit(null);
            setActionRefreshKey((value) => value + 1);
            addToast("success", "Codigo de operacion actualizado.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo actualizar el codigo de operacion.");
        } finally {
            setIsSavingCodigoOperacion(false);
        }
    }, [addToast, codigoOperacionEdit, userId, userName]);

    const handlePosEstadoRow = useCallback(async (row: OperacionProceso) => {
        const estado = row.nombre_estado?.trim().toUpperCase() ?? "";
        const isSolicitado = estado === "PENDIENTE" || estado === "SOLICITADO";
        if (!isSolicitado || !estadoPagado) return;

        setSavingPosEstadoIds((current) => [...current, row.id]);
        try {
            const payload = buildOperacionPagadoPayload(row.id, estadoPagado, { userId, userName });
            const saved = await operacionesRpcService.patchOperacionPagado(payload);
            replaceOperacion(saved);
            setMetricsRefreshKey((value) => value + 1);
            onMetricsChanged?.();
            addToast("success", "Solicitud POS atendida correctamente.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo atender la solicitud POS.");
        } finally {
            setSavingPosEstadoIds((current) => current.filter((id) => id !== row.id));
        }
    }, [addToast, estadoPagado, onMetricsChanged, replaceOperacion, userId, userName]);

    const handleDeleteMovement = useCallback(async () => {
        if (!movementToDelete) return;

        setIsDeletingMovement(true);
        try {
            await operacionesRpcService.deleteMovimientoCajaManual({
                p_id: movementToDelete.id,
                p_id_usuario: userId,
            });
            addToast("success", "Movimiento eliminado y caja revertida correctamente.");
            setMovementToDelete(null);
            setSelectedIds([]);
            setActionRefreshKey((value) => value + 1);
            setMetricsRefreshKey((value) => value + 1);
            onChanged?.();
            onMetricsChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo eliminar el movimiento.");
        } finally {
            setIsDeletingMovement(false);
        }
    }, [addToast, movementToDelete, onChanged, onMetricsChanged, userId]);

    const handleReturnRetencion = useCallback(async () => {
        if (!movementToReturn?.id_operacion_proceso) return;

        setIsReturningRetention(true);
        try {
            await operacionesRpcService.retornarRetencion({
                p_id: movementToReturn.id_operacion_proceso,
                p_id_usuario_gestor: userId,
                p_nombre_usuario_gestor: userName,
            });
            addToast("success", "Retencion retornada: la operacion volvio al tab Retenidos y la caja fue revertida.");
            setMovementToReturn(null);
            setSelectedIds([]);
            setActionRefreshKey((value) => value + 1);
            setMetricsRefreshKey((value) => value + 1);
            onChanged?.();
            onMetricsChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo retornar la retencion.");
        } finally {
            setIsReturningRetention(false);
        }
    }, [addToast, movementToReturn, onChanged, onMetricsChanged, userId, userName]);

    const handleDeleteOperation = useCallback(async () => {
        if (!operationToDelete) return;
        setIsProcessingOperationDelete(true);
        try {
            await operacionesRpcService.deleteOperacionProceso({ p_id: operationToDelete.id, p_id_usuario: userId });
            addToast("success", "Operacion eliminada correctamente.");
            setOperationToDelete(null);
            setSelectedIds([]);
            setActionRefreshKey((value) => value + 1);
            setMetricsRefreshKey((value) => value + 1);
            onChanged?.();
            onMetricsChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo eliminar la operacion.");
        } finally {
            setIsProcessingOperationDelete(false);
        }
    }, [addToast, onChanged, onMetricsChanged, operationToDelete, userId]);

    const handleRestoreOperation = useCallback(async () => {
        if (!operationToRestore) return;
        setIsProcessingOperationRestore(true);
        try {
            await operacionesRpcService.restoreOperacionProceso({ p_id: operationToRestore.id, p_id_usuario: userId });
            addToast("success", "Operacion restaurada correctamente.");
            setOperationToRestore(null);
            setSelectedIds([]);
            setActionRefreshKey((value) => value + 1);
            setMetricsRefreshKey((value) => value + 1);
            onChanged?.();
            onMetricsChanged?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo restaurar la operacion.");
        } finally {
            setIsProcessingOperationRestore(false);
        }
    }, [addToast, onChanged, onMetricsChanged, operationToRestore, userId]);

    const operationColumnsByTab = useMemo(() => ({
        Efectivizacion: baseOperationColumns,
        Eliminados: baseOperationColumns,
        "Pago Deuda": [
            { key: "pasos", label: "Pasos", render: (row: OperacionProceso) => presentation === "plain" ? <span className="text-sm text-secondary">{getPagoDeudaStepLabel(row)}</span> : <PagoDeudaSteps row={row} /> },
            { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => presentation === "plain" ? <span className="text-sm text-secondary">{row.dni_cliente || "-"}</span> : (
                <div className="flex items-center gap-1">
                    <CopyableDni value={row.dni_cliente} />
                    <Button size="xs" color="tertiary" iconLeading={Edit03} aria-label="Editar DNI" isDisabled={readOnly || hasDevolucionConfirmada(row)} onClick={() => setDniEdit({ row, value: row.dni_cliente ?? "" })} />
                </div>
            ) },
            {
                key: "codigo_operacion_transferencia",
                label: "Cod. Op.\nTransferencia",
                headerClassName: "min-w-32 whitespace-pre-line",
                render: (row: OperacionProceso) => {
                    const isEditing = codigoOperacionEdit?.row.id === row.id && codigoOperacionEdit.type === "transferencia";
                    const editable = !readOnly && !isHistoryMode && isPendingOperation(row) && !row.flag_retenido;

                    if (presentation === "plain") {
                        return <span className="text-sm text-secondary">{row.pd_codigo_operacion_transferencia ?? row.codigo_operacion_deposito_cliente ?? "-"}</span>;
                    }

                    return (
                        <PagoDeudaCodigoCell
                            code={row.pd_codigo_operacion_transferencia ?? row.codigo_operacion_deposito_cliente}
                            editable={editable}
                            isEditing={isEditing}
                            isSaving={isSavingCodigoOperacion}
                            value={isEditing ? codigoOperacionEdit.value : (row.pd_codigo_operacion_transferencia ?? row.codigo_operacion_deposito_cliente ?? "")}
                            onChange={(value) => setCodigoOperacionEdit((current) => current ? { ...current, value } : current)}
                            onEdit={() => setCodigoOperacionEdit({ row, type: "transferencia", value: row.pd_codigo_operacion_transferencia ?? row.codigo_operacion_deposito_cliente ?? "" })}
                            onBlur={() => void handleCodigoOperacionSave()}
                        />
                    );
                },
            },
            {
                key: "empresa_cuenta_salida",
                label: "Empresa Cuenta",
                headerClassName: "min-w-32",
                render: (row: OperacionProceso) => presentation === "plain" ? (
                    <span className="text-sm text-secondary">{[row.nombre_empresa_salida, row.nombre_banco_empresa_cuenta_salida].filter(Boolean).join(" | ") || "-"}</span>
                ) : (
                    <EmpresaCuentaBadges empresa={row.nombre_empresa_salida} cuenta={row.nombre_banco_empresa_cuenta_salida} />
                ),
            },
            {
                key: "nombre_banco_cliente",
                label: "Cuenta Cliente",
                headerClassName: "min-w-28",
                render: (row: OperacionProceso) => presentation === "plain" ? <span className="text-sm text-secondary">{row.nombre_banco_cliente || "-"}</span> : <CompactBadgeLine>{row.nombre_banco_cliente || "-"}</CompactBadgeLine>,
            },
            { key: "monto_transferencia_cliente", label: "Monto\nTransferencia", headerClassName: "min-w-32 whitespace-pre-line", cellClassName: "font-semibold text-concept-transferencia tabular-nums", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "codigo_operacion_devolucion", label: "Cod. Op.\nDevolucion", headerClassName: "min-w-32 whitespace-pre-line", render: (row: OperacionProceso) => <PagoDeudaCodigosRetorno row={row} /> },
            {
                key: "empresa_cuenta_ingreso",
                label: "Empresa Cuenta",
                render: (row: OperacionProceso) => presentation === "plain" ? <PagoDeudaRetornoEmpresaCuentaText row={row} /> : <PagoDeudaRetornoEmpresaCuentaBadges row={row} />,
                headerClassName: "min-w-48",
                cellClassName: "min-w-48 max-w-56 whitespace-normal",
            },
            { key: "monto_devuelto", label: "Monto\nDevolucion", headerClassName: "min-w-32 whitespace-pre-line", render: (row: OperacionProceso) => formatMoney(row.pd_retorno_monto_devolucion ?? row.monto_devuelto ?? 0) },
            { key: "estado_visual", label: "Estado", render: (row: OperacionProceso) => presentation === "plain" ? <span className="text-sm text-secondary">{row.nombre_estado || "-"}</span> : (
                <PagoDeudaEstadoButton
                    row={row}
                    isLoading={savingPagoDeudaEstadoIds.includes(row.id)}
                    onTransferencia={isHistoryMode ? undefined : handlePagoDeudaTransferenciaRow}
                />
            ) },
            {
                key: "fecha_registro",
                label: "Hora",
                render: (row: OperacionProceso) => (
                    <div className="flex flex-col leading-tight">
                        <span>{formatOperationTime(row.fecha_registro)}</span>
                        <span className="text-xs text-tertiary">{formatOperationDate(row.fecha_registro)}</span>
                    </div>
                ),
            },
        ],
        Derivados: [
            { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
            { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => <CopyableDni value={row.dni_cliente} /> },
            { key: "nombre_estado", label: "Estado" },
            { key: "ruta_origen", label: "Origen", render: (row: OperacionProceso) => row.ruta_origen ? getRutaLabel(row.ruta_origen as OperacionRuta) : "" },
            { key: "ruta_destino", label: "Destino", render: (row: OperacionProceso) => row.ruta_destino ? getRutaLabel(row.ruta_destino as OperacionRuta) : "" },
            { key: "nombre_usuario_deriva", label: "Deriva" },
            { key: "monto_transferencia_cliente", label: "Monto", cellClassName: "font-semibold text-concept-transferencia tabular-nums", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "fecha_derivacion", label: "Derivacion", render: (row: OperacionProceso) => row.fecha_derivacion ? new Date(row.fecha_derivacion).toLocaleDateString("es-PE") : "" },
        ],
        POS: [
            { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
            { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => <CopyableDni value={row.dni_cliente} /> },
            { key: "nombre_cliente", label: "Cliente" },
            {
                key: "empresa_cuenta_salida",
                label: "Empresa Cuenta",
                render: (row: OperacionProceso) => (
                    <EmpresaCuentaBadges empresa={row.nombre_empresa_salida} cuenta={row.nombre_banco_empresa_cuenta_salida} />
                ),
            },
            { key: "monto_transferencia", label: "Monto Transferencia", cellClassName: "font-semibold text-concept-transferencia tabular-nums", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "comision", label: "Comisión", render: (row: OperacionProceso) => formatMoney(row.resultado_comision_servicio ?? 0) },
            {
                key: "estado_visual",
                label: "Estado",
                render: (row: OperacionProceso) => {
                    const estado = row.nombre_estado?.trim().toUpperCase() ?? "";
                    const isSolicitado = estado === "PENDIENTE" || estado === "SOLICITADO";
                    const isPagado = estado === "PAGADO";

                    return (
                        <Button
                            size="xs"
                            color={isSolicitado ? "primary" : "secondary"}
                            isDisabled={!isSolicitado || isHistoryMode || savingPosEstadoIds.includes(row.id)}
                            isLoading={savingPosEstadoIds.includes(row.id)}
                            onClick={() => handlePosEstadoRow(row)}
                        >
                            {isSolicitado ? "Solicitado" : isPagado ? "Pagado" : row.nombre_estado}
                        </Button>
                    );
                },
            },
            { key: "fecha_registro", label: "Fecha", render: (row: OperacionProceso) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
        ],
        Retenidos: [
            { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
            { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => <CopyableDni value={row.dni_cliente} /> },
            { key: "monto_transferencia_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "fecha_deposito_cliente", label: "Fecha Deposito", render: (row: OperacionProceso) => row.fecha_deposito_cliente ? new Date(row.fecha_deposito_cliente).toLocaleString("es-PE") : "-" },
            { key: "fecha_corte_recaudacion", label: "Fecha Corte", render: (row: OperacionProceso) => row.fecha_corte_recaudacion ? new Date(row.fecha_corte_recaudacion).toLocaleString("es-PE") : "-" },
            { key: "fecha_liberacion_abono", label: "Fecha Abono", render: (row: OperacionProceso) => row.fecha_liberacion_abono ? new Date(row.fecha_liberacion_abono).toLocaleString("es-PE") : "-" },
            { key: "motivo_retencion", label: "Motivo" },
            {
                key: "flag_liberable_abono",
                label: "Liberable",
                render: (row: OperacionProceso) => (
                    <CompactBadgeLine color={row.flag_liberable_abono ? "success" : "gray"}>
                        {row.flag_liberable_abono ? "Si" : "No"}
                    </CompactBadgeLine>
                ),
            },
        ],
    } as Record<string, { key: string; label: string; render?: (row: OperacionProceso) => React.ReactNode }[]>), [codigoOperacionEdit, handleCodigoOperacionSave, handlePagoDeudaTransferenciaRow, handlePosEstadoRow, isHistoryMode, isSavingCodigoOperacion, presentation, readOnly, savingPagoDeudaEstadoIds, savingPosEstadoIds]);
    const currentOperationColumns = currentTab === "Movimientos" ? baseOperationColumns : operationColumnsByTab[currentTab];
    const currentMovementColumns = useMemo(
        () => getMovementColumns(ruta === "safetypay", isHistoryMode ? undefined : setMovementToDelete, isHistoryMode ? undefined : setMovementToReturn),
        [isHistoryMode, ruta],
    );
    const selectedOperations = selectedIds
        .map((id) => selectedOperationsById[id])
        .filter((selection): selection is { row: OperacionProceso; tab: BancariaTab } => Boolean(selection));
    const selectedTransferSummary = useMemo(() => {
        if (!["Efectivizacion", "Pago Deuda", "Derivados", "POS"].includes(currentTab)) return null;

        const transferRows = selectedOperations.filter(({ row, tab }) => {
            if (!["Efectivizacion", "Pago Deuda", "Derivados", "POS"].includes(tab)) return false;
            if (tab === "Pago Deuda") {
                return getPagoDeudaEstadoVisual(row).action === "transferencia";
            }

            return !isPaidOperation(row);
        });

        if (!transferRows.length) return null;

        return {
            count: transferRows.length,
            amount: transferRows.reduce(
                (sum, { row }) => sum + toNumber(row.monto_transferencia_cliente ?? row.monto_deposito_cliente),
                0,
            ),
        };
    }, [currentTab, selectedOperations]);

    const actionIds = individualActionIds.length ? individualActionIds : selectedIds;

    const getEligibleIdsForAction = (action: string) => {
        if (currentTab === "Pago Deuda") {
            const actionRows = operaciones.filter((row) => actionIds.includes(row.id));
            if (action === "Transferencia") return actionRows.filter(isPendingOperation).map((row) => row.id);
            if (action === "Derivar") return actionRows.filter(isPagoDeudaDerivable).map((row) => row.id);
            if (action === "Emp. Salida") return actionRows.filter(isPendingOperation).map((row) => row.id);
            if (action === "Reiniciar") return actionRows.filter(isPagoDeudaTransferido).map((row) => row.id);
            if (action === "Match" || action === "Pagar") return actionRows.filter(isProcessedOperation).map((row) => row.id);
            return actionIds;
        }

        if (currentTab === "POS") {
            const actionRows = operaciones.filter((row) => actionIds.includes(row.id));
            if (action === "Emp. Salida") return actionRows.filter(isPosSolicitado).map((row) => row.id);
            if (action === "Derivar") return actionRows.filter(isPosSolicitado).map((row) => row.id);
            if (action === "Pagar") return actionRows.filter(isPosSolicitado).map((row) => row.id);
            if (action === "Reiniciar") return actionRows.filter(isPaidOperation).map((row) => row.id);
            return actionIds;
        }

        if (!quickActionRuleTabs.includes(currentTab)) return actionIds;

        if (["Pagar", "Directo", "Derivar", "Reasignar", "Emp. Ingreso", "Emp. Salida", "Modalidad"].includes(action)) {
            return operaciones.filter((row) => actionIds.includes(row.id)).filter(isPendingOperation).map((row) => row.id);
        }

        if (action === "Reiniciar") {
            return operaciones.filter((row) => actionIds.includes(row.id)).filter(isPaidOperation).map((row) => row.id);
        }

        return actionIds;
    };

    const handleDniEditSave = async (row: OperacionProceso, newDni: string) => {
        setIsSavingDni(true);
        try {
            const clientes = await clienteService.getList({ p_numero_documento: newDni });
            const cliente = clientes?.[0];
            const payload: Record<string, unknown> = { p_id: row.id, p_dni_cliente: newDni };
            if (cliente) {
                payload.p_id_cliente = Number(cliente.id);
                payload.p_nombre_cliente = String(cliente.nombre ?? "");
            }
            const saved = await operacionesRpcService.patchOperacionBase(payload);
            if (row.id_operacion_padre) {
                await operacionesRpcService.patchOperacionBase({ p_id: row.id_operacion_padre, p_dni_cliente: newDni, ...(cliente ? { p_id_cliente: Number(cliente.id), p_nombre_cliente: String(cliente.nombre ?? "") } : {}) });
            }
            replaceOperacion(saved);
            refreshMetrics();
            addToast("success", "DNI actualizado.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo actualizar el DNI.");
        } finally {
            setIsSavingDni(false);
            setDniEdit(null);
        }
    };

    const getEligibleIdsOrNotify = (action: string) => {
        const eligibleIds = getEligibleIdsForAction(action);

        if (selectedIds.length && !eligibleIds.length) {
            const expectedState =
                currentTab === "Pago Deuda" && (action === "Match" || action === "Pagar")
                    ? "Procesado"
                    : currentTab === "Pago Deuda" && action === "Reiniciar"
                      ? "Transferido"
                    : action === "Reiniciar"
                      ? "Pagado"
                      : "Pendiente";
            addToast("error", `No hay operaciones en estado ${expectedState} para ${action.toLowerCase()}.`);
        }

        return eligibleIds;
    };
    const pendingActionEligibleCount = pendingAction ? getEligibleIdsForAction(pendingAction).length : actionIds.length;

    const refreshMetrics = () => {
        setMetricsRefreshKey((value) => value + 1);
        onMetricsChanged?.();
    };

    const applyUpdatedRows = (updatedRows: OperacionProceso[]) => {
        if (updatedRows.length) {
            replaceOperaciones(updatedRows);
        } else {
            refreshBandeja();
        }

        refreshMetrics();
    };

    useEffect(() => {
        if (!downloadKey) return;
        if (handledDownloadKeyRef.current === downloadKey) return;
        handledDownloadKeyRef.current = downloadKey;

        if (currentTab === "Movimientos") {
            downloadCsv(
                `${ruta}-${currentTab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
                currentMovementColumns.map((column) => column.label),
                movimientos.map((row) => currentMovementColumns.map((column) => getExportValue(row, column))),
            );
            addToast("success", "Bandeja descargada correctamente.");
            return;
        }

        downloadCsv(
            `${ruta}-${currentTab.toLowerCase().replaceAll(" ", "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
            currentOperationColumns.map((column) => column.label),
            operaciones.map((row) => currentOperationColumns.map((column) => getExportValue(row, column))),
        );
        addToast("success", "Bandeja descargada correctamente.");
    }, [addToast, currentMovementColumns, currentOperationColumns, currentTab, downloadKey, movimientos, operaciones, ruta]);

    const handleToggleRow = (id: number) => {
        const isSelected = selectedIds.includes(id);
        const row = operaciones.find((item) => item.id === id);

        setSelectedIds((current) => (isSelected ? current.filter((item) => item !== id) : [...current, id]));
        setSelectedOperationsById((current) => {
            if (isSelected) {
                const next = { ...current };
                delete next[id];
                return next;
            }

            return row ? { ...current, [id]: { row, tab: currentTab } } : current;
        });
    };

    const handleFilterChange = (value: string) => {
        if (value !== activeFilter) clearSelection();
        setActiveFilter(value);
    };

    const isActionDisabled = (action: string) => {
        return isBancariaActionDisabled({
            action,
            activeTab: currentTab,
            companyCount: actionCompanies.length,
            hasSelection: hasSelection && getEligibleIdsForAction(action).length > 0,
            isApplyingAction: isApplyingAction || isHistoryMode,
        });
    };

    const handleAction = async (action: string) => {
        if (action === "Eliminar Excel") {
            if (!activeCompanyId || !activeAccountId) {
                addToast("error", "Selecciona una empresa y cuenta antes de eliminar una carga.");
                return;
            }

            setIsRollbackModalOpen(true);
            return;
        }

        if (action === "Transferencia" && currentTab === "Pago Deuda") {
            if (!selectedIds.length) {
                addToast("error", "Selecciona al menos una operacion.");
                return;
            }

            setIsApplyingAction(true);

            try {
                const eligibleIds = getEligibleIdsOrNotify(action);
                if (!eligibleIds.length) return;

                if (currentTab === "Pago Deuda") {
                    const missingTransferCode = operaciones
                        .filter((row) => eligibleIds.includes(row.id))
                        .some((row) => !String(row.pd_codigo_operacion_transferencia ?? row.codigo_operacion_deposito_cliente ?? "").trim());

                    if (missingTransferCode) {
                        throw new Error("Registra el codigo de operacion de la transferencia antes de continuar.");
                    }
                }

                const updatedRows: OperacionProceso[] = [];

                for (const id of eligibleIds) {
                    const saved = await operacionesRpcService.patchPagoDeudaSalida({
                        p_id_operacion: id,
                        p_id_usuario_gestor: userId,
                        p_nombre_usuario_gestor: userName,
                        p_ruta_destino: ruta,
                    });
                    updatedRows.push(saved);
                }

                setSelectedIds([]);
                applyUpdatedRows(updatedRows);
                addToast("success", `Transferencias confirmadas: ${eligibleIds.length}`);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error al confirmar transferencias.";
                addToast("error", message);
            } finally {
                setIsApplyingAction(false);
            }
            return;
        }

        if (action === "Derivar" || action === "Emp. Ingreso" || action === "Emp. Salida" || action === "Reasignar" || action === "Match" || action === "Modalidad") {
            if (!actionIds.length) {
                addToast("error", "Selecciona al menos una operación.");
                return;
            }
            if (!getEligibleIdsOrNotify(action).length) return;
            if (action === "Match" && actionIds.length !== 1) {
                addToast("error", "Selecciona una sola operacion para hacer match.");
                return;
            }
            setPendingAction(action);
            return;
        }

        if (action === "Forzar Abono") {
            if (!selectedIds.length) {
                addToast("error", "Selecciona al menos una operación.");
                return;
            }

            if (!estadoPendiente) {
                addToast("error", "No se encontró el estado Pendiente.");
                return;
            }

            setIsApplyingAction(true);

            try {
                const updatedRows: OperacionProceso[] = [];
                for (const id of selectedIds) {
                    const saved = await operacionesRpcService.confirmarOperacionRetencion(buildOperacionRetencionConfirmPayload(id, { userId, userName }));
                    updatedRows.push(saved);
                }

                setSelectedIds([]);
                applyUpdatedRows(updatedRows);
                addToast("success", `Abonos forzados: ${selectedIds.length}`);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error al forzar abonos.";
                addToast("error", message);
            } finally {
                setIsApplyingAction(false);
            }
            return;
        }

        if (!["Pagar", "Reiniciar", "Directo"].includes(action)) return;

        if (!selectedIds.length) {
            addToast("error", "Selecciona al menos una operación.");
            return;
        }

        if (action === "Pagar" && !estadoPagado) {
            addToast("error", "No se encontró el estado Pagado.");
            return;
        }

        if (action === "Reiniciar" && !estadoPendiente) {
            addToast("error", "No se encontró el estado Pendiente.");
            return;
        }

        if (action === "Directo") {
            setConfirmQuickAction("Directo");
            return;
        }

        setIsApplyingAction(true);

        try {
            const eligibleIds = getEligibleIdsOrNotify(action);
            if (!eligibleIds.length) return;

            const updatedRows: OperacionProceso[] = [];

            if (action === "Pagar" && currentTab === "Efectivizacion" && estadoPagado) {
                const result = await operacionesRpcService.patchOperacionPagadoLote({
                    p_ids_operaciones: eligibleIds,
                    p_id_estado: estadoPagado.id,
                    p_nombre_estado: estadoPagado.nombre,
                    p_id_usuario_gestor: userId,
                    p_nombre_usuario_gestor: userName,
                });
                updatedRows.push(...(result.operaciones_actualizadas ?? []));
            } else {
                for (const id of eligibleIds) {
                    if (action === "Pagar" && estadoPagado) {
                        if (currentTab === "Pago Deuda") {
                            const saved = await pagoDeudaService.patchPagado({
                                p_id_operacion: id,
                                p_id_usuario_gestor: userId,
                                p_nombre_usuario_gestor: userName,
                            });
                            updatedRows.push(saved);
                        } else {
                            const saved = await operacionesRpcService.patchOperacionPagado(
                                buildOperacionPagadoPayload(id, estadoPagado, { userId, userName }),
                            );
                            updatedRows.push(saved);
                        }
                    }

                    if (action === "Reiniciar" && estadoPendiente) {
                        const saved = currentTab === "Pago Deuda"
                            ? await pagoDeudaService.patchReiniciarTransferencia({
                                p_id_operacion: id,
                                p_id_usuario_gestor: userId,
                                p_nombre_usuario_gestor: userName,
                            })
                            : await operacionesRpcService.patchOperacionReanudar(
                                buildOperacionReanudarPayload(id, estadoPendiente, { userId, userName }),
                            );
                        updatedRows.push(saved);
                    }

                    if (action === "Directo") {
                        const saved = await operacionesRpcService.patchOperacionDirectoCaja({
                            p_id: id,
                            p_id_usuario_gestor: userId,
                            p_nombre_usuario_gestor: userName,
                        });
                        updatedRows.push(saved);
                    }
                }
            }

            setSelectedIds([]);
            applyUpdatedRows(updatedRows);
            addToast("success", `Operaciones actualizadas: ${eligibleIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al actualizar operaciones.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    const handleRollbackExcel = async (idCargaExcel: number) => {
        setIsRollbackProcessing(true);

        try {
            const result = await operacionesRpcService.deleteOperacionCargaExcelRollback({
                p_id_carga_excel: idCargaExcel,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
            });
            const operacionesEliminadas = Number(result.operaciones_eliminadas ?? 0);

            setSelectedIds([]);
            setIsRollbackModalOpen(false);
            refreshBandeja();
            setActionRefreshKey((value) => value + 1);
            refreshMetrics();
            onChanged?.();
            addToast("success", `Carga eliminada correctamente. Operaciones eliminadas: ${operacionesEliminadas}.`);
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo eliminar la carga Excel.");
        } finally {
            setIsRollbackProcessing(false);
        }
    };

    const handleConfirmQuickAction = async () => {
        const action = confirmQuickAction;
        if (!action) return;
        setConfirmQuickAction(null);

        setIsApplyingAction(true);

        try {
            const eligibleIds = getEligibleIdsOrNotify(action);
            if (!eligibleIds.length) return;
            const updatedRows: OperacionProceso[] = [];

            for (const id of eligibleIds) {
                const saved = await operacionesRpcService.patchOperacionDirectoCaja({
                    p_id: id,
                    p_id_usuario_gestor: userId,
                    p_nombre_usuario_gestor: userName,
                });
                updatedRows.push(saved);
            }

            setSelectedIds([]);
            applyUpdatedRows(updatedRows);
            addToast("success", `Operaciones actualizadas: ${eligibleIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al actualizar operaciones.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    const handleModalAction = async (value: string, label: string) => {
        if (!pendingAction) return;

        setIsApplyingAction(true);

        try {
            const eligibleIds = getEligibleIdsOrNotify(pendingAction);
            if (!eligibleIds.length) return;
            const updatedRows: OperacionProceso[] = [];

            for (const id of eligibleIds) {
                if (pendingAction === "Derivar") {
                    const operation = operaciones.find((row) => row.id === id);
                    if (!operation) throw new Error("No se encontro la operacion seleccionada.");

                    let saved: OperacionProceso;
                    if (currentTab === "POS") {
                        const documento = String(operation.dni_cliente ?? "").replace(/\D/g, "");
                        saved = await operacionesRpcService.patchOperacionAsistida({
                            p_id: id,
                            p_id_banco_cliente: operation.id_banco_cliente,
                            p_dni_cliente: operation.dni_cliente,
                            p_nombre_cliente: operation.nombre_cliente,
                            p_id_comunidad: operation.id_comunidad,
                            p_nombre_comunidad: operation.nombre_comunidad,
                            p_monto_deposito_cliente: operation.monto_deposito_cliente,
                            p_id_usuario: userId,
                            p_nombre_usuario: userName,
                            p_tipo_documento_cliente: documento.length === 9 ? 2 : 1,
                            p_id_banco_destino: Number(value),
                        });
                    } else if (currentTab === "Pago Deuda") {
                        saved = await operacionesRpcService.patchPagoDeudaDerivarBanco({
                            p_id_operacion: id,
                            p_id_banco_destino: Number(value),
                            p_id_usuario_gestor: userId,
                            p_nombre_usuario_gestor: userName,
                        });
                    } else {
                        saved = await operacionesRpcService.patchOperacionDerivacion(
                            buildOperacionDerivacionPayload(id, ruta, value, { userId, userName }),
                        );
                    }
                    updatedRows.push(saved);
                }

                if (pendingAction === "Reasignar") {
                    const saved = await operacionesRpcService.patchOperacionUsuario(buildOperacionUsuarioPayload(id, Number(value), label));
                    updatedRows.push(saved);
                }

                if (pendingAction === "Modalidad") {
                    const saved = await operacionesRpcService.patchOperacionTipoRecaudacionSafetyPay({
                        p_id: id,
                        p_tipo_recaudacion_sf: value,
                        p_id_usuario_gestor: userId,
                        p_nombre_usuario_gestor: userName,
                    });
                    updatedRows.push(saved);
                }

                if (pendingAction === "Emp. Ingreso" || pendingAction === "Emp. Salida") {
                    const company = actionCompanies.find((item) => String(item.id) === value);

                    if (isDigitalWalletBank(company)) {
                        throw new Error("YAPE y PLIN no pueden usarse para operaciones de efectivizacion bancaria.");
                    }

                    if (!company) {
                        throw new Error("No se encontró la empresa seleccionada.");
                    }

                    if (currentTab === "Pago Deuda") {
                        const saved = await pagoDeudaService.patchEmpresa({
                            p_id_operacion: id,
                            p_id_empresa_salida: company.id_empresa,
                            p_id_empresa_cuenta_salida: company.id_empresa_cuenta_bancaria,
                            p_id_usuario_gestor: userId,
                            p_nombre_usuario_gestor: userName,
                            p_ruta_destino: ruta,
                        });
                        updatedRows.push(saved);
                    } else if (pendingAction === "Emp. Ingreso") {
                        const saved = await operacionesRpcService.patchOperacionBase(
                            buildOperacionEmpresaIngresoPayload(id, company, { userId, userName }),
                        );
                        updatedRows.push(saved);
                    } else {
                        const operation = operaciones.find((row) => row.id === id);

                        if (!operation) {
                            throw new Error("No se encontro la operacion seleccionada.");
                        }

                        const draft = {
                            ...operation,
                            id_empresa_salida: company.id_empresa,
                            nombre_empresa_salida: company.nombre_empresa,
                            id_empresa_cuenta_salida: company.id_empresa_cuenta_bancaria,
                            id_banco_empresa_cuenta_salida: company.id_banco,
                            nombre_banco_empresa_cuenta_salida: company.nombre_banco,
                            id_banco_cliente_transferencia: company.id_banco,
                            nombre_banco_cliente_transferencia: company.nombre_banco,
                        };

                        if (currentTab === "Derivados") {
                            const calc = await operacionesRpcService.calcularOperacion(getCalculationPayload(draft));

                            const saved = await operacionesRpcService.patchOperacionBase({
                                ...buildOperacionEmpresaSalidaPayload(id, company, { userId, userName }),
                                p_resultado_comision_banco_salida: calc.resultado_comision_banco_salida,
                            });
                            updatedRows.push(saved);
                        } else {
                            const calc = await operacionesRpcService.calcularOperacion(getCalculationPayload(draft));

                            const saved = await operacionesRpcService.patchOperacionBase({
                                ...buildOperacionEmpresaSalidaPayload(id, company, { userId, userName }),
                                p_resultado_comision_servicio: calc.resultado_comision_servicio,
                                p_monto_transferencia_cliente: calc.monto_transferencia_cliente,
                                p_resultado_comision_banco_ingreso: calc.resultado_comision_banco_ingreso,
                                p_resultado_comision_banco_salida: calc.resultado_comision_banco_salida,
                            });
                            updatedRows.push(saved);
                        }
                    }
                }

                if (pendingAction === "Transferencia") {
                    const company = actionCompanies.find((item) => String(item.id) === value);

                    if (isDigitalWalletBank(company)) {
                        throw new Error("YAPE y PLIN no pueden usarse para operaciones de Pago Deuda bancario.");
                    }

                    if (!company) {
                        throw new Error("No se encontró la empresa seleccionada.");
                    }

                    const saved = await operacionesRpcService.patchPagoDeudaSalida(
                        buildPagoDeudaSalidaPayload(id, company, ruta, { userId, userName }),
                    );
                    updatedRows.push(saved);
                }

                if (pendingAction === "Match") {
                    const saved = await pagoDeudaService.patchMatch({
                        p_id_pago_deuda: id,
                        p_id_operacion_efectivizacion: Number(value),
                        p_id_usuario_gestor: userId,
                        p_nombre_usuario_gestor: userName,
                    });
                    updatedRows.push(saved);
                }
            }

            setPendingAction(null);
            setSelectedIds([]);
            setIndividualActionIds([]);
            applyUpdatedRows(updatedRows);
            addToast("success", `Operaciones actualizadas: ${eligibleIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al actualizar operaciones.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    return (
        <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={embedded ? "overflow-hidden bg-primary" : "overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs"}
        >
            <div className="flex flex-col gap-3 p-4">
                {(showCompanyTabs || selectedTransferSummary) && (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {showCompanyTabs ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <EmpresaTabs
                                    companies={companies}
                                    activeCompanyId={activeCompanyId}
                                    badges={empresaBadges}
                                    onChange={onCompanyChange}
                                />
                            </div>
                        ) : null}
                        {selectedTransferSummary ? (
                            <div className="flex h-11 items-center gap-2 rounded-lg border border-secondary bg-secondary px-3 text-sm font-semibold text-primary shadow-xs">
                                <span>Seleccionado</span>
                                <span className="-my-px size-max rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-primary ring-inset shadow-xs">
                                    {selectedTransferSummary.count}
                                </span>
                                <span>Transferir</span>
                                <span className="-my-px size-max rounded-md bg-concept-transferencia px-1.5 py-0.5 text-xs font-medium text-primary_on-brand ring-1 ring-concept-transferencia ring-inset shadow-xs tabular-nums">
                                    {formatMoney(selectedTransferSummary.amount)}
                                </span>
                            </div>
                        ) : null}
                    </div>
                )}
                {flowTabsAsButtons ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase text-tertiary">Bandeja</p>
                        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bandejas operativas">
                            {visibleTabs.map((tab) => (
                                <Button
                                    key={tab}
                                    size="sm"
                                    color={currentTab === tab ? "primary" : "secondary"}
                                    className="justify-center"
                                    role="tab"
                                    aria-selected={currentTab === tab}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    <span>{tab}</span>
                                    {tabBadges[tab] ? (
                                        <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-primary ring-inset">
                                            {tabBadges[tab]}
                                        </span>
                                    ) : null}
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <Tabs
                        className="w-fit max-w-full overflow-x-auto"
                        selectedKey={currentTab}
                        onSelectionChange={(key) => setActiveTab(key as BancariaTab)}
                    >
                        <Tabs.List type="button-border" size="sm" aria-label="Bandejas operativas">
                            {visibleTabs.map((tab) => (
                                <Tabs.Item
                                    id={tab}
                                    key={tab}
                                    badge={tabBadges[tab] || undefined}
                                    className={({ isSelected }) =>
                                        isSelected
                                            ? "bg-brand-solid text-primary_on-brand shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover hover:text-primary_on-brand"
                                            : ""
                                    }
                                >
                                    {tab}
                                </Tabs.Item>
                            ))}
                        </Tabs.List>
                    </Tabs>
                )}
            </div>

            <OperationToolbar
                activeFilter={activeFilter}
                actions={readOnly ? [] : contract.actions}
                code={currentTab === "Movimientos" ? undefined : code}
                dateFrom={dateFrom}
                dateTo={dateTo}
                dateRangeLabel={currentTab === "Retenidos" ? "Fecha Deposito" : undefined}
                dni={dni}
                filters={contract.filters}
                showDateRange={currentTab === "Retenidos"}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onCodeChange={currentTab === "Movimientos" ? undefined : setCode}
                onDniChange={setDni}
                onFilterChange={handleFilterChange}
                isActionDisabled={isActionDisabled}
                onAction={readOnly ? undefined : handleAction}
            />

            {(error || tabBadgesError || empresaBadgesError) && (
                <div className="border-t border-secondary px-4 py-3 text-sm text-error-primary">
                    {error || tabBadgesError || empresaBadgesError}
                </div>
            )}

            {currentTab === "Movimientos" ? (
                <OperationTable columns={currentMovementColumns} data={movimientos} emptyText={emptyText} isLoading={isLoading} />
            ) : currentTab === "Efectivizacion" || currentTab === "Derivados" || currentTab === "Eliminados" ? (
            <BancariaEfectivizacionTable
                    activeAccountId={activeAccountId}
                    activeCompanyId={activeCompanyId}
                    companies={companies}
                    data={operaciones}
                    emptyText={emptyText}
                    estadoPagado={estadoPagado}
                    estadoPendiente={estadoPendiente}
                    isLoading={isLoading}
                    mode={currentTab === "Derivados" ? "derivaciones" : currentTab === "Eliminados" ? "eliminados" : "efectivizacion"}
                    presentation={presentation}
                    readOnly={readOnly}
                    onMetricsChanged={refreshMetrics}
                    onRefresh={() => {
                        setActionRefreshKey((value) => value + 1);
                        onChanged?.();
                    }}
                    onRowUpdated={replaceOperacion}
                onDeleteOperation={setOperationToDelete}
                onDeriveRow={(row) => {
                    setIndividualActionIds([row.id]);
                    setPendingAction("Derivar");
                }}
                    onRestoreOperation={setOperationToRestore}
                    ruta={ruta}
                    selectedIds={selectedIds}
                    user={{ userId, userName }}
                    onToggleRow={canUseProcesoActions ? handleToggleRow : undefined}
                />
            ) : (
                <OperationTable
                    columns={currentOperationColumns}
                    data={operaciones}
                    emptyText={emptyText}
                    isLoading={isLoading}
                    selectedIds={selectedIds}
                    onToggleRow={canUseProcesoActions ? handleToggleRow : undefined}
                    renderActions={
                        !readOnly && (currentTab === "POS" || currentTab === "Pago Deuda")
                            ? (row) => {
                                  const canDerive = !isHistoryMode && (currentTab === "POS" ? isPosSolicitado(row) : isPagoDeudaDerivable(row));
                                  return (
                                      <Button
                                          aria-label="Derivar operacion"
                                          color="tertiary"
                                          iconLeading={Send01}
                                          isDisabled={!canDerive || isApplyingAction}
                                          size="xs"
                                          title="Derivar operacion"
                                          onClick={() => {
                                              setIndividualActionIds([row.id]);
                                              setPendingAction("Derivar");
                                          }}
                                      />
                                  );
                              }
                            : undefined
                    }
                />
            )}

            <BancariaExcelRollbackModal
                activeAccountId={activeAccountId}
                activeCompanyId={activeCompanyId}
                isOpen={isRollbackModalOpen}
                isProcessing={isRollbackProcessing}
                ruta={ruta}
                onClose={() => setIsRollbackModalOpen(false)}
                onProcess={handleRollbackExcel}
            />
            <OperacionConfirmModal
                confirmLabel="Eliminar"
                description="La operacion pasara a Eliminado. Se revertira su impacto abierto en caja y podra restaurarse posteriormente."
                intent="destructive"
                isLoading={isProcessingOperationDelete}
                isOpen={operationToDelete !== null}
                onClose={() => {
                    if (!isProcessingOperationDelete) setOperationToDelete(null);
                }}
                onConfirm={() => void handleDeleteOperation()}
                title="Eliminar operacion"
            />
            <OperacionConfirmModal
                confirmLabel="Restaurar"
                description="La operacion volvera a su estado anterior y se reconstruira su impacto contable abierto."
                isLoading={isProcessingOperationRestore}
                isOpen={operationToRestore !== null}
                onClose={() => {
                    if (!isProcessingOperationRestore) setOperationToRestore(null);
                }}
                onConfirm={() => void handleRestoreOperation()}
                title="Restaurar operacion"
            />
            <OperacionConfirmModal
                confirmLabel="Eliminar"
                description={
                    movementToDelete?.tipo_origen?.trim().toUpperCase().replace("_", " ") === "TRANSFERENCIA INTERNA"
                        ? "Se eliminara el movimiento de Mover Saldo y se revertiran la salida e ingreso de las cajas involucradas."
                        : "Se eliminara el movimiento y se revertira su impacto en la caja actual."
                }
                intent="destructive"
                isLoading={isDeletingMovement}
                isOpen={movementToDelete !== null}
                onClose={() => {
                    if (!isDeletingMovement) setMovementToDelete(null);
                }}
                onConfirm={() => void handleDeleteMovement()}
                title="Eliminar movimiento"
            />
            <OperacionConfirmModal
                confirmLabel="Retornar"
                description="La operacion volvera al tab Retenidos, se reetiquetara su movimiento como RETENIDO y se revertira el impacto del abono en la caja actual. Si su abono estimado ya vencio, podra liberarse nuevamente con el job o con Forzar Abono."
                isLoading={isReturningRetention}
                isOpen={movementToReturn !== null}
                onClose={() => {
                    if (!isReturningRetention) setMovementToReturn(null);
                }}
                onConfirm={() => void handleReturnRetencion()}
                title="Retornar retencion"
            />
            <BancariaActionModal
                action={pendingAction === "Match" ? null : pendingAction}
                bankDestinations={bankDestinations}
                companies={actionCompanies}
                currentRuta={ruta}
                deriveByBank={currentTab === "POS" || currentTab === "Pago Deuda"}
                isOpen={pendingAction !== null && pendingAction !== "Match"}
                isSaving={isApplyingAction}
                selectedCount={pendingActionEligibleCount}
                onClose={() => {
                    setPendingAction(null);
                    setIndividualActionIds([]);
                }}
                onSubmit={handleModalAction}
            />
            <PagoDeudaActionModal
                action={pendingAction === "Match" ? "Match" : null}
                isOpen={pendingAction === "Match"}
                isSaving={isApplyingAction}
                selectedCount={pendingActionEligibleCount}
                selectedId={selectedIds[0] ?? null}
                onClose={() => setPendingAction(null)}
                onSubmit={(value) => handleModalAction(value, "")}
            />
            <OperacionConfirmModal
                confirmLabel="Confirmar"
                description={`Se clasificaran ${selectedIds.length} operacion(es) como Directo. Esto las pasara a Pagado sin generar salida normal al cliente.`}
                isLoading={isApplyingAction}
                isOpen={confirmQuickAction === "Directo"}
                onClose={() => setConfirmQuickAction(null)}
                onConfirm={() => void handleConfirmQuickAction()}
                title="Confirmar Directo"
            />
            <ModalOverlay isOpen={dniEdit !== null} onOpenChange={(open) => !open && setDniEdit(null)}>
                <Modal className="max-w-sm">
                    <Dialog>
                        <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Editar DNI</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    {dniEdit ? `Operacion ${dniEdit.row.codigo_operacion_deposito_cliente ?? dniEdit.row.id}` : ""}
                                </p>
                            </div>
                            <div className="mt-5">
                                <Input
                                    size="sm"
                                    label="DNI"
                                    value={dniEdit?.value ?? ""}
                                    onChange={(value) => setDniEdit((current) => current ? { ...current, value } : current)}
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button color="secondary" onClick={() => setDniEdit(null)}>Cancelar</Button>
                                <Button isLoading={isSavingDni} onClick={() => dniEdit && handleDniEditSave(dniEdit.row, dniEdit.value.replace(/\D/g, "").slice(0, 8))}>Guardar</Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </motion.section>
    );
};
