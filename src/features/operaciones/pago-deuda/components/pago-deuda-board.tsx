import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { OperationTable } from "@/features/operaciones/efectivizacion/shared/components/operation-table";
import { OperationToolbar } from "@/features/operaciones/efectivizacion/shared/components/operation-toolbar";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { buildOperacionReanudarPayload } from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import { PagoDeudaActionModal } from "@/features/operaciones/pago-deuda/components/pago-deuda-action-modal";

interface PagoDeudaBoardProps {
    refreshKey?: number;
}

const columns = [
    { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
    { key: "dni_cliente", label: "DNI" },
    { key: "nombre_cliente", label: "Cliente" },
    { key: "nombre_banco_cliente", label: "Banco" },
    { key: "nombre_estado", label: "Estado" },
    { key: "monto_deposito_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente) },
    { key: "resultado_comision_servicio", label: "Comision", render: (row: OperacionProceso) => formatMoney(row.resultado_comision_servicio) },
    { key: "nombre_empresa_salida", label: "Empresa Salida" },
    { key: "fecha_registro", label: "Fecha", render: (row: OperacionProceso) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
];
const filters = ["Todos", "Solicitado"];
const actions = ["Transferencia", "Match", "Reiniciar", "Pagar"];

export const PagoDeudaBoard = ({ refreshKey = 0 }: PagoDeudaBoardProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [dni, setDni] = useState("");
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoSolicitado, setEstadoSolicitado] = useState<{ id: number; nombre: string } | null>(null);
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [solicitudes, setSolicitudes] = useState<OperacionProceso[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionRefreshKey, setActionRefreshKey] = useState(0);
    const [pendingAction, setPendingAction] = useState<"Transferencia" | "Match" | null>(null);
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;

    const params = useMemo(() => {
        const values: Record<string, unknown> = {};
        if (dni.trim()) values.p_dni_cliente = dni.trim();
        if (activeFilter === "Solicitado" && estadoSolicitado) values.p_id_estado = estadoSolicitado.id;
        return values;
    }, [activeFilter, dni, estadoSolicitado]);

    useEffect(() => {
        let ignore = false;

        estadoService
            .getList({})
            .then((rows) => {
                if (ignore) return;
                const estados = rows.map((row) => ({ id: Number(row.id), nombre: String(row.nombre ?? "") }));
                setEstadoPagado(estados.find((item) => item.nombre.toUpperCase() === "PAGADO") ?? null);
                setEstadoPendiente(estados.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ?? null);
                setEstadoSolicitado(
                    estados.find((item) => item.nombre.toUpperCase() === "SOLICITADO") ??
                        estados.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ??
                        null,
                );
            })
            .catch(() => addToast("error", "Error al cargar estados."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

    useEffect(() => {
        setSelectedIds([]);
    }, [activeFilter, dni, refreshKey]);

    useEffect(() => {
        let ignore = false;
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
    }, [actionRefreshKey, params, refreshKey]);

    const handleToggleRow = (id: number) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    };

    const handleOpenTransferencia = () => {
        if (!selectedIds.length) {
            addToast("error", "Selecciona al menos una solicitud.");
            return;
        }

        setPendingAction("Transferencia");
    };

    const handleOpenMatch = () => {
        if (selectedIds.length !== 1) {
            addToast("error", "Selecciona una sola solicitud para hacer match.");
            return;
        }

        setPendingAction("Match");
    };

    const handleModalSubmit = async (value: string, extraValue?: string, selectedCompany?: { id_empresa: number; id_empresa_cuenta_bancaria: number }) => {
        if (!pendingAction) return;

        setIsApplyingAction(true);

        try {
            if (pendingAction === "Transferencia") {
                if (!selectedCompany) {
                    throw new Error("No se encontro la empresa/cuenta de salida.");
                }

                for (const id of selectedIds) {
                    const result = await pagoDeudaService.patchSalida({
                        p_id_operacion: id,
                        p_id_empresa_salida: selectedCompany.id_empresa,
                        p_id_empresa_cuenta_salida: selectedCompany.id_empresa_cuenta_bancaria,
                        p_id_usuario_gestor: userId,
                        p_nombre_usuario_gestor: userName,
                        p_ruta_destino: extraValue,
                    });

                    if (result && "error" in result) {
                        throw new Error(String((result as Record<string, unknown>).error));
                    }
                }
            }

            if (pendingAction === "Match") {
                const result = await pagoDeudaService.patchMatch({
                    p_id_pago_deuda: selectedIds[0],
                    p_id_operacion_efectivizacion: Number(value),
                    p_id_usuario_gestor: userId,
                    p_nombre_usuario_gestor: userName,
                });

                if (result && "error" in result) {
                    throw new Error(String((result as Record<string, unknown>).error));
                }
            }

            const updated = selectedIds.length;
            setPendingAction(null);
            setSelectedIds([]);
            setActionRefreshKey((current) => current + 1);
            addToast("success", `Solicitudes actualizadas: ${updated}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al actualizar Pago Deuda.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    const handleReiniciar = async () => {
        if (!selectedIds.length) {
            addToast("error", "Selecciona al menos una solicitud.");
            return;
        }

        if (!estadoPendiente) {
            addToast("error", "No se encontro el estado Pendiente.");
            return;
        }

        setIsApplyingAction(true);

        try {
            for (const id of selectedIds) {
                await operacionesRpcService.patchOperacionReanudar(
                    buildOperacionReanudarPayload(id, estadoPendiente, { userId, userName }),
                );
            }

            setSelectedIds([]);
            setActiveFilter("Todos");
            setActionRefreshKey((value) => value + 1);
            addToast("success", `Solicitudes reiniciadas: ${selectedIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al reiniciar Pago Deuda.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    const handlePagado = async () => {
        if (!selectedIds.length) {
            addToast("error", "Selecciona al menos una solicitud.");
            return;
        }

        if (!estadoPagado) {
            addToast("error", "No se encontro el estado Pagado.");
            return;
        }

        setIsApplyingAction(true);

        try {
            for (const id of selectedIds) {
                await pagoDeudaService.patchPagado({
                    p_id_operacion: id,
                    p_id_usuario_gestor: userId,
                    p_nombre_usuario_gestor: userName,
                });
            }

            setSelectedIds([]);
            setActiveFilter("Todos");
            setActionRefreshKey((value) => value + 1);
            addToast("success", `Solicitudes pagadas: ${selectedIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al marcar Pago Deuda.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    const handleAction = (action: string) => {
        if (action === "Transferencia") handleOpenTransferencia();
        if (action === "Match") handleOpenMatch();
        if (action === "Reiniciar") void handleReiniciar();
        if (action === "Pagar") void handlePagado();
    };

    const isActionDisabled = (action: string) => {
        if (isApplyingAction || isLoading || !selectedIds.length) return true;
        if (action === "Match") return selectedIds.length !== 1;
        if (action === "Reiniciar") return !estadoPendiente;
        if (action === "Pagar") return !estadoPagado;
        return false;
    };

    return (
        <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-lg border border-secondary bg-primary shadow-xs"
        >
            <div className="flex justify-end border-b border-secondary p-4">
                <div className="flex flex-wrap justify-end gap-2">
                    <Button
                        size="sm"
                        color="secondary"
                        onClick={() => {
                            setDni("");
                            setActiveFilter("Todos");
                        }}
                    >
                        Limpiar
                    </Button>
                </div>
            </div>

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
                data={solicitudes}
                emptyText="Sin solicitudes de Pago Deuda."
                isLoading={isLoading}
                selectedIds={selectedIds}
                onToggleRow={handleToggleRow}
            />

            <PagoDeudaActionModal
                action={pendingAction}
                isOpen={pendingAction !== null}
                isSaving={isApplyingAction}
                selectedCount={selectedIds.length}
                selectedId={selectedIds[0] ?? null}
                onClose={() => setPendingAction(null)}
                onSubmit={handleModalSubmit}
            />
        </motion.section>
    );
};
