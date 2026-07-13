import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Tabs } from "@/components/application/tabs/tabs";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";
import { EmpresaTabs } from "@/features/operaciones/efectivizacion/shared/components/empresa-tabs";
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
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { downloadCsv } from "@/features/operaciones/efectivizacion/shared/utils/csv";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { isBancariaActionDisabled, procesoActionTabs } from "@/features/operaciones/efectivizacion/shared/utils/action-rules";
import {
    buildOperacionDerivacionPayload,
    buildOperacionEmpresaPayload,
    buildOperacionPagadoPayload,
    buildOperacionReanudarPayload,
    buildOperacionRetencionConfirmPayload,
    buildOperacionUsuarioPayload,
    buildPagoDeudaSalidaPayload,
} from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { BancariaActionModal } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-action-modal";
import { BancariaEfectivizacionTable } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-efectivizacion-table";
import { type BancariaTab, tabContracts, useBancariaBandeja } from "@/features/operaciones/efectivizacion/bancaria/hooks/use-bancaria-bandeja";

const tabs: BancariaTab[] = ["Efectivizacion", "Pago Deuda", "Derivados", "POS", "Movimientos", "Retenidos"];

interface BancariaOperationalTabsProps {
    activeCompanyId: number | null;
    companies: RutaOperacionCaja[];
    downloadKey?: number;
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

const operationColumnsByTab: Record<Exclude<BancariaTab, "Movimientos">, typeof baseOperationColumns> = {
    Efectivizacion: baseOperationColumns,
    "Pago Deuda": [
        { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
        { key: "dni_cliente", label: "DNI" },
        { key: "nombre_cliente", label: "Cliente" },
        { key: "nombre_estado", label: "Estado" },
        { key: "monto_deposito_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente) },
        { key: "nombre_empresa_salida", label: "Empresa Salida" },
        { key: "nombre_usuario_solicitud", label: "Solicita" },
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
        { key: "fecha_retencion", label: "Retencion", render: (row: OperacionProceso) => row.fecha_retencion ? new Date(row.fecha_retencion).toLocaleDateString("es-PE") : "" },
    ],
};

const movementColumns = [
    { key: "tipo_origen", label: "Origen" },
    { key: "tipo_movimiento", label: "Movimiento" },
    { key: "dni_cliente", label: "DNI" },
    { key: "codigo_operacion", label: "Codigo" },
    { key: "nombre_empresa", label: "Empresa" },
    {
        key: "monto_ingreso",
        label: "Ingreso",
        render: (row: OperacionCajaMovimiento) => (
            <span className={row.monto_ingreso ? "font-medium text-concept-ingreso" : "text-concept-zero"}>
                {formatMoney(row.monto_ingreso)}
            </span>
        ),
    },
    {
        key: "monto_salida",
        label: "Salida",
        render: (row: OperacionCajaMovimiento) => (
            <span className={row.monto_salida ? "font-medium text-concept-salida" : "text-concept-zero"}>
                {formatMoney(row.monto_salida)}
            </span>
        ),
    },
    { key: "fecha_registro", label: "Fecha", render: (row: OperacionCajaMovimiento) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
];

const getExportValue = <T extends { id: number }>(
    row: T,
    column: { key: keyof T | string; render?: (row: T) => unknown },
) => {
    const rendered = column.render?.(row);
    if (typeof rendered === "string" || typeof rendered === "number") return rendered;

    const raw = row[column.key as keyof T];
    return raw ?? "";
};

export const BancariaOperationalTabs = ({ activeCompanyId, companies, downloadKey = 0, onCompanyChange, refreshKey = 0, ruta }: BancariaOperationalTabsProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState<BancariaTab>("Efectivizacion");
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [actionRefreshKey, setActionRefreshKey] = useState(0);
    const [code, setCode] = useState("");
    const [dni, setDni] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [pendingAction, setPendingAction] = useState<"Derivar" | "Empresa" | "Reasignar" | "Transferencia" | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [isApplyingAction, setIsApplyingAction] = useState(false);

    useEffect(() => {
        setActiveFilter("Todos");
        setCode("");
        setDateFrom("");
        setDateTo("");
        setSelectedIds([]);
    }, [activeTab]);

    useEffect(() => {
        setSelectedIds([]);
    }, [activeFilter, activeCompanyId, code, dateFrom, dateTo, dni, refreshKey]);

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
    const { error, isLoading, movimientos, operaciones } = useBancariaBandeja({
        activeCompanyId,
        activeFilter,
        code,
        dateFrom,
        dateTo,
        dni,
        refreshKey: refreshKey + actionRefreshKey,
        ruta,
        tab: activeTab,
    });
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const canUseProcesoActions = procesoActionTabs.includes(activeTab);
    const hasSelection = selectedIds.length > 0;
    const currentOperationColumns = activeTab === "Movimientos" ? baseOperationColumns : operationColumnsByTab[activeTab];

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
            hasSelection,
            isApplyingAction,
        });
    };

    const handleAction = async (action: string) => {
        if (action === "Derivar" || action === "Empresa" || action === "Reasignar" || action === "Transferencia") {
            if (!selectedIds.length) {
                addToast("error", "Selecciona al menos una operación.");
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
                for (const id of selectedIds) {
                    await operacionesRpcService.patchOperacionRetencion(buildOperacionRetencionConfirmPayload(id, estadoPendiente));
                }

                setSelectedIds([]);
                setActionRefreshKey((value) => value + 1);
                addToast("success", `Retenciones confirmadas: ${selectedIds.length}`);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Error al confirmar retenciones.";
                addToast("error", message);
            } finally {
                setIsApplyingAction(false);
            }
            return;
        }

        if (!["Pagar", "Reiniciar"].includes(action)) return;

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

        setIsApplyingAction(true);

        try {
            for (const id of selectedIds) {
                if (action === "Pagar" && estadoPagado) {
                    await operacionesRpcService.patchOperacionPagado(
                        buildOperacionPagadoPayload(id, estadoPagado, { userId, userName }),
                    );
                }

                if (action === "Reiniciar" && estadoPendiente) {
                    await operacionesRpcService.patchOperacionReanudar(
                        buildOperacionReanudarPayload(id, estadoPendiente, { userId, userName }),
                    );
                }
            }

            setSelectedIds([]);
            setActionRefreshKey((value) => value + 1);
            addToast("success", `Operaciones actualizadas: ${selectedIds.length}`);
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
            for (const id of selectedIds) {
                if (pendingAction === "Derivar") {
                    await operacionesRpcService.patchOperacionDerivacion(
                        buildOperacionDerivacionPayload(id, ruta, value, { userId, userName }),
                    );
                }

                if (pendingAction === "Reasignar") {
                    await operacionesRpcService.patchOperacionUsuario(buildOperacionUsuarioPayload(id, Number(value), label));
                }

                if (pendingAction === "Empresa") {
                    const company = companies.find((item) => String(item.id) === value);

                    if (!company) {
                        throw new Error("No se encontró la empresa seleccionada.");
                    }

                    await operacionesRpcService.patchOperacionEmpresa(
                        buildOperacionEmpresaPayload(id, company, { userId, userName }),
                    );
                }

                if (pendingAction === "Transferencia") {
                    const company = companies.find((item) => String(item.id) === value);

                    if (!company) {
                        throw new Error("No se encontró la empresa seleccionada.");
                    }

                    await operacionesRpcService.patchPagoDeudaSalida(
                        buildPagoDeudaSalidaPayload(id, company, ruta, { userId, userName }),
                    );
                }
            }

            setPendingAction(null);
            setSelectedIds([]);
            setActionRefreshKey((current) => current + 1);
            addToast("success", `Operaciones actualizadas: ${selectedIds.length}`);
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
                        {tabs.map((tab) => (
                            <Tabs.Item id={tab} key={tab}>
                                {tab}
                            </Tabs.Item>
                        ))}
                    </Tabs.List>
                </Tabs>
                <EmpresaTabs companies={companies} activeCompanyId={activeCompanyId} onChange={onCompanyChange} />
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

            {error && <div className="border-t border-secondary px-4 py-3 text-sm text-error-primary">{error}</div>}

            {activeTab === "Movimientos" ? (
                <OperationTable columns={movementColumns} data={movimientos} emptyText="Sin movimientos para esta bandeja." isLoading={isLoading} />
            ) : activeTab === "Efectivizacion" ? (
                <BancariaEfectivizacionTable
                    activeCompanyId={activeCompanyId}
                    companies={companies}
                    data={operaciones}
                    emptyText="Sin operaciones para esta bandeja."
                    estadoPagado={estadoPagado}
                    estadoPendiente={estadoPendiente}
                    isLoading={isLoading}
                    onRefresh={() => setActionRefreshKey((value) => value + 1)}
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
                action={pendingAction}
                companies={companies}
                currentRuta={ruta}
                isOpen={pendingAction !== null}
                isSaving={isApplyingAction}
                selectedCount={selectedIds.length}
                onClose={() => setPendingAction(null)}
                onSubmit={handleModalAction}
            />
        </motion.section>
    );
};
