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
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";

interface AsistidaOperationalBoardProps {
    companies: RutaOperacionCaja[];
    onChanged?: () => void;
    refreshKey?: number;
    ruta: OperacionRuta;
    selectedDate: string;
}

const filters = ["Todos", "Solicitado", "Pagados"];
const estadoByFilter: Record<string, string> = {
    Pagados: "Pagado",
};

const baseColumns = [
    { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
    { key: "dni_cliente", label: "DNI" },
    { key: "nombre_cliente", label: "Cliente" },
    { key: "nombre_estado", label: "Estado" },
    {
        key: "monto_transferencia_cliente",
        label: "Monto",
        render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente),
    },
    { key: "nombre_usuario_solicitud", label: "Solicita" },
    { key: "fecha_registro", label: "Fecha", render: (row: OperacionProceso) => new Date(row.fecha_registro).toLocaleDateString("es-PE") },
];

const buildEstadoPayload = (
    id: number,
    estado: { id: number; nombre: string },
    user: { userId: number | null; userName: string | null },
) => ({
    p_id: id,
    p_id_estado: estado.id,
    p_nombre_estado: estado.nombre,
    p_fecha_pagado: estado.nombre.toUpperCase() === "PAGADO" ? new Date().toISOString() : null,
    p_fecha_pendiente: estado.nombre.toUpperCase() !== "PAGADO" ? new Date().toISOString() : null,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const AsistidaOperationalBoard = ({ onChanged, refreshKey = 0, ruta, selectedDate }: AsistidaOperationalBoardProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [codigo, setCodigo] = useState("");
    const [dni, setDni] = useState("");
    const [operaciones, setOperaciones] = useState<OperacionProceso[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoSolicitado, setEstadoSolicitado] = useState<{ id: number; nombre: string } | null>(null);

    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const actions = ruta === "linkpago" ? ["Reiniciar", "Pagar"] : [];
    const columns = useMemo(
        () =>
            ruta === "pos"
                ? [
                      ...baseColumns.slice(0, 4),
                      {
                          key: "ruta_destino",
                          label: "Destino",
                          render: (row: OperacionProceso) =>
                              [
                                  getRutaLabel((row.ruta_destino ?? "") as OperacionRuta),
                                  row.nombre_empresa_salida,
                                  row.nombre_banco_empresa_cuenta_salida,
                              ]
                                  .filter(Boolean)
                                  .join(" - "),
                      },
                      ...baseColumns.slice(4),
                  ]
                : baseColumns,
        [ruta],
    );

    const params = useMemo(() => {
        const values: Record<string, unknown> = {
            p_ruta: ruta,
            p_fecha_registro_desde: `${selectedDate}T00:00:00`,
            p_fecha_registro_hasta: `${selectedDate}T23:59:59`,
        };

        if (codigo.trim()) values.p_codigo_operacion = codigo.trim();
        if (dni.trim()) values.p_dni_cliente = dni.trim();
        if (activeFilter === "Solicitado" && estadoSolicitado) values.p_nombre_estado = estadoSolicitado.nombre;
        if (activeFilter !== "Todos" && estadoByFilter[activeFilter]) values.p_nombre_estado = estadoByFilter[activeFilter];

        return values;
    }, [activeFilter, codigo, dni, estadoSolicitado, ruta, selectedDate]);

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
    }, [activeFilter, codigo, dni, refreshKey, ruta, selectedDate]);

    useEffect(() => {
        let ignore = false;
        setIsLoading(true);
        setError(null);

        operacionesRpcService
            .getOperacionAsistidaBandeja(params)
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
    }, [params, refreshKey]);

    const handleToggleRow = (id: number) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    };

    const handleAction = async (action: string) => {
        if (!selectedIds.length) {
            addToast("error", "Selecciona al menos una solicitud.");
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
            const updatedRows: OperacionProceso[] = [];
            for (const id of selectedIds) {
                if (action === "Pagar" && estadoPagado) {
                    const saved = await operacionesRpcService.patchOperacionEstado(
                        buildEstadoPayload(id, estadoPagado, { userId, userName }),
                    );
                    updatedRows.push(saved);
                }

                if (action === "Reiniciar" && estadoPendiente) {
                    const saved = await operacionesRpcService.patchOperacionEstado(
                        buildEstadoPayload(id, estadoPendiente, { userId, userName }),
                    );
                    updatedRows.push(saved);
                }
            }

            setSelectedIds([]);
            setOperaciones((current) => current.map((row) => updatedRows.find((item) => item.id === row.id) ?? row));
            onChanged?.();
            addToast("success", `Solicitudes actualizadas: ${selectedIds.length}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al actualizar solicitudes.";
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
                code={codigo}
                dni={dni}
                filters={filters}
                isActionDisabled={() => isApplyingAction || !selectedIds.length}
                onAction={handleAction}
                onCodeChange={setCodigo}
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
                onToggleRow={actions.length ? handleToggleRow : undefined}
            />
        </motion.section>
    );
};
