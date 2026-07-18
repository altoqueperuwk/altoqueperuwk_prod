import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check } from "@untitledui/icons";
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
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
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

const filters = ["Todos", "Pendiente Transferencia", "Pendiente Devolución", "Pendiente Comisión"];
const actions = ["Confirmar Comision"];

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

export const PagoDeudaSteps = ({ row }: { row: OperacionProceso }) => {
    const estado = getEstadoToken(row.nombre_estado);
    const completed = [
        true,
        estado === "PROCESADO" || estado === "PAGADO",
        Boolean(row.id_operacion_match) || estado === "PAGADO",
        Boolean(row.flag_comision_registrada) || (estado === "PAGADO" && Boolean(row.id_operacion_match)),
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
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [solicitudes, setSolicitudes] = useState<OperacionProceso[]>([]);
    const [cuentasActivas, setCuentasActivas] = useState<EmpresaCuentaActiva[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [savingCuentaIds, setSavingCuentaIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionRefreshKey, setActionRefreshKey] = useState(0);
    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;

    const params = useMemo(() => {
        const values: Record<string, unknown> = {};
        if (dni.trim()) values.p_dni_cliente = dni.trim();
        return values;
    }, [dni]);

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

        operacionesRpcService
            .getCajaOperativa({ p_id_estado: 1 })
            .then((cajas) => {
                if (ignore) return;
                const setCajas = new Set((cajas ?? []).map((c) => `${c.id_empresa}-${c.id_empresa_cuenta_bancaria}`));
                setCuentasActivas((current) =>
                    current.filter((cuenta) => setCajas.has(`${cuenta.id_empresa}-${cuenta.id}`)),
                );
            })
            .catch(() => addToast("error", "Error al cargar cajas operativas."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

    useEffect(() => {
        setSelectedIds([]);
    }, [activeFilter, dni, refreshKey]);

    const filterSolicitudes = (rows: OperacionProceso[]) => {
        if (activeFilter === "Todos") return rows;

        return rows.filter((row) => {
            const estado = getEstadoToken(row.nombre_estado);
            const isProcesado = estado === "PROCESADO" || estado === "PAGADO";
            const hasMatch = Boolean(row.id_operacion_match);
            const hasComision = Boolean(row.flag_comision_registrada);

            if (activeFilter === "Pendiente Transferencia") return !isProcesado;
            if (activeFilter === "Pendiente Devolución") return isProcesado && !hasMatch;
            if (activeFilter === "Pendiente Comisión") return hasMatch && !hasComision;
            return true;
        });
    };

    useEffect(() => {
        let ignore = false;
        setIsLoading(true);
        setError(null);

        pagoDeudaService
            .getSolicitudes(params)
            .then((result) => {
                if (!ignore) setSolicitudes(filterSolicitudes(result ?? []));
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
            (row) => selectedIds.includes(row.id) && Boolean(row.id_operacion_match) && !Boolean(row.flag_comision_registrada),
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
                updatedRows.push(saved);
            }

            setSelectedIds([]);
            setActiveFilter("Todos");
            setSolicitudes((current) => current.map((row) => updatedRows.find((item) => item.id === row.id) ?? row));
            addToast("success", `Comisiones confirmadas: ${eligible.length}`);
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

    const isActionDisabled = (action: string) => {
        if (isApplyingAction || isLoading || !selectedIds.length) return true;
        if (action === "Confirmar Comision") {
            return !solicitudes.some(
                (row) => selectedIds.includes(row.id) && Boolean(row.id_operacion_match) && !Boolean(row.flag_comision_registrada),
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
            render: (row: OperacionProceso) => (
                <div className="tabular-nums">
                    <div className="flex items-center gap-1">
                        <CompactMoneyCell value={row.resultado_comision_servicio} />
                        <CompactBadgeLine>{row.comision_servicio != null ? `${row.comision_servicio}%` : "-"}</CompactBadgeLine>
                    </div>
                </div>
            ),
        },
        {
            key: "empresa_comision",
            label: "Empresa",
            render: (row: OperacionProceso) => (
                <CompactInlineSelect
                    aria-label="Empresa de comision"
                    width="w-52"
                    value={row.id_empresa_ingreso ? String(row.id_empresa_ingreso) : ""}
                    disabled={savingCuentaIds.includes(row.id) || !row.id_operacion_match}
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
                        disabled={savingCuentaIds.includes(row.id) || !row.id_empresa_ingreso || !row.id_operacion_match}
                        onChange={(event) => handleCuentaChange(row, getSelectValue(event))}
                        options={[{ label: "Cuenta", value: "" }, ...cuentaOptions]}
                    />
                );
            },
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
        </motion.section>
    );
};
