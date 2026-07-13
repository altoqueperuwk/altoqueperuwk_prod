import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";
import { OperationTable } from "@/features/operaciones/efectivizacion/shared/components/operation-table";
import { OperationToolbar } from "@/features/operaciones/efectivizacion/shared/components/operation-toolbar";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionProceso,
    OperacionRuta,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import {
    buildOperacionDerivacionPayload,
    buildOperacionPagadoPayload,
    buildOperacionReanudarPayload,
} from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { BancariaActionModal } from "@/features/operaciones/efectivizacion/bancaria/components/bancaria-action-modal";
import type { RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";

interface AsistidaOperationalBoardProps {
    companies: RutaOperacionCaja[];
    refreshKey?: number;
    ruta: OperacionRuta;
}

const filters = ["Todos", "Solicitado", "Rechazados", "Pagados"];
const actions = ["Reiniciar", "Pagar", "Derivar"];
const estadoByFilter: Record<string, string> = {
    Rechazados: "Rechazado",
    Pagados: "Pagado",
};

const columns = [
    { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
    { key: "dni_cliente", label: "DNI" },
    { key: "nombre_cliente", label: "Cliente" },
    { key: "nombre_estado", label: "Estado" },
    { key: "monto_transferencia_cliente", label: "Monto", render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente) },
    { key: "nombre_usuario_solicitud", label: "Solicita" },
    { key: "fecha_registro", label: "Fecha", render: (row: OperacionProceso) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
];

export const AsistidaOperationalBoard = ({ companies, refreshKey = 0, ruta }: AsistidaOperationalBoardProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [dni, setDni] = useState("");
    const [operaciones, setOperaciones] = useState<OperacionProceso[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionRefreshKey, setActionRefreshKey] = useState(0);
    const [isDerivarOpen, setIsDerivarOpen] = useState(false);
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoSolicitado, setEstadoSolicitado] = useState<{ id: number; nombre: string } | null>(null);

    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;

    const params = useMemo(() => {
        const values: Record<string, unknown> = {
            p_ruta_origen: ruta,
            p_ruta_destino: ruta,
        };

        if (dni.trim()) values.p_dni_cliente = dni.trim();
        if (activeFilter === "Solicitado" && estadoSolicitado) values.p_nombre_estado = estadoSolicitado.nombre;
        if (activeFilter !== "Todos" && estadoByFilter[activeFilter]) values.p_nombre_estado = estadoByFilter[activeFilter];

        return values;
    }, [activeFilter, dni, estadoSolicitado, ruta]);

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
            .catch(() => addToast("error", "Error al cargar estados operativos."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

    useEffect(() => {
        setSelectedIds([]);
    }, [activeFilter, dni, refreshKey, ruta]);

    useEffect(() => {
        let ignore = false;
        setIsLoading(true);
        setError(null);

        operacionesRpcService
            .getOperaciones(params)
            .then((result) => {
                if (!ignore) setOperaciones(result ?? []);
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar la bandeja asistida.");
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

    const handleAction = async (action: string) => {
        if (!selectedIds.length) {
            addToast("error", "Selecciona al menos una solicitud.");
            return;
        }

        if (action === "Derivar") {
            setIsDerivarOpen(true);
            return;
        }

        if (action === "Pagar" && !estadoPagado) {
            addToast("error", "No se encontro el estado Pagado.");
            return;
        }

        if (action === "Reiniciar" && !estadoPendiente) {
            addToast("error", "No se encontro el estado Pendiente.");
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
            addToast("success", `Solicitudes actualizadas: ${selectedIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al actualizar solicitudes.";
            addToast("error", message);
        } finally {
            setIsApplyingAction(false);
        }
    };

    const handleDerivar = async (value: string) => {
        setIsApplyingAction(true);

        try {
            for (const id of selectedIds) {
                await operacionesRpcService.patchOperacionDerivacion(
                    buildOperacionDerivacionPayload(id, ruta, value, { userId, userName }),
                );
            }

            setIsDerivarOpen(false);
            setSelectedIds([]);
            setActionRefreshKey((value) => value + 1);
            addToast("success", `Solicitudes derivadas: ${selectedIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al derivar solicitudes.";
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
            <div className="border-b border-secondary p-4">
                <h2 className="text-sm font-semibold text-primary">Bandeja {getRutaLabel(ruta)}</h2>
                <p className="mt-1 text-sm text-tertiary">Solicitudes asistidas originadas en esta ruta.</p>
            </div>

            <OperationToolbar
                activeFilter={activeFilter}
                actions={actions}
                dni={dni}
                filters={filters}
                isActionDisabled={() => isApplyingAction || !selectedIds.length}
                onAction={handleAction}
                onDniChange={setDni}
                onFilterChange={setActiveFilter}
            />

            {error && <div className="border-t border-secondary px-4 py-3 text-sm text-error-primary">{error}</div>}

            <OperationTable
                columns={columns}
                data={operaciones}
                emptyText="Sin solicitudes para esta bandeja."
                isLoading={isLoading}
                selectedIds={selectedIds}
                onToggleRow={handleToggleRow}
            />

            <BancariaActionModal
                action={isDerivarOpen ? "Derivar" : null}
                companies={companies}
                currentRuta={ruta}
                isOpen={isDerivarOpen}
                isSaving={isApplyingAction}
                selectedCount={selectedIds.length}
                onClose={() => setIsDerivarOpen(false)}
                onSubmit={handleDerivar}
            />
        </motion.section>
    );
};
