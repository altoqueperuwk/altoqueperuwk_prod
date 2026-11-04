import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, CreditCardX, Edit03, Trash01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { isAdministrator, isJefeTienda, useAuth } from "@/providers/auth-provider";
import { canDeleteAssistedOperation } from "../utils/asistida-delete-permission";
import { PosDeleteSummary } from "./pos-delete-summary";
import { useToast } from "@/providers/toast-provider";
import { bancoService } from "@/services/banco.service";
import { estadoService } from "@/services/estado.service";
import { OperationTable } from "@/features/operaciones/efectivizacion/shared/components/operation-table";
import { OperationToolbar } from "@/features/operaciones/efectivizacion/shared/components/operation-toolbar";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import type {
    OperacionProceso,
    OperacionRuta,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { CompactBadgeLine } from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { sanitizeAmountInput } from "@/features/operaciones/efectivizacion/shared/utils/amount-input";
import { getPeruTimestamp, toPeruDayEnd, toPeruDayStart } from "@/features/operaciones/efectivizacion/shared/utils/date";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { cx } from "@/utils/cx";
import { LinkPagoEditModal } from "@/features/operaciones/efectivizacion/asistida/components/linkpago-edit-modal";
import { LinkPagoFechaModal } from "@/features/operaciones/efectivizacion/asistida/components/linkpago-fecha-modal";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import { CopyableDni } from "@/features/operaciones/efectivizacion/shared/components/copyable-dni";
import { useWindowFocusRefresh } from "@/features/operaciones/efectivizacion/shared/hooks/use-window-focus-refresh";
import { reconcileRows } from "@/features/operaciones/efectivizacion/shared/utils/reconcile-rows";

interface AsistidaOperationalBoardProps {
    companies: RutaOperacionCaja[];
    onChanged?: () => void;
    refreshKey?: number;
    ruta: OperacionRuta;
    dateFrom: string;
    dateTo: string;
}

const filters = ["Todos", "Solicitado", "Pagados"];
const estadoByFilter: Record<string, string> = {
    Pagados: "Pagado",
};

const formatDate = (value: string | null | undefined) => {
    if (!value) return "";
    return new Date(value).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatTime = (value: string | null | undefined) => {
    if (!value) return "";
    return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
};

const isPagado = (row: OperacionProceso) => String(row.nombre_estado ?? "").trim().toUpperCase() === "PAGADO";

const AsistidaEstadoButton = ({ row }: { row: OperacionProceso }) => {
    const pagado = isPagado(row);

    return (
        <Button
            size="xs"
            color={pagado ? "secondary" : "primary"}
            isDisabled
        >
            {pagado ? "Pagado" : "Pendiente"}
        </Button>
    );
};

const CompactBadge = ({ children, tone = "default" }: { children: string; tone?: "default" | "brand" | "success" }) => (
    <span
        className={cx(
            "inline-flex w-max items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
            tone === "brand" && "bg-brand-solid text-primary_on-brand ring-transparent",
            tone === "success" && "bg-success-primary text-success-primary ring-success",
            tone === "default" && "bg-secondary text-secondary ring-secondary",
        )}
    >
        {children}
    </span>
);

const baseColumns = [
    { key: "codigo_operacion_deposito_cliente", label: "Codigo" },
    { key: "dni_cliente", label: "DNI", render: (row: OperacionProceso) => <CopyableDni value={row.dni_cliente} /> },
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

const linkpagoColumns = [
    {
        key: "nombre_usuario",
        label: "Usuario",
        render: (row: OperacionProceso) => <CompactBadge>{row.nombre_usuario ?? "-"}</CompactBadge>,
    },
    {
        key: "nombre_banco_cliente",
        label: "Entidad Tarjeta",
        render: (row: OperacionProceso) => (
            <CompactBadge>{row.nombre_banco_cliente ?? "-"}</CompactBadge>
        ),
    },
    {
        key: "numero_tarjeta",
        label: "Tarjeta",
        cellClassName: "font-medium text-primary tabular-nums",
        render: (row: OperacionProceso) => row.numero_tarjeta || "-",
    },
    { key: "dni_cliente", label: "DNI", cellClassName: "font-medium text-primary", render: (row: OperacionProceso) => <CopyableDni value={row.dni_cliente} /> },
    {
        key: "nombre_cliente",
        label: "Nombre",
        cellClassName: "max-w-[25ch] truncate",
        render: (row: OperacionProceso) => row.nombre_cliente?.toUpperCase() || "-",
    },
    { key: "nombre_comunidad", label: "Comunidad" },
    {
        key: "monto_deposito_cliente",
        label: "Monto Deposito",
        cellClassName: "font-semibold text-concept-transferencia tabular-nums",
        render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente),
    },
    {
        key: "resultado_comision_servicio",
        label: "Comision",
        render: (row: OperacionProceso) => (
            <div className="flex items-center gap-1 tabular-nums">
                <span className="font-semibold text-primary">{formatMoney(row.resultado_comision_servicio)}</span>
                {row.comision_servicio != null && <CompactBadge>{`${row.comision_servicio}%`}</CompactBadge>}
            </div>
        ),
    },
    {
        key: "comision_ecompany",
        label: "Comision ECompany",
        cellClassName: "tabular-nums",
        render: (row: OperacionProceso) => (
            <span className="text-concept-gasto font-semibold">
                {formatMoney(
                    (row.resultado_comision_banco_ingreso ?? 0) + (row.resultado_comision_banco_salida ?? 0),
                )}
            </span>
        ),
    },
    {
        key: "comision_atk",
        label: "Comision ATK",
        cellClassName: "tabular-nums",
        render: (row: OperacionProceso) => (
            <span className="text-concept-ganancia font-semibold">
                {formatMoney(
                    (row.resultado_comision_servicio ?? 0)
                    - (row.resultado_comision_banco_ingreso ?? 0)
                    - (row.resultado_comision_banco_salida ?? 0),
                )}
            </span>
        ),
    },
    {
        key: "monto_transferencia_cliente",
        label: "Transferencia",
        cellClassName: "font-semibold text-concept-transferencia tabular-nums",
        render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente),
    },
    {
        key: "nombre_estado",
        label: "Estado",
        render: (row: OperacionProceso) => <AsistidaEstadoButton row={row} />,
    },
    {
        key: "fecha_registro",
        label: "Fecha Hora",
        render: (row: OperacionProceso) => (
            <div className="leading-tight">
                <p className="font-medium text-primary">{formatTime(row.fecha_registro) || "-"}</p>
                <p className="text-xs text-tertiary">{formatDate(row.fecha_registro)}</p>
            </div>
        ),
    },
];

const posColumns = [
    {
        key: "nombre_usuario",
        label: "Usuario",
        render: (row: OperacionProceso) => <CompactBadge>{row.nombre_usuario ?? "-"}</CompactBadge>,
    },
    {
        key: "nombre_pos",
        label: "POS",
        render: (row: OperacionProceso) => (
            <CompactBadgeLine>{row.nombre_pos ?? "-"}</CompactBadgeLine>
        ),
    },
    {
        key: "nombre_empresa_pos",
        label: "Empresa",
        render: (row: OperacionProceso) => (
            <CompactBadgeLine color="brand">{row.nombre_empresa_pos ?? "-"}</CompactBadgeLine>
        ),
    },
    {
        key: "codigo_operacion_deposito_cliente",
        label: "Cod. Operacion",
        cellClassName: "font-medium text-primary tabular-nums",
        render: (row: OperacionProceso) => row.codigo_operacion_deposito_cliente ?? "-",
    },
    {
        key: "nombre_banco_cliente",
        label: "Entidad Tarjeta",
        render: (row: OperacionProceso) => (
            <CompactBadge>{row.nombre_banco_cliente ?? "-"}</CompactBadge>
        ),
    },
    {
        key: "numero_tarjeta",
        label: "Tarjeta",
        cellClassName: "font-medium text-primary tabular-nums",
        render: (row: OperacionProceso) => row.numero_tarjeta || "-",
    },
    { key: "dni_cliente", label: "DNI", cellClassName: "font-medium text-primary", render: (row: OperacionProceso) => <CopyableDni value={row.dni_cliente} /> },
    { key: "nombre_comunidad", label: "Comunidad" },
    {
        key: "monto_deposito_cliente",
        label: "Monto Deposito",
        cellClassName: "font-semibold text-concept-transferencia tabular-nums",
        render: (row: OperacionProceso) => formatMoney(row.monto_deposito_cliente),
    },
    {
        key: "resultado_comision_servicio",
        label: "Comision",
        render: (row: OperacionProceso) => (
            <div className="flex items-center gap-1 tabular-nums">
                <span className="font-semibold text-primary">{formatMoney(row.resultado_comision_servicio)}</span>
                {row.comision_servicio != null && <CompactBadge>{`${row.comision_servicio}%`}</CompactBadge>}
            </div>
        ),
    },
    {
        key: "nombre_empresa_salida",
        label: "Empresa Cuenta",
        render: (row: OperacionProceso) => (
            <div className="flex min-w-0 flex-wrap gap-1">
                <CompactBadgeLine color="brand">{row.nombre_empresa_salida ?? "-"}</CompactBadgeLine>
                <CompactBadgeLine>{row.nombre_banco_empresa_cuenta_salida ?? "-"}</CompactBadgeLine>
            </div>
        ),
    },
    {
        key: "monto_transferencia_cliente",
        label: "Transferencia",
        cellClassName: "font-semibold text-concept-transferencia tabular-nums",
        render: (row: OperacionProceso) => formatMoney(row.monto_transferencia_cliente ?? row.monto_deposito_cliente),
    },
    {
        key: "nombre_estado",
        label: "Estado",
        render: (row: OperacionProceso) => <AsistidaEstadoButton row={row} />,
    },
    {
        key: "fecha_registro",
        label: "Hora",
        render: (row: OperacionProceso) => (
            <div className="leading-tight">
                <p className="font-medium text-primary">{formatTime(row.fecha_registro) || "-"}</p>
                <p className="text-xs text-tertiary">{formatDate(row.fecha_registro)}</p>
            </div>
        ),
    },
];

const buildEstadoPayload = (
    id: number,
    estado: { id: number; nombre: string },
    user: { userId: number | null; userName: string | null },
) => ({
    p_id: id,
    p_id_estado: estado.id,
    p_nombre_estado: estado.nombre,
    p_fecha_pagado: estado.nombre.toUpperCase() === "PAGADO" ? getPeruTimestamp() : null,
    p_fecha_pendiente: estado.nombre.toUpperCase() !== "PAGADO" ? getPeruTimestamp() : null,
    p_id_usuario_gestor: user.userId,
    p_nombre_usuario_gestor: user.userName,
});

export const AsistidaOperationalBoard = ({ onChanged, refreshKey = 0, ruta, dateFrom, dateTo }: AsistidaOperationalBoardProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const [activeFilter, setActiveFilter] = useState("Todos");
    const [codigo, setCodigo] = useState("");
    const [dni, setDni] = useState("");
    const [operaciones, setOperaciones] = useState<OperacionProceso[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isApplyingAction, setIsApplyingAction] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [estadoPagado, setEstadoPagado] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoPendiente, setEstadoPendiente] = useState<{ id: number; nombre: string } | null>(null);
    const [estadoSolicitado, setEstadoSolicitado] = useState<{ id: number; nombre: string } | null>(null);
    const [editOperation, setEditOperation] = useState<OperacionProceso | null>(null);
    const [dateOperation, setDateOperation] = useState<OperacionProceso | null>(null);
    const [deleteOperation, setDeleteOperation] = useState<OperacionProceso | null>(null);
    const [entidadTarjetaFiltro, setEntidadTarjetaFiltro] = useState("");
    const [tarjeta, setTarjeta] = useState("");
    const [montoDeposito, setMontoDeposito] = useState("");
    const [bancosFiltro, setBancosFiltro] = useState<{ id: number; nombre: string; tipo: string }[]>([]);
    const focusRefreshKey = useWindowFocusRefresh();
    const hasLoadedRows = useRef(false);
    const lastQuerySignature = useRef<string | null>(null);

    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const userName = (businessUser?.nombre as string | undefined) ?? (businessUser?.username as string | undefined) ?? null;
    const isAdministratorProfile = isAdministrator(businessUser);
    const isJefeTiendaProfile = isJefeTienda(businessUser);
    const canViewAllAssisted = isAdministratorProfile || isJefeTiendaProfile;
    const canManageOperation = (row: OperacionProceso) =>
        isAdministratorProfile
        || !isJefeTiendaProfile
        || (userId !== null && Number(row.id_usuario_solicitud) === userId);
    const canEditOperation = (row: OperacionProceso) => isPagado(row) || canManageOperation(row);
    const canDeleteOperation = (row: OperacionProceso) => canDeleteAssistedOperation({
        ruta,
        estado: row.nombre_estado,
        idEstado: row.id_estado,
        isAdministrator: isAdministratorProfile,
        isJefeTienda: isJefeTiendaProfile,
        canManage: canManageOperation(row),
    });
    const actions: string[] = [];
    const handleSinEnvioSolicitud = async (row: OperacionProceso) => {
        if (ruta !== "pos" || !canManageOperation(row) || isPagado(row)) return;

        setIsApplyingAction(true);
        try {
            const saved = await operacionesRpcService.patchOperacionAsistida({
                p_id: row.id,
                p_id_banco_cliente: row.id_banco_cliente,
                p_numero_tarjeta: row.numero_tarjeta ?? null,
                p_id_banco_destino: null,
                p_tipo_documento_cliente: null,
                p_dni_cliente: row.dni_cliente,
                p_nombre_cliente: row.nombre_cliente,
                p_id_comunidad: row.id_comunidad,
                p_nombre_comunidad: row.nombre_comunidad,
                p_monto_deposito_cliente: row.monto_deposito_cliente,
                p_id_usuario: userId,
                p_nombre_usuario: userName,
                p_sin_envio_solicitud: true,
            });

            if (saved && typeof saved === "object" && "error" in saved && saved.error) {
                throw new Error(String(saved.error));
            }

            const updated = saved as OperacionProceso;
            setOperaciones((current) => current.map((item) => item.id === row.id ? updated : item));
            setSelectedIds((current) => current.filter((id) => id !== row.id));
            onChanged?.();
            addToast("success", "POS registrado sin enviar solicitud.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo registrar el POS sin envio.");
        } finally {
            setIsApplyingAction(false);
        }
    };
    const columns = useMemo(
        () => {
            const actionColumn = {
                key: "acciones",
                label: "Acciones",
                cellClassName: "text-center",
                render: (row: OperacionProceso) => (
                    <div className="flex items-center justify-center gap-1">
                        {(ruta === "linkpago" || ruta === "pos") && (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                tooltip={canEditOperation(row) ? "Editar solicitud" : "Solo el usuario que registro la operacion puede editarla"}
                                icon={Edit03}
                                isDisabled={!canEditOperation(row)}
                                onClick={() => setEditOperation(row)}
                            />
                        )}
                        {(ruta === "linkpago" || ruta === "pos") && (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                tooltip={canEditOperation(row) ? "Cambiar fecha de registro" : "Solo el usuario que registro la operacion puede editarla"}
                                icon={CalendarIcon}
                                isDisabled={!canEditOperation(row)}
                                onClick={() => setDateOperation(row)}
                            />
                        )}
                        {ruta === "pos" && (
                            <ButtonUtility
                                size="xs"
                                color="tertiary"
                                tooltip={canManageOperation(row) ? "No Enviar Solicitud" : "Solo el usuario que registro la operacion puede editarla"}
                                icon={CreditCardX}
                                isDisabled={!canManageOperation(row) || isPagado(row) || isApplyingAction}
                                onClick={() => void handleSinEnvioSolicitud(row)}
                            />
                        )}
                        <ButtonUtility
                            size="xs"
                            color="tertiary"
                            tooltip={canDeleteOperation(row) ? "Eliminar operacion" : ruta === "linkpago" ? "Solo administrador o jefe de tienda; no disponible si ya esta eliminada" : "No disponible para esta operacion"}
                            icon={Trash01}
                            isDisabled={!canDeleteOperation(row) || isApplyingAction}
                            onClick={() => { if (canDeleteOperation(row)) setDeleteOperation(row); }}
                        />
                    </div>
                ),
            };

            if (ruta === "pos") return [...posColumns, actionColumn];
            if (ruta === "linkpago") return [...linkpagoColumns, actionColumn];
            return baseColumns;
        },
        [canDeleteOperation, canManageOperation, handleSinEnvioSolicitud, isAdministratorProfile, isApplyingAction, isJefeTiendaProfile, ruta, userId],
    );
    const entidadTarjetaOptions = useMemo(
        () => {
            if (ruta === "linkpago") {
                return bancosFiltro.filter((item) => item.id === 11 || item.id === 17);
            }

            if (ruta === "pos") {
                return bancosFiltro.filter((item) => item.tipo === "Tarjeta Comercial");
            }

            return [];
        },
        [bancosFiltro, ruta],
    );

    useEffect(() => {
        let ignore = false;
        bancoService.getList({ p_id_estado: 1 }).then((rows) => {
            if (ignore) return;
            setBancosFiltro(
                rows
                    .map((row) => ({
                        id: Number(row.id),
                        nombre: String(row.nombre ?? ""),
                        tipo: String(row.tipo ?? ""),
                    })),
            );
        }).catch(() => {});
        return () => { ignore = true; };
    }, []);

    const params = useMemo(() => {
        const hasGlobalFilter = Boolean(
            codigo.trim()
            || dni.trim()
            || entidadTarjetaFiltro
            || tarjeta.trim()
            || montoDeposito.trim(),
        );
        const values: Record<string, unknown> = { p_ruta: ruta };
        if (!hasGlobalFilter) {
            values.p_fecha_registro_desde = toPeruDayStart(dateFrom);
            values.p_fecha_registro_hasta = toPeruDayEnd(dateTo);
        }
        if (canViewAllAssisted) values.p_id_usuario_consulta = userId;
        else values.p_id_usuario_solicitud = userId;

        if (codigo.trim()) values.p_codigo_operacion = codigo.trim();
        if (dni.trim()) values.p_dni_cliente = dni.trim();
        if (activeFilter === "Solicitado" && estadoSolicitado) values.p_nombre_estado = estadoSolicitado.nombre;
        if (activeFilter !== "Todos" && estadoByFilter[activeFilter]) values.p_nombre_estado = estadoByFilter[activeFilter];
        if (entidadTarjetaFiltro) values.p_id_banco_cliente = Number(entidadTarjetaFiltro);
        if (ruta === "pos" && tarjeta.trim()) values.p_numero_tarjeta = tarjeta.trim();
        if (montoDeposito.trim()) {
            const monto = Number(montoDeposito);
            if (Number.isFinite(monto)) values.p_monto_deposito_cliente = monto;
        }

        return values;
    }, [activeFilter, canViewAllAssisted, codigo, dateFrom, dateTo, dni, entidadTarjetaFiltro, estadoSolicitado, montoDeposito, ruta, tarjeta, userId]);

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
    }, [activeFilter, codigo, dateFrom, dateTo, dni, entidadTarjetaFiltro, montoDeposito, refreshKey, ruta, tarjeta]);

    useEffect(() => {
        let ignore = false;
        if (userId === null) {
            setOperaciones([]);
            setIsInitialLoading(false);
            setIsRefreshing(false);
            return () => { ignore = true; };
        }
        const querySignature = JSON.stringify(params);
        const isBackgroundRefresh = hasLoadedRows.current && lastQuerySignature.current === querySignature;
        lastQuerySignature.current = querySignature;
        setIsInitialLoading(!isBackgroundRefresh);
        setIsRefreshing(isBackgroundRefresh);
        setError(null);

        operacionesRpcService
            .getOperacionAsistidaBandeja(params)
            .then((result) => {
                if (!ignore) setOperaciones((current) => reconcileRows(current, result ?? []));
            })
            .catch((err) => {
                if (!ignore) setError(err instanceof Error ? err.message : "No se pudo cargar la bandeja asistida.");
            })
            .finally(() => {
                if (!ignore) {
                    hasLoadedRows.current = true;
                    setIsInitialLoading(false);
                    setIsRefreshing(false);
                }
            });

        return () => {
            ignore = true;
        };
    }, [focusRefreshKey, params, refreshKey, userId]);

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

    const handleDelete = async () => {
        if (!deleteOperation || isApplyingAction) return;
        if (!canDeleteOperation(deleteOperation)) {
            addToast("error", "No tiene permiso para eliminar esta operacion.");
            return;
        }
        setIsApplyingAction(true);
        try {
            const result = await operacionesRpcService.deleteOperacionProceso({
                p_id: deleteOperation.id,
                p_id_usuario: userId,
            });
            if (result && typeof result === "object" && "error" in result && result.error) {
                throw new Error(String(result.error));
            }
            setOperaciones((current) => current.filter((row) => row.id !== deleteOperation.id));
            setSelectedIds((current) => current.filter((id) => id !== deleteOperation.id));
            setDeleteOperation(null);
            onChanged?.();
            addToast("success", "Operacion eliminada correctamente.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo eliminar la operacion.");
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
            {ruta === "linkpago" ? (
                <div className="flex flex-wrap items-center gap-3 border-b border-secondary px-4 py-3">
                    <Input size="sm" label="" aria-label="Codigo operacion" placeholder="Cod. Operacion" value={codigo} onChange={setCodigo} className="w-44" />
                    <Input size="sm" label="" aria-label="DNI" placeholder="Buscar DNI" value={dni} onChange={setDni} className="w-44" />
                    <Input
                        size="sm"
                        label=""
                        aria-label="Monto deposito"
                        placeholder="Monto Deposito"
                        value={montoDeposito}
                        onChange={(value) => setMontoDeposito(sanitizeAmountInput(value))}
                        className="w-44"
                    />
                    <NativeSelect
                        size="sm"
                        label=""
                        aria-label="Filtrar por Entidad"
                        value={entidadTarjetaFiltro}
                        onChange={(event) => setEntidadTarjetaFiltro(event.currentTarget.value)}
                        options={[
                            { label: "Filtrar por Entidad", value: "" },
                            ...entidadTarjetaOptions.map((item) => ({
                                label: item.nombre,
                                value: String(item.id),
                            })),
                        ]}
                        className="w-56"
                    />
                </div>
            ) : (
                <OperationToolbar
                    activeFilter={activeFilter}
                    actions={actions}
                    code={codigo}
                    codeMaxLength={ruta === "pos" ? 15 : undefined}
                    dni={dni}
                    extraFilters={ruta === "pos" ? (
                        <>
                            <NativeSelect
                                size="sm"
                                label=""
                                aria-label="Entidad Tarjeta"
                                value={entidadTarjetaFiltro}
                                onChange={(event) => setEntidadTarjetaFiltro(event.currentTarget.value)}
                                options={[
                                    { label: "Filtrar por Entidad", value: "" },
                                    ...entidadTarjetaOptions.map((item) => ({
                                        label: item.nombre,
                                        value: String(item.id),
                                    })),
                                ]}
                                className="w-56"
                            />
                            <Input
                                size="sm"
                                label=""
                                aria-label="Tarjeta"
                                placeholder="Tarjeta"
                                value={tarjeta}
                                inputMode="numeric"
                                maxLength={4}
                                onChange={(value) => setTarjeta(value.replace(/\D/g, "").slice(0, 4))}
                                className="w-32"
                            />
                            <Input
                                size="sm"
                                label=""
                                aria-label="Monto deposito"
                                placeholder="Monto Deposito"
                                value={montoDeposito}
                                onChange={(value) => setMontoDeposito(sanitizeAmountInput(value))}
                                className="w-44"
                            />
                        </>
                    ) : undefined}
                    filters={filters}
                    isActionDisabled={() => isApplyingAction || !selectedIds.length}
                    onAction={handleAction}
                    onCodeChange={(value) => setCodigo(value.slice(0, 15))}
                    onDniChange={setDni}
                    onFilterChange={setActiveFilter}
                />
            )}

            {error && <div className="border-t border-secondary px-4 py-3 text-sm text-error-primary">{error}</div>}

            <OperationTable
                columns={columns}
                data={operaciones}
                emptyText="Sin solicitudes para esta bandeja."
                isLoading={isInitialLoading}
                isRefreshing={isRefreshing}
                selectedIds={selectedIds}
                onToggleRow={actions.length ? handleToggleRow : undefined}
            />

            <LinkPagoEditModal
                isOpen={!!editOperation}
                operation={editOperation}
                ruta={ruta}
                onClose={() => setEditOperation(null)}
                onSaved={() => {
                    setEditOperation(null);
                    onChanged?.();
                }}
            />

            <LinkPagoFechaModal
                isOpen={!!dateOperation}
                operation={dateOperation}
                onClose={() => setDateOperation(null)}
                onSaved={() => {
                    setDateOperation(null);
                    onChanged?.();
                }}
            />

            <OperacionConfirmModal
                isOpen={!!deleteOperation}
                title="Eliminar operación"
                description={ruta === "pos" && deleteOperation && (isPagado(deleteOperation) || deleteOperation.id_estado === 4)
                    ? <>Atención: este POS está en estado <span className="font-semibold text-concept-transferencia">PAGADO</span>. Si eliminas la operación, no podrás revertir esta acción.</>
                    : "La operación pasará a Eliminado y se conservará en los reportes."}
                confirmLabel="Eliminar"
                intent="destructive"
                isLoading={isApplyingAction}
                onClose={() => setDeleteOperation(null)}
                onConfirm={() => void handleDelete()}
            >
                {ruta === "pos" && deleteOperation && <PosDeleteSummary operation={deleteOperation} />}
            </OperacionConfirmModal>
        </motion.section>
    );
};
