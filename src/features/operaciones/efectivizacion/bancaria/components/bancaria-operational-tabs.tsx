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
import { Edit03, Trash01 } from "@untitledui/icons";
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
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { downloadCsv } from "@/features/operaciones/efectivizacion/shared/utils/csv";
import { isDigitalWalletBank } from "@/features/operaciones/efectivizacion/shared/utils/digital-wallet";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
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
import { BancariaActionModal } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-action-modal";
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

const tabs: BancariaTab[] = ["Efectivizacion", "Pago Deuda", "Derivados", "POS", "Movimientos", "Retenidos"];
const retentionRoutes = new Set<OperacionRutaBancaria>(["scotiabank", "banbif", "safetypay"]);

interface BancariaOperationalTabsProps {
    activeAccountId: number | null;
    activeCajaId: number | null;
    activeCompanyCaja: RutaOperacionCaja | null;
    activeCompanyId: number | null;
    companies: RutaOperacionCaja[];
    downloadKey?: number;
    historyDate?: string | null;
    onChanged?: () => void;
    onMetricsChanged?: () => void;
    onCompanyChange: (id: number) => void;
    refreshKey?: number;
    ruta: OperacionRutaBancaria;
}

const baseOperationColumns = [
    { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
    { key: "dni_cliente", label: "DNI" },
    { key: "nombre_cliente", label: "Cliente" },
    { key: "nombre_estado", label: "Estado" },
    { key: "monto_transferencia_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
    { key: "nombre_empresa_ingreso", label: "Empresa" },
    { key: "fecha_registro", label: "Fecha", render: (row: OperacionProceso) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
];

const getMovementColumns = (showModalidad: boolean, onDelete?: (row: MovimientoMerged) => void) => [
    { key: "tipo_origen", label: "Origen", render: (row: MovimientoMerged) => <CompactBadgeLine color="brand">{row.tipo_origen}</CompactBadgeLine> },
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
                        {mov}
                    </CompactBadgeLine>
                ))}
            </div>
        ),
    },
    { key: "dni_cliente", label: "DNI", render: (row: MovimientoMerged) => row.dni_cliente || "-" },
    { key: "codigo_operacion", label: "Codigo", render: (row: MovimientoMerged) => row.codigo_operacion || "-" },
    { key: "nombre_empresa", label: "Empresa", render: (row: MovimientoMerged) => row.nombre_empresa },
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
        key: "monto_gasto",
        label: "Gasto",
        render: (row: MovimientoMerged) => (
            <span className={row.monto_gasto ? "font-medium text-concept-gasto" : "text-concept-zero"}>
                {formatMoney(row.monto_gasto)}
            </span>
        ),
    },
    {
        key: "monto_ganancia",
        label: "Ganancia",
        render: (row: MovimientoMerged) => (
            <span className={row.monto_ganancia ? "font-medium text-concept-ganancia" : "text-concept-zero"}>
                {formatMoney(row.monto_ganancia)}
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
    { key: "fecha_registro", label: "Fecha", render: (row: MovimientoMerged) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
    ...(onDelete ? [{
        key: "acciones",
        label: "Acciones",
        render: (row: MovimientoMerged) => (
            <Button
                size="xs"
                color="tertiary"
                iconLeading={Trash01}
                aria-label="Eliminar movimiento"
                title="Eliminar movimiento"
                onClick={() => onDelete(row)}
            />
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
    const codes = (row.pd_retorno_codigos_operacion || row.codigo_operacion_deposito_cliente || "")
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

const PagoDeudaRetornoEmpresaCuentaBadges = ({ row }: { row: OperacionProceso }) => {
    const retornos = row.pd_retorno_empresas_cuentas?.filter((item) => item.empresa || item.cuenta) ?? [];

    if (!retornos.length) {
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
                <EmpresaCuentaBadges
                    key={`${item.codigo ?? index}-${item.empresa ?? ""}-${item.cuenta ?? ""}`}
                    empresa={item.empresa}
                    cuenta={item.cuenta}
                    monto={item.monto}
                />
            ))}
        </div>
    );
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
    historyDate = null,
    onChanged,
    onMetricsChanged,
    onCompanyChange,
    refreshKey = 0,
    ruta,
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
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [dniEdit, setDniEdit] = useState<{ row: OperacionProceso; value: string } | null>(null);
    const [isSavingDni, setIsSavingDni] = useState(false);
    const [savingPagoDeudaEstadoIds, setSavingPagoDeudaEstadoIds] = useState<number[]>([]);
    const [savingPosEstadoIds, setSavingPosEstadoIds] = useState<number[]>([]);
    const [confirmQuickAction, setConfirmQuickAction] = useState<"Directo" | null>(null);
    const [isRollbackModalOpen, setIsRollbackModalOpen] = useState(false);
    const [isRollbackProcessing, setIsRollbackProcessing] = useState(false);
    const [movementToDelete, setMovementToDelete] = useState<MovimientoMerged | null>(null);
    const [isDeletingMovement, setIsDeletingMovement] = useState(false);
    const handledDownloadKeyRef = useRef(0);
    const isActiveDigitalWallet = isDigitalWalletBank(activeCompanyCaja);
    const visibleTabs = useMemo(
        () => {
            if (isActiveDigitalWallet) return [] as BancariaTab[];
            if (ruta === "safetypay") return ["Efectivizacion", "POS", "Movimientos", "Retenidos"] as BancariaTab[];
            const hasRetencion = retentionRoutes.has(ruta) ||
                companies.some((c) => c.flag_retencion_parcial_cuenta);
            return hasRetencion ? tabs : tabs.filter((tab) => tab !== "Retenidos");
        },
        [isActiveDigitalWallet, ruta, companies],
    );

    useEffect(() => {
        setActiveFilter("Todos");
        setCode("");
        setDateFrom("");
        setDateTo("");
        setSelectedIds([]);
    }, [activeTab]);

    useEffect(() => {
        setSelectedIds([]);
        setPendingAction(null);
        setConfirmQuickAction(null);
    }, [activeAccountId, activeFilter, activeCompanyId, code, dateFrom, dateTo, dni, historyDate, refreshKey]);

    useEffect(() => {
        if (isActiveDigitalWallet) {
            setActiveTab("Movimientos");
            setActiveFilter("Todos");
            setCode("");
            setDateFrom("");
            setDateTo("");
            setSelectedIds([]);
            setPendingAction(null);
            setConfirmQuickAction(null);
        }
    }, [isActiveDigitalWallet]);

    useEffect(() => {
        if (!visibleTabs.includes(activeTab)) {
            setActiveTab(visibleTabs[0] ?? "Efectivizacion");
        }
    }, [activeTab, visibleTabs]);

    const currentTab = activeTab;

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

        if (ruta === "safetypay" && currentTab === "Efectivizacion") {
            return {
                ...base,
                actions: ["Eliminar", "Emp. Salida", "Pagar", "Derivar", "Directo", "Reiniciar"],
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
        refreshKey: refreshKey + actionRefreshKey,
        ruta,
        tab: currentTab,
    });
    const { data: tabBadges, error: tabBadgesError } = useBancariaTabBadges(
        ruta,
        null,
        activeAccountId,
        historyDate,
        refreshKey + actionRefreshKey + metricsRefreshKey,
    );
    const { data: empresaBadges, error: empresaBadgesError } = useBancariaEmpresaBadges(
        ruta,
        currentTab,
        null,
        historyDate,
        refreshKey + actionRefreshKey + metricsRefreshKey,
    );
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const isHistoryMode = Boolean(historyDate);
    const canUseProcesoActions = procesoActionTabs.includes(currentTab) && !isHistoryMode;
    const hasSelection = selectedIds.length > 0;
    const commercialCompanies = useMemo(() => companies.filter((company) => !isDigitalWalletBank(company)), [companies]);
    const actionCompanies = useMemo(
        () => commercialCompanies.filter((company) => !activeCompanyId || company.id_empresa !== activeCompanyId),
        [activeCompanyId, commercialCompanies],
    );
    const handlePagoDeudaTransferenciaRow = useCallback(async (row: OperacionProceso) => {
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

    const operationColumnsByTab = useMemo(() => ({
        Efectivizacion: baseOperationColumns,
        "Pago Deuda": [
            { key: "pasos", label: "Pasos", render: (row: OperacionProceso) => <PagoDeudaSteps row={row} /> },
            { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => (
                <div className="flex items-center gap-1">
                    <span className="font-medium text-primary">{row.dni_cliente || "-"}</span>
                    <Button size="xs" color="tertiary" iconLeading={Edit03} aria-label="Editar DNI" isDisabled={hasDevolucionConfirmada(row)} onClick={() => setDniEdit({ row, value: row.dni_cliente ?? "" })} />
                </div>
            ) },
            {
                key: "empresa_cuenta_salida",
                label: "Empresa Cuenta",
                render: (row: OperacionProceso) => (
                    <EmpresaCuentaBadges empresa={row.nombre_empresa_salida} cuenta={row.nombre_banco_empresa_cuenta_salida} />
                ),
            },
            { key: "monto_transferencia_cliente", label: "Monto Transferencia", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "codigo_operacion_deposito_cliente", label: "Cod. Op.", render: (row: OperacionProceso) => <PagoDeudaCodigosRetorno row={row} /> },
            {
                key: "empresa_cuenta_ingreso",
                label: "Empresa Cuenta",
                render: (row: OperacionProceso) => <PagoDeudaRetornoEmpresaCuentaBadges row={row} />,
                headerClassName: "min-w-72",
                cellClassName: "min-w-72 max-w-none whitespace-normal",
            },
            { key: "monto_devuelto", label: "Monto Devolución", render: (row: OperacionProceso) => formatMoney(row.pd_retorno_monto_devolucion ?? row.monto_devuelto ?? 0) },
            { key: "estado_visual", label: "Estado", render: (row: OperacionProceso) => (
                <PagoDeudaEstadoButton
                    row={row}
                    isLoading={savingPagoDeudaEstadoIds.includes(row.id)}
                    onTransferencia={isHistoryMode ? undefined : handlePagoDeudaTransferenciaRow}
                />
            ) },
            { key: "fecha_registro", label: "Fecha", render: (row: OperacionProceso) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
        ],
        Derivados: [
            { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
            { key: "dni_cliente", label: "DNI" },
            { key: "nombre_estado", label: "Estado" },
            { key: "ruta_origen", label: "Origen", render: (row: OperacionProceso) => row.ruta_origen ? getRutaLabel(row.ruta_origen as OperacionRuta) : "" },
            { key: "ruta_destino", label: "Destino", render: (row: OperacionProceso) => row.ruta_destino ? getRutaLabel(row.ruta_destino as OperacionRuta) : "" },
            { key: "nombre_usuario_deriva", label: "Deriva" },
            { key: "monto_transferencia_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "fecha_derivacion", label: "Derivacion", render: (row: OperacionProceso) => row.fecha_derivacion ? new Date(row.fecha_derivacion).toLocaleDateString("es-PE") : "" },
        ],
        POS: [
            { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
            { key: "dni_cliente", label: "DNI" },
            { key: "nombre_cliente", label: "Cliente" },
            {
                key: "empresa_cuenta_salida",
                label: "Empresa Cuenta",
                render: (row: OperacionProceso) => (
                    <EmpresaCuentaBadges empresa={row.nombre_empresa_salida} cuenta={row.nombre_banco_empresa_cuenta_salida} />
                ),
            },
            { key: "monto_transferencia", label: "Monto Transferencia", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
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
            { key: "dni_cliente", label: "DNI" },
            { key: "nombre_cliente", label: "Cliente" },
            { key: "nombre_estado", label: "Estado" },
            { key: "monto_transferencia_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "nombre_usuario_retiene", label: "Retiene" },
            { key: "motivo_retencion", label: "Motivo" },
            { key: "fecha_corte_recaudacion", label: "Corte", render: (row: OperacionProceso) => row.fecha_corte_recaudacion ? new Date(row.fecha_corte_recaudacion).toLocaleString("es-PE") : "-" },
            { key: "fecha_liberacion_abono", label: "Abono Estimado", render: (row: OperacionProceso) => row.fecha_liberacion_abono ? new Date(row.fecha_liberacion_abono).toLocaleString("es-PE") : "-" },
            {
                key: "flag_liberable_abono",
                label: "Liberable",
                render: (row: OperacionProceso) => (
                    <CompactBadgeLine color={row.flag_liberable_abono ? "success" : "gray"}>
                        {row.flag_liberable_abono ? "Si" : "No"}
                    </CompactBadgeLine>
                ),
            },
            { key: "fecha_deposito_cliente", label: "Deposito", render: (row: OperacionProceso) => row.fecha_deposito_cliente ? new Date(row.fecha_deposito_cliente).toLocaleDateString("es-PE") : "" },
        ],
    } as Record<string, { key: string; label: string; render?: (row: OperacionProceso) => React.ReactNode }[]>), [handlePagoDeudaTransferenciaRow, handlePosEstadoRow, isHistoryMode, savingPagoDeudaEstadoIds, savingPosEstadoIds]);
    const currentOperationColumns = currentTab === "Movimientos" ? baseOperationColumns : operationColumnsByTab[currentTab];
    const currentMovementColumns = useMemo(
        () => getMovementColumns(ruta === "safetypay", isHistoryMode ? undefined : setMovementToDelete),
        [isHistoryMode, ruta],
    );
    const selectedOperations = operaciones.filter((row) => selectedIds.includes(row.id));
    const selectedTransferSummary = useMemo(() => {
        if (!["Efectivizacion", "Pago Deuda", "Derivados", "POS"].includes(currentTab)) return null;

        const transferRows = selectedOperations.filter((row) => {
            if (currentTab === "Pago Deuda") {
                return getPagoDeudaEstadoVisual(row).action === "transferencia";
            }

            return !isPaidOperation(row);
        });

        if (!transferRows.length) return null;

        return {
            count: transferRows.length,
            amount: transferRows.reduce(
                (sum, row) => sum + toNumber(row.monto_transferencia_cliente ?? row.monto_deposito_cliente),
                0,
            ),
        };
    }, [currentTab, selectedOperations]);

    const getEligibleIdsForAction = (action: string) => {
        if (currentTab === "Pago Deuda") {
            if (action === "Transferencia") return selectedOperations.filter(isPendingOperation).map((row) => row.id);
            if (action === "Emp. Salida") return selectedOperations.filter(isPendingOperation).map((row) => row.id);
            if (action === "Reiniciar") return selectedOperations.filter(isPagoDeudaTransferido).map((row) => row.id);
            if (action === "Match" || action === "Pagar") return selectedOperations.filter(isProcessedOperation).map((row) => row.id);
            return selectedIds;
        }

        if (currentTab === "POS") {
            if (action === "Pagar") return selectedOperations.filter(isPosSolicitado).map((row) => row.id);
            if (action === "Reiniciar") return selectedOperations.filter(isPaidOperation).map((row) => row.id);
            return selectedIds;
        }

        if (!quickActionRuleTabs.includes(currentTab)) return selectedIds;

        if (["Pagar", "Directo", "Derivar", "Reasignar", "Emp. Ingreso", "Emp. Salida", "Modalidad"].includes(action)) {
            return selectedOperations.filter(isPendingOperation).map((row) => row.id);
        }

        if (action === "Reiniciar") {
            return selectedOperations.filter(isPaidOperation).map((row) => row.id);
        }

        return selectedIds;
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
    const pendingActionEligibleCount = pendingAction ? getEligibleIdsForAction(pendingAction).length : selectedIds.length;

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
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
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
        if (action === "Eliminar") {
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
            if (!selectedIds.length) {
                addToast("error", "Selecciona al menos una operación.");
                return;
            }
            if (!getEligibleIdsOrNotify(action).length) return;
            if (action === "Match" && selectedIds.length !== 1) {
                addToast("error", "Selecciona una sola operacion para hacer match.");
                return;
            }
            setPendingAction(action);
            return;
        }

        if (action === "Procesar Abonos Vencidos") {
            if (!activeAccountId) {
                addToast("error", "Selecciona una cuenta antes de procesar abonos.");
                return;
            }

            setIsApplyingAction(true);

            try {
                const result = await operacionesRpcService.runLiberarRetenciones({
                    p_ruta: ruta,
                    p_id_usuario: userId,
                    p_id_empresa_cuenta_bancaria: activeAccountId,
                });
                const liberadas = Number(result.operaciones_liberadas ?? 0);
                const errores = Number(result.operaciones_error ?? 0);

                setSelectedIds([]);
                refreshBandeja();
                refreshMetrics();
                addToast(
                    errores > 0 ? "error" : "success",
                    errores > 0
                        ? `Abonos procesados con errores. Liberadas: ${liberadas}. Errores: ${errores}.`
                        : `Abonos vencidos liberados: ${liberadas}.`,
                );
            } catch (err) {
                addToast("error", err instanceof Error ? err.message : "Error al procesar abonos vencidos.");
            } finally {
                setIsApplyingAction(false);
            }
            return;
        }

        if (action === "Confirmar") {
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
                addToast("success", `Retenciones confirmadas: ${selectedIds.length}`);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error al confirmar retenciones.";
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
                    const saved = await operacionesRpcService.patchOperacionDerivacion(
                        buildOperacionDerivacionPayload(id, ruta, value, { userId, userName }),
                    );
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
            className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs"
        >
            <div className="flex flex-col gap-3 p-4">
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
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <EmpresaTabs
                            companies={companies}
                            activeCompanyId={activeCompanyId}
                            badges={empresaBadges}
                            onChange={onCompanyChange}
                        />
                    </div>
                    {selectedTransferSummary ? (
                        <div className="flex h-11 items-center gap-2 rounded-lg border border-secondary bg-secondary px-3 text-sm font-semibold text-primary shadow-xs">
                            <span>Seleccionado</span>
                            <span className="-my-px size-max rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-primary ring-inset shadow-xs">
                                {selectedTransferSummary.count}
                            </span>
                            <span>Transferir</span>
                            <span className="-my-px size-max rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-brand-secondary ring-1 ring-primary ring-inset shadow-xs tabular-nums">
                                {formatMoney(selectedTransferSummary.amount)}
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>

            <OperationToolbar
                activeFilter={activeFilter}
                actions={contract.actions}
                code={currentTab === "Efectivizacion" ? code : undefined}
                dateFrom={dateFrom}
                dateTo={dateTo}
                dni={dni}
                filters={contract.filters}
                showDateRange={currentTab === "Retenidos"}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onCodeChange={currentTab === "Efectivizacion" ? setCode : undefined}
                onDniChange={setDni}
                onFilterChange={setActiveFilter}
                isActionDisabled={isActionDisabled}
                onAction={handleAction}
            />

            {(error || tabBadgesError || empresaBadgesError) && (
                <div className="border-t border-secondary px-4 py-3 text-sm text-error-primary">
                    {error || tabBadgesError || empresaBadgesError}
                </div>
            )}

            {currentTab === "Movimientos" ? (
                <OperationTable columns={currentMovementColumns} data={movimientos} emptyText="Sin movimientos para esta bandeja." isLoading={isLoading} />
            ) : currentTab === "Efectivizacion" || currentTab === "Derivados" ? (
                <BancariaEfectivizacionTable
                    activeAccountId={activeAccountId}
                    activeCompanyId={activeCompanyId}
                    companies={companies}
                    data={operaciones}
                    emptyText="Sin operaciones para esta bandeja."
                    estadoPagado={estadoPagado}
                    estadoPendiente={estadoPendiente}
                    isLoading={isLoading}
                    mode={currentTab === "Derivados" ? "derivaciones" : "efectivizacion"}
                    onMetricsChanged={refreshMetrics}
                    onRefresh={() => {
                        setActionRefreshKey((value) => value + 1);
                        onChanged?.();
                    }}
                    onRowUpdated={replaceOperacion}
                    ruta={ruta}
                    selectedIds={selectedIds}
                    user={{ userId, userName }}
                    onToggleRow={canUseProcesoActions ? handleToggleRow : undefined}
                />
            ) : (
                <OperationTable
                    columns={currentOperationColumns}
                    data={operaciones}
                    emptyText="Sin operaciones para esta bandeja."
                    isLoading={isLoading}
                    selectedIds={selectedIds}
                    onToggleRow={canUseProcesoActions ? handleToggleRow : undefined}
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
            <BancariaActionModal
                action={pendingAction === "Match" ? null : pendingAction}
                companies={actionCompanies}
                currentRuta={ruta}
                isOpen={pendingAction !== null && pendingAction !== "Match"}
                isSaving={isApplyingAction}
                selectedCount={pendingActionEligibleCount}
                onClose={() => setPendingAction(null)}
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
