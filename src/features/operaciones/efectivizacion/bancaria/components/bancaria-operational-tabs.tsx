import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Tabs } from "@/components/application/tabs/tabs";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";
import { clienteService } from "@/services/cliente.service";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Edit03 } from "@untitledui/icons";
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
import { type BancariaTab, type MovimientoMerged, tabContracts, useBancariaBandeja } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja";
import {
    useBancariaEmpresaBadges,
    useBancariaTabBadges,
} from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-tab-badges";
import { PagoDeudaActionModal } from "@/features/operaciones/pago-deuda/components/pago-deuda-action-modal";
import {
    hasDevolucionConfirmada,
    PagoDeudaEstadoButton,
    PagoDeudaSteps,
} from "@/features/operaciones/pago-deuda/components/pago-deuda-board";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";

const tabs: BancariaTab[] = ["Efectivizacion", "Pago Deuda", "Derivados", "POS", "Movimientos", "Retenidos"];
const retentionRoutes = new Set<OperacionRutaBancaria>(["scotiabank", "banbif"]);

interface BancariaOperationalTabsProps {
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

const movementColumns = [
    { key: "tipo_origen", label: "Origen", render: (row: MovimientoMerged) => <CompactBadgeLine color="brand">{row.tipo_origen}</CompactBadgeLine> },
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
];

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
    const [pendingAction, setPendingAction] = useState<"Derivar" | "Emp. Ingreso" | "Emp. Salida" | "Reasignar" | "Transferencia" | "Match" | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [dniEdit, setDniEdit] = useState<{ row: OperacionProceso; value: string } | null>(null);
    const [isSavingDni, setIsSavingDni] = useState(false);
    const [savingPagoDeudaEstadoIds, setSavingPagoDeudaEstadoIds] = useState<number[]>([]);
    const [confirmQuickAction, setConfirmQuickAction] = useState<"Directo" | null>(null);
    const visibleTabs = useMemo(
        () => {
            const hasRetencion = retentionRoutes.has(ruta) ||
                companies.some((c) => c.flag_retencion_parcial_cuenta);
            return hasRetencion ? tabs : tabs.filter((tab) => tab !== "Retenidos");
        },
        [ruta, companies],
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
    }, [activeFilter, activeCompanyId, code, dateFrom, dateTo, dni, historyDate, refreshKey]);

    useEffect(() => {
        if (!visibleTabs.includes(activeTab)) {
            setActiveTab("Efectivizacion");
        }
    }, [activeTab, visibleTabs]);

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

    const contract = tabContracts[activeTab];
    const {
        error,
        isLoading,
        movimientos,
        operaciones,
        refreshBandeja,
        replaceOperacion,
        replaceOperaciones,
    } = useBancariaBandeja({
        activeCompanyId,
        activeFilter,
        code,
        dateFrom,
        dateTo,
        dni,
        historyDate,
        refreshKey: refreshKey + actionRefreshKey,
        ruta,
        tab: activeTab,
    });
    const { data: tabBadges, error: tabBadgesError } = useBancariaTabBadges(
        ruta,
        null,
        historyDate,
        refreshKey + actionRefreshKey + metricsRefreshKey,
    );
    const { data: empresaBadges, error: empresaBadgesError } = useBancariaEmpresaBadges(
        ruta,
        activeTab,
        historyDate,
        refreshKey + actionRefreshKey + metricsRefreshKey,
    );
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const isHistoryMode = Boolean(historyDate);
    const canUseProcesoActions = procesoActionTabs.includes(activeTab) && !isHistoryMode;
    const hasSelection = selectedIds.length > 0;
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

    const operationColumnsByTab = useMemo(() => ({
        Efectivizacion: baseOperationColumns,
        "Pago Deuda": [
            { key: "pasos", label: "Pasos", render: (row: OperacionProceso) => <PagoDeudaSteps row={row} /> },
            { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
            { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => (
                <div className="flex items-center gap-1">
                    <span className="font-medium text-primary">{row.dni_cliente || "-"}</span>
                    <Button size="xs" color="tertiary" iconLeading={Edit03} aria-label="Editar DNI" isDisabled={hasDevolucionConfirmada(row)} onClick={() => setDniEdit({ row, value: row.dni_cliente ?? "" })} />
                </div>
            ) },
            { key: "nombre_cliente", label: "Cliente", render: (row: OperacionProceso) => row.nombre_cliente || "-" },
            { key: "nombre_empresa_salida", label: "Empresa Salida", render: (row: OperacionProceso) => row.nombre_empresa_salida || "-" },
            { key: "nombre_banco_empresa_cuenta_salida", label: "Cuenta", render: (row: OperacionProceso) => row.nombre_banco_empresa_cuenta_salida || "-" },
            { key: "monto_transferencia_cliente", label: "Monto Transferencia", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
            { key: "nombre_empresa_ingreso", label: "Empresa Ingreso", render: (row: OperacionProceso) => row.nombre_empresa_ingreso || "-" },
            { key: "nombre_banco_empresa_cuenta_ingreso", label: "Cuenta Ingreso", render: (row: OperacionProceso) => row.nombre_banco_empresa_cuenta_ingreso || "-" },
            { key: "monto_devuelto", label: "Monto Devolución", render: (row: OperacionProceso) => formatMoney(row.monto_devuelto ?? 0) },
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
            { key: "nombre_estado", label: "Estado" },
            { key: "monto_deposito_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente) },
            { key: "nombre_usuario_solicitud", label: "Solicita" },
            { key: "nombre_usuario_gestor", label: "Gestor" },
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
            { key: "fecha_deposito_cliente", label: "Deposito", render: (row: OperacionProceso) => row.fecha_deposito_cliente ? new Date(row.fecha_deposito_cliente).toLocaleDateString("es-PE") : "" },
        ],
    } as Record<string, { key: string; label: string; render?: (row: OperacionProceso) => React.ReactNode }[]>), [handlePagoDeudaTransferenciaRow, isHistoryMode, savingPagoDeudaEstadoIds]);
    const currentOperationColumns = activeTab === "Movimientos" ? baseOperationColumns : operationColumnsByTab[activeTab];
    const selectedOperations = operaciones.filter((row) => selectedIds.includes(row.id));

    const getEligibleIdsForAction = (action: string) => {
        if (activeTab === "Pago Deuda") {
            if (action === "Transferencia") return selectedOperations.filter(isPendingOperation).map((row) => row.id);
            if (action === "Emp. Salida") return selectedOperations.filter(isPendingOperation).map((row) => row.id);
            if (action === "Reiniciar") return selectedOperations.filter(isProcessedOperation).map((row) => row.id);
            if (action === "Match" || action === "Pagar") return selectedOperations.filter(isProcessedOperation).map((row) => row.id);
            return selectedIds;
        }

        if (!quickActionRuleTabs.includes(activeTab)) return selectedIds;

        if (["Pagar", "Directo", "Derivar", "Reasignar", "Emp. Ingreso", "Emp. Salida"].includes(action)) {
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
                activeTab === "Pago Deuda" && (action === "Match" || action === "Pagar")
                    ? "Procesado"
                    : activeTab === "Pago Deuda" && action === "Reiniciar"
                      ? "Procesado"
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

        if (activeTab === "Movimientos") {
            downloadCsv(
                `${ruta}-${activeTab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
                movementColumns.map((column) => column.label),
                movimientos.map((row) => movementColumns.map((column) => getExportValue(row, column))),
            );
            addToast("success", "Bandeja descargada correctamente.");
            return;
        }

        downloadCsv(
            `${ruta}-${activeTab.toLowerCase().replaceAll(" ", "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
            currentOperationColumns.map((column) => column.label),
            operaciones.map((row) => currentOperationColumns.map((column) => getExportValue(row, column))),
        );
        addToast("success", "Bandeja descargada correctamente.");
    }, [activeTab, addToast, currentOperationColumns, downloadKey, movimientos, operaciones, ruta]);

    const handleToggleRow = (id: number) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    };

    const isActionDisabled = (action: string) => {
        return isBancariaActionDisabled({
            action,
            activeTab,
            companyCount: companies.length,
            hasSelection: hasSelection && getEligibleIdsForAction(action).length > 0,
            isApplyingAction: isApplyingAction || isHistoryMode,
        });
    };

    const handleAction = async (action: string) => {
        if (action === "Transferencia" && activeTab === "Pago Deuda") {
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

        if (action === "Derivar" || action === "Emp. Ingreso" || action === "Emp. Salida" || action === "Reasignar" || action === "Match") {
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
                    if (activeTab === "Pago Deuda") {
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
                    const saved = activeTab === "Pago Deuda"
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

                if (pendingAction === "Emp. Ingreso" || pendingAction === "Emp. Salida") {
                    const company = companies.find((item) => String(item.id) === value);

                    if (!company) {
                        throw new Error("No se encontró la empresa seleccionada.");
                    }

                    if (activeTab === "Pago Deuda") {
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

                        if (activeTab === "Derivados") {
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
                    const company = companies.find((item) => String(item.id) === value);

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
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as BancariaTab)}>
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
                <EmpresaTabs companies={companies} activeCompanyId={activeCompanyId} badges={empresaBadges} onChange={onCompanyChange} />
            </div>

            <OperationToolbar
                activeFilter={activeFilter}
                actions={contract.actions}
                code={activeTab === "Efectivizacion" ? code : undefined}
                dateFrom={dateFrom}
                dateTo={dateTo}
                dni={dni}
                filters={contract.filters}
                showDateRange={activeTab === "Retenidos"}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onCodeChange={activeTab === "Efectivizacion" ? setCode : undefined}
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

            {activeTab === "Movimientos" ? (
                <OperationTable columns={movementColumns} data={movimientos} emptyText="Sin movimientos para esta bandeja." isLoading={isLoading} />
            ) : activeTab === "Efectivizacion" || activeTab === "Derivados" ? (
                <BancariaEfectivizacionTable
                    activeCompanyId={activeCompanyId}
                    companies={companies}
                    data={operaciones}
                    emptyText="Sin operaciones para esta bandeja."
                    estadoPagado={estadoPagado}
                    estadoPendiente={estadoPendiente}
                    isLoading={isLoading}
                    mode={activeTab === "Derivados" ? "derivaciones" : "efectivizacion"}
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

            <BancariaActionModal
                action={pendingAction === "Match" ? null : pendingAction}
                companies={companies}
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
