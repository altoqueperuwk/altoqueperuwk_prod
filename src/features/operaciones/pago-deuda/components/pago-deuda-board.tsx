import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { estadoService } from "@/services/estado.service";
import { empresaCuentaBancariaService } from "@/services/empresa-cuenta-bancaria.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { OperationTable } from "@/features/operaciones/efectivizacion/shared/components/operation-table";
import { OperationToolbar } from "@/features/operaciones/efectivizacion/shared/components/operation-toolbar";
import {
    CompactBadgeLine,
    CompactCellText,
    CompactInlineSelect,
    CompactMoneyCell,
    getSelectValue,
} from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import type { OperacionProceso } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { buildOperacionReanudarPayload } from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import { PagoDeudaActionModal } from "@/features/operaciones/pago-deuda/components/pago-deuda-action-modal";
import { cx } from "@/utils/cx";

interface PagoDeudaBoardProps {
    refreshKey?: number;
}

interface EmpresaCuentaActiva {
    id: number;
    id_empresa: number;
    empresa_nombre: string;
    id_banco: number;
    banco_nombre: string;
}

const filters = ["Todos", "Solicitado"];
const actions = ["Transferencia", "Match", "Comision", "Reiniciar", "Pagar"];

const formatDate = (value?: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
};

const formatTime = (value?: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
};

const getEstadoToken = (estado?: string | null) => estado?.trim().toUpperCase() ?? "";

const getEstadoColor = (estado?: string | null): "gray" | "brand" | "error" | "warning" | "success" => {
    const token = getEstadoToken(estado);
    if (token === "PAGADO") return "success";
    if (token === "PROCESADO") return "brand";
    if (token === "RECHAZADO") return "error";
    return "warning";
};

const PagoDeudaSteps = ({ row }: { row: OperacionProceso }) => {
    const estado = getEstadoToken(row.nombre_estado);
    const completed = [
        true,
        estado === "PROCESADO" || estado === "PAGADO",
        Boolean(row.id_operacion_match) || estado === "PAGADO",
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

export const PagoDeudaBoard = ({ refreshKey = 0 }: PagoDeudaBoardProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [dni, setDni] = useState("");
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoSolicitado, setEstadoSolicitado] = useState<{ id: number; nombre: string } | null>(null);
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [solicitudes, setSolicitudes] = useState<OperacionProceso[]>([]);
    const [cuentasActivas, setCuentasActivas] = useState<EmpresaCuentaActiva[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [savingCuentaIds, setSavingCuentaIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionRefreshKey, setActionRefreshKey] = useState(0);
    const [pendingAction, setPendingAction] = useState<"Transferencia" | "Match" | "Comision" | null>(null);
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;

    const params = useMemo(() => {
        const values: Record<string, unknown> = {};
        if (dni.trim()) values.p_dni_cliente = dni.trim();
        if (activeFilter === "Solicitado" && estadoSolicitado) values.p_id_estado = estadoSolicitado.id;
        return values;
    }, [activeFilter, dni, estadoSolicitado]);

    const empresasActivas = useMemo(() => {
        const byId = new Map<number, { label: string; value: string }>();
        cuentasActivas.forEach((cuenta) => {
            if (!byId.has(cuenta.id_empresa)) {
                byId.set(cuenta.id_empresa, { label: cuenta.empresa_nombre, value: String(cuenta.id_empresa) });
            }
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
                setEstadoPendiente(estados.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ?? null);
                setEstadoSolicitado(
                    estados.find((item) => item.nombre.toUpperCase() === "SOLICITADO") ??
                        estados.find((item) => item.nombre.toUpperCase() === "PENDIENTE") ??
                        null,
                );
            })
            .catch(() => addToast("error", "Error al cargar estados."));

        empresaCuentaBancariaService
            .getList({ p_id_estado: 1 })
            .then((rows) => {
                if (ignore) return;
                setCuentasActivas(
                    (rows ?? []).map((row) => ({
                        id: Number(row.id),
                        id_empresa: Number(row.id_empresa),
                        empresa_nombre: String(row.empresa_nombre ?? ""),
                        id_banco: Number(row.id_banco),
                        banco_nombre: String(row.banco_nombre ?? ""),
                    })),
                );
            })
            .catch(() => addToast("error", "Error al cargar cuentas bancarias."));

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

    const updateSolicitud = (updated: OperacionProceso) => {
        setSolicitudes((current) => current.map((row) => (row.id === updated.id ? updated : row)));
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
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo guardar la cuenta de comision.");
        } finally {
            setSavingCuentaIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const handleEmpresaChange = (row: OperacionProceso, value: string) => {
        const cuenta = cuentasActivas.find((item) => item.id_empresa === Number(value));
        if (!cuenta) {
            addToast("error", "La empresa seleccionada no tiene cuentas activas.");
            return;
        }

        void persistComisionCuenta(row, cuenta);
    };

    const handleCuentaChange = (row: OperacionProceso, value: string) => {
        const cuenta = cuentasActivas.find((item) => item.id === Number(value));
        if (!cuenta) {
            addToast("error", "Cuenta bancaria no encontrada.");
            return;
        }

        void persistComisionCuenta(row, cuenta);
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
            const updatedRows: OperacionProceso[] = [];

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

                    updatedRows.push(result);
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

                updatedRows.push(result);
            }

            if (pendingAction === "Comision") {
                for (const id of selectedIds) {
                    const row = solicitudes.find((item) => item.id === id);
                    if (!row?.id_empresa_ingreso || !row.id_empresa_cuenta_ingreso) {
                        throw new Error("Selecciona empresa y cuenta de comision antes de registrar el ingreso.");
                    }

                    await pagoDeudaService.postComision({
                        p_id_operacion: id,
                        p_id_empresa_ingreso: row.id_empresa_ingreso,
                        p_id_empresa_cuenta_ingreso: row.id_empresa_cuenta_ingreso,
                        p_monto_comision: Number(value),
                        p_id_usuario: userId,
                        p_nombre_usuario: userName,
                    });
                }
            }

            const updated = selectedIds.length;
            setPendingAction(null);
            setSelectedIds([]);
            if (updatedRows.length) {
                setSolicitudes((current) => current.map((row) => updatedRows.find((item) => item.id === row.id) ?? row));
            } else {
                setActionRefreshKey((current) => current + 1);
            }
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
            const updatedRows: OperacionProceso[] = [];
            for (const id of selectedIds) {
                const saved = await operacionesRpcService.patchOperacionReanudar(
                    buildOperacionReanudarPayload(id, estadoPendiente, { userId, userName }),
                );
                updatedRows.push(saved);
            }

            setSelectedIds([]);
            setActiveFilter("Todos");
            setSolicitudes((current) => current.map((row) => updatedRows.find((item) => item.id === row.id) ?? row));
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
            const updatedRows: OperacionProceso[] = [];
            for (const id of selectedIds) {
                const saved = await pagoDeudaService.patchPagado({
                    p_id_operacion: id,
                    p_id_usuario_gestor: userId,
                    p_nombre_usuario_gestor: userName,
                });
                updatedRows.push(saved);
            }

            setSelectedIds([]);
            setActiveFilter("Todos");
            setSolicitudes((current) => current.map((row) => updatedRows.find((item) => item.id === row.id) ?? row));
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
        if (action === "Comision") setPendingAction("Comision");
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
            render: (row: OperacionProceso) => <CompactCellText primary={row.nombre_cliente || "-"} className="max-w-44" />,
        },
        {
            key: "nombre_banco_cliente",
            label: "Banco",
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
            render: (row: OperacionProceso) => <CompactMoneyCell value={row.resultado_comision_servicio} />,
        },
        {
            key: "empresa_comision",
            label: "Empresa",
            render: (row: OperacionProceso) => (
                <CompactInlineSelect
                    aria-label="Empresa de comision"
                    width="w-52"
                    value={row.id_empresa_ingreso ? String(row.id_empresa_ingreso) : ""}
                    disabled={savingCuentaIds.includes(row.id)}
                    onChange={(event) => handleEmpresaChange(row, getSelectValue(event))}
                    options={[{ label: "Empresa", value: "" }, ...empresasActivas]}
                />
            ),
        },
        {
            key: "cuenta_comision",
            label: "Cuenta",
            render: (row: OperacionProceso) => {
                const cuentaOptions = cuentasActivas
                    .filter((cuenta) => cuenta.id_empresa === Number(row.id_empresa_ingreso))
                    .map((cuenta) => ({ label: cuenta.banco_nombre, value: String(cuenta.id) }));

                return (
                    <CompactInlineSelect
                        aria-label="Cuenta de comision"
                        width="w-36"
                        value={row.id_empresa_cuenta_ingreso ? String(row.id_empresa_cuenta_ingreso) : ""}
                        disabled={savingCuentaIds.includes(row.id) || !row.id_empresa_ingreso}
                        onChange={(event) => handleCuentaChange(row, getSelectValue(event))}
                        options={[{ label: "Cuenta", value: "" }, ...cuentaOptions]}
                    />
                );
            },
        },
        {
            key: "nombre_estado",
            label: "Estado",
            render: (row: OperacionProceso) => (
                <CompactBadgeLine color={getEstadoColor(row.nombre_estado)}>{row.nombre_estado ?? "-"}</CompactBadgeLine>
            ),
        },
        {
            key: "fecha_registro",
            label: "Fecha Hora",
            render: (row: OperacionProceso) => (
                <CompactCellText primary={formatTime(row.fecha_registro) || "-"} secondary={formatDate(row.fecha_registro)} />
            ),
        },
    ];

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
