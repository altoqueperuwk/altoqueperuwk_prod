import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Coins01, Copy01, Eye, Percent01, RefreshCcw02 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import {
    CompactBadgeLine,
    CompactCellText,
    CompactInlineSelect,
    CompactMoneyCell,
    getSelectValue,
} from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import type { OperacionProceso, OperacionRutaBancaria, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { buildOperacionPagadoPayload, buildOperacionReanudarPayload } from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { cx } from "@/utils/cx";

interface EstadoRef {
    id: number;
    nombre: string;
}

interface UserRef {
    userId: number | null;
    userName: string | null;
}

type ManualCommissionType = "especial" | "extra";

interface ReglaEfectivizacion {
    id: number;
    id_codigo_servicio: number;
    id_banco: number | null;
    id_comunidad: number | null;
    tipo_deposito: string | null;
    comision_servicio: number | null;
    monto_minimo_deposito_servicio: number | null;
    comision_minima_servicio: number | null;
}

interface BancariaEfectivizacionTableProps {
    activeCompanyId: number | null;
    companies: RutaOperacionCaja[];
    data: OperacionProceso[];
    emptyText: string;
    estadoPagado: EstadoRef | null;
    estadoPendiente: EstadoRef | null;
    isLoading?: boolean;
    mode?: "efectivizacion" | "derivaciones";
    onMetricsChanged: () => void;
    onRefresh: () => void;
    onRowUpdated: (row: OperacionProceso) => void;
    onToggleRow?: (id: number) => void;
    ruta: OperacionRutaBancaria;
    selectedIds?: number[];
    user: UserRef;
}

const isPagado = (row: OperacionProceso) => (row.nombre_estado ?? "").toUpperCase() === "PAGADO";

const toNumber = (value: unknown) => Number(value ?? 0);

const toOption = (value: unknown, label: unknown) => ({
    value: String(value ?? ""),
    label: String(label ?? ""),
});

const allowedCuentaClienteBanks = ["bcp", "bbva", "scotiabank", "scotibank", "interbank", "banbif"];
const tipoDepositoVisibleRoutes: OperacionRutaBancaria[] = ["scotiabank", "banbif"];

const normalizeBankName = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();

const uniqueOptions = (options: { value: string; label: string }[]) => {
    const seen = new Set<string>();
    return options.filter((option) => {
        if (!option.value || seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
    });
};

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

const mergeRule = (row: OperacionProceso, regla: ReglaEfectivizacion | null): OperacionProceso => {
    if (!regla) return row;

    return {
        ...row,
        nombre_tipo_deposito: regla.tipo_deposito ?? row.nombre_tipo_deposito,
        comision_servicio: regla.comision_servicio ?? row.comision_servicio,
        monto_minimo_deposito_servicio: regla.monto_minimo_deposito_servicio ?? row.monto_minimo_deposito_servicio,
        comision_minima_servicio: regla.comision_minima_servicio ?? row.comision_minima_servicio,
    };
};

const formatDate = (value?: string | null) => {
    if (!value) return "";
    return new Date(value).toLocaleDateString("es-PE");
};

const formatTime = (value?: string | null) => {
    if (!value) return "";
    return new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
};

const getColumnHeaders = (showCuentaIngresoInDni: boolean) => [
    { label: "Facturacion" },
    { label: "Cod. Op." },
    { label: "DNI", className: showCuentaIngresoInDni ? "w-[170px]" : undefined },
    { label: "Comunidad" },
    { label: "Cuenta Empresa", className: "w-32" },
    { label: "Cuenta Cliente", className: "w-32" },
    { label: "Monto" },
    { label: "Comision" },
    { label: "Transferencia" },
    { label: "Estado" },
    { label: "Hora", className: "w-24" },
    { label: "Acciones", className: "w-14 text-center" },
];

export const BancariaEfectivizacionTable = ({
    activeCompanyId,
    companies,
    data,
    emptyText,
    estadoPagado,
    estadoPendiente,
    isLoading = false,
    mode = "efectivizacion",
    onMetricsChanged,
    onRefresh,
    onRowUpdated,
    onToggleRow,
    ruta,
    selectedIds = [],
    user,
}: BancariaEfectivizacionTableProps) => {
    const { bancos, comunidades, estados } = useSessionCache();
    const { addToast } = useToast();
    const [rows, setRows] = useState<OperacionProceso[]>(data);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [savingIds, setSavingIds] = useState<number[]>([]);
    const [reglas, setReglas] = useState<ReglaEfectivizacion[]>([]);
    const [manualCommission, setManualCommission] = useState<{
        row: OperacionProceso;
        type: ManualCommissionType;
        value: string;
    } | null>(null);
    const [pagoDeudaMatches, setPagoDeudaMatches] = useState<Record<number, OperacionProceso[]>>({});
    const hasSelection = Boolean(onToggleRow);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

    useEffect(() => {
        setRows(data);
    }, [data]);

    useEffect(() => {
        setPage(1);
    }, [rows.length, pageSize]);

    useEffect(() => {
        let ignore = false;

        reglasEfectivizacionService
            .getList({ p_id_estado: 1 })
            .then((result) => {
                if (ignore) return;
                setReglas(
                    result.map((item) => ({
                        id: Number(item.id),
                        id_codigo_servicio: Number(item.id_codigo_servicio),
                        id_banco: item.id_banco == null ? null : Number(item.id_banco),
                        id_comunidad: item.id_comunidad == null ? null : Number(item.id_comunidad),
                        tipo_deposito: item.tipo_deposito == null ? null : String(item.tipo_deposito),
                        comision_servicio: item.comision_servicio == null ? null : Number(item.comision_servicio),
                        monto_minimo_deposito_servicio: item.monto_minimo_deposito_servicio == null ? null : Number(item.monto_minimo_deposito_servicio),
                        comision_minima_servicio: item.comision_minima_servicio == null ? null : Number(item.comision_minima_servicio),
                    })),
                );
            })
            .catch(() => addToast("error", "No se pudieron cargar reglas de efectivizacion."));

        return () => {
            ignore = true;
        };
    }, [addToast]);

    const paginatedRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, rows]);
    const visibleIds = paginatedRows.map((row) => row.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    const showCuentaIngresoInDni = ruta === "safetypay";
    const showTipoDeposito = tipoDepositoVisibleRoutes.includes(ruta);
    const columnHeaders = useMemo(() => getColumnHeaders(showCuentaIngresoInDni), [showCuentaIngresoInDni]);
    const activeCompanyAccounts = useMemo(
        () => companies.filter((company) => !activeCompanyId || company.id_empresa === activeCompanyId),
        [activeCompanyId, companies],
    );
    const cuentaClienteOptions = useMemo(
        () =>
            (bancos ?? [])
                .filter((item) => {
                    const bankName = normalizeBankName(item.nombre);
                    return allowedCuentaClienteBanks.some((allowedBank) => bankName.includes(allowedBank));
                })
                .map((item) => toOption(item.id, item.nombre)),
        [bancos],
    );

    useEffect(() => {
        if (mode !== "efectivizacion" || !paginatedRows.length) {
            setPagoDeudaMatches({});
            return;
        }

        let ignore = false;

        Promise.all(
            paginatedRows.map(async (row) => {
                if (isPagado(row) || row.tipo_flujo_pago_deuda) return [row.id, []] as const;
                const matches = await pagoDeudaService.getMatches({ p_id_operacion_efectivizacion: row.id });
                return [row.id, matches ?? []] as const;
            }),
        )
            .then((entries) => {
                if (ignore) return;
                setPagoDeudaMatches(Object.fromEntries(entries));
            })
            .catch(() => {
                if (!ignore) setPagoDeudaMatches({});
            });

        return () => {
            ignore = true;
        };
    }, [mode, paginatedRows]);

    const tipoDepositoOptions = (row: OperacionProceso) => uniqueOptions([
        ...(row.nombre_tipo_deposito ? [toOption(row.nombre_tipo_deposito, row.nombre_tipo_deposito)] : []),
        ...reglas
            .filter((regla) =>
                regla.id_codigo_servicio === row.id_codigo_servicio &&
                (!regla.id_banco || regla.id_banco === row.id_banco_empresa_cuenta_ingreso) &&
                (!regla.id_comunidad || regla.id_comunidad === row.id_comunidad) &&
                regla.tipo_deposito
            )
            .map((regla) => toOption(regla.tipo_deposito, regla.tipo_deposito)),
    ]);

    const findRule = (row: OperacionProceso) => reglas.find((regla) =>
        regla.id_codigo_servicio === row.id_codigo_servicio &&
        (!regla.id_banco || regla.id_banco === row.id_banco_empresa_cuenta_ingreso) &&
        (!regla.id_comunidad || regla.id_comunidad === row.id_comunidad) &&
        (!regla.tipo_deposito || regla.tipo_deposito === row.nombre_tipo_deposito),
    ) ?? null;

    const persistRow = async (draft: OperacionProceso, patch: Record<string, unknown>, recalculate = false) => {
        setSavingIds((current) => [...current, draft.id]);
        try {
            let payload: Record<string, unknown> = { p_id: draft.id, ...patch };

            if (recalculate) {
                const calc = await operacionesRpcService.calcularOperacion(getCalculationPayload(draft));
                if (isDerivaciones) {
                    payload = {
                        ...payload,
                        p_resultado_comision_banco_salida: calc.resultado_comision_banco_salida,
                    };
                } else {
                    payload = {
                        ...payload,
                        p_resultado_comision_servicio: calc.resultado_comision_servicio,
                        p_monto_transferencia_cliente: calc.monto_transferencia_cliente,
                        p_resultado_comision_banco_ingreso: calc.resultado_comision_banco_ingreso,
                        p_resultado_comision_banco_salida: calc.resultado_comision_banco_salida,
                    };
                }
            }

            const saved = await operacionesRpcService.patchOperacionBase(payload);
            setRows((current) => current.map((row) => (row.id === saved.id ? saved : row)));
            onRowUpdated(saved);
            if (recalculate) onMetricsChanged();
            addToast("success", "Operacion actualizada.");
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo guardar la operacion.");
        } finally {
            setSavingIds((current) => current.filter((id) => id !== draft.id));
        }
    };

    const patchWithRule = async (row: OperacionProceso, patch: Partial<OperacionProceso>, payload: Record<string, unknown>) => {
        const draftBase = { ...row, ...patch };
        const regla = findRule(draftBase);

        if (!regla && (patch.id_comunidad || patch.nombre_tipo_deposito || patch.id_empresa_cuenta_ingreso)) {
            addToast("error", "No se encontro una regla activa para la combinacion seleccionada.");
            return;
        }

        const draft = mergeRule(draftBase, regla);
        await persistRow(draft, {
            ...payload,
            p_comision_servicio: draft.comision_servicio,
            p_monto_minimo_deposito_servicio: draft.monto_minimo_deposito_servicio,
            p_comision_minima_servicio: draft.comision_minima_servicio,
        }, true);
    };

    const isDerivaciones = mode === "derivaciones";
    const readOnlyIngreso = (row: OperacionProceso) => isDerivaciones || isPagado(row) || savingIds.includes(row.id);
    const readOnlySalida = (row: OperacionProceso) => isPagado(row) || savingIds.includes(row.id);

    const handleToggleVisible = () => {
        if (!onToggleRow || isLoading) return;
        if (allVisibleSelected) {
            visibleIds.forEach((id) => onToggleRow(id));
            return;
        }
        visibleIds.filter((id) => !selectedIds.includes(id)).forEach((id) => onToggleRow(id));
    };

    const handleCompanySalida = (row: OperacionProceso, value: string) => {
        const company = activeCompanyAccounts.find((item) => String(item.id) === value);
        if (!company) return;

        const draft = {
            ...row,
            id_empresa_salida: company.id_empresa,
            nombre_empresa_salida: company.nombre_empresa,
            id_empresa_cuenta_salida: company.id_empresa_cuenta_bancaria,
            id_banco_empresa_cuenta_salida: company.id_banco,
            nombre_banco_empresa_cuenta_salida: company.nombre_banco,
            id_banco_cliente_transferencia: company.id_banco,
            nombre_banco_cliente_transferencia: company.nombre_banco,
        };

        void persistRow(draft, {
            p_id_empresa_salida: company.id_empresa,
            p_nombre_empresa_salida: company.nombre_empresa,
            p_id_empresa_cuenta_salida: company.id_empresa_cuenta_bancaria,
            p_id_banco_empresa_cuenta_salida: company.id_banco,
            p_nombre_banco_empresa_cuenta_salida: company.nombre_banco,
            p_id_banco_cliente_transferencia: company.id_banco,
            p_nombre_banco_cliente_transferencia: company.nombre_banco,
        }, true);
    };

    const openManualCommission = (row: OperacionProceso, type: ManualCommissionType) => {
        if (isPagado(row) || savingIds.includes(row.id)) return;
        setManualCommission({
            row,
            type,
            value: String(type === "especial" ? row.comision_servicio ?? 0 : row.comision_monto_extra_servicio ?? 0),
        });
    };

    const handleManualCommissionSave = async () => {
        if (!manualCommission) return;

        const value = Number(manualCommission.value);
        if (!Number.isFinite(value) || value < 0) {
            addToast("error", "Ingresa un valor mayor o igual a 0.");
            return;
        }

        if (manualCommission.type === "extra" && !Number.isInteger(value)) {
            addToast("error", "La comision extra debe ser un monto entero en soles.");
            return;
        }

        const row = rows.find((item) => item.id === manualCommission.row.id) ?? manualCommission.row;

        if (manualCommission.type === "especial") {
            await persistRow(
                {
                    ...row,
                    comision_servicio: value,
                    monto_minimo_deposito_servicio: 0,
                },
                {
                    p_comision_servicio: value,
                    p_monto_minimo_deposito_servicio: 0,
                },
                true,
            );
        } else {
            await persistRow(
                {
                    ...row,
                    comision_monto_extra_servicio: value,
                },
                {
                    p_comision_monto_extra_servicio: value,
                },
                true,
            );
        }

        setManualCommission(null);
    };

    const handleEstado = async (row: OperacionProceso, value: string) => {
        const estado = estados?.find((item) => String(item.id) === value);
        if (!estado) return;
        const estadoRef = { id: Number(estado.id), nombre: String(estado.nombre ?? "") };

        if (estadoRef.nombre.toUpperCase() === "PAGADO") {
            if (!estadoPagado || !window.confirm("Confirmar operacion como pagada.")) return;
            setSavingIds((current) => [...current, row.id]);
            try {
                const saved = await operacionesRpcService.patchOperacionPagado(buildOperacionPagadoPayload(row.id, estadoPagado, user));
                setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                onRowUpdated(saved);
                addToast("success", "Operacion pagada.");
                onMetricsChanged();
            } catch (err) {
                addToast("error", err instanceof Error ? err.message : "No se pudo pagar la operacion.");
            } finally {
                setSavingIds((current) => current.filter((id) => id !== row.id));
            }
            return;
        }

        const saved = await operacionesRpcService.patchOperacionEstado({
            p_id: row.id,
            p_id_estado: estadoRef.id,
            p_nombre_estado: estadoRef.nombre,
        });
        setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        onRowUpdated(saved);
        onMetricsChanged();
    };

    const handlePagoDeudaMatch = async (row: OperacionProceso) => {
        const matches = pagoDeudaMatches[row.id] ?? [];
        if (!matches.length) return;
        if (matches.length > 1) {
            addToast("error", "Hay mas de una coincidencia Pago Deuda. Usa Match desde el tab Pago Deuda.");
            return;
        }

        setSavingIds((current) => [...current, row.id]);
        try {
            const saved = await pagoDeudaService.patchMatch({
                p_id_pago_deuda: matches[0].id,
                p_id_operacion_efectivizacion: row.id,
                p_id_usuario_gestor: user.userId,
                p_nombre_usuario_gestor: user.userName,
            });
            setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            onRowUpdated(saved);
            addToast("success", "Retorno Pago Deuda enlazado.");
            onMetricsChanged();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo enlazar Pago Deuda.");
        } finally {
            setSavingIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const handlePagoDeudaDirecto = async (row: OperacionProceso) => {
        if (!window.confirm("Clasificar esta operacion como Pago Deuda Directo.")) return;

        setSavingIds((current) => [...current, row.id]);
        try {
            const saved = await pagoDeudaService.patchDirecto({
                p_id_operacion_efectivizacion: row.id,
                p_id_usuario_gestor: user.userId,
                p_nombre_usuario_gestor: user.userName,
            });
            setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            onRowUpdated(saved);
            addToast("success", "Pago Deuda Directo registrado.");
            onMetricsChanged();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo registrar Pago Deuda Directo.");
        } finally {
            setSavingIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const handleDirectoCaja = async (row: OperacionProceso) => {
        if (!window.confirm("Clasificar esta operacion como Directo Caja.")) return;

        setSavingIds((current) => [...current, row.id]);
        try {
            const saved = await operacionesRpcService.patchOperacionDirectoCaja({
                p_id: row.id,
                p_id_usuario_gestor: user.userId,
                p_nombre_usuario_gestor: user.userName,
            });
            setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            onRowUpdated(saved);
            addToast("success", "Directo Caja registrado.");
            onMetricsChanged();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo registrar Directo Caja.");
        } finally {
            setSavingIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const handleAction = async (row: OperacionProceso, action: string) => {
        if (action === "Copiar") {
            await navigator.clipboard.writeText(String(row.monto_transferencia_cliente ?? row.monto_deposito_cliente ?? ""));
            addToast("success", "Monto copiado.");
            return;
        }

        if (action === "Reanudar" && estadoPendiente) {
            const saved = await operacionesRpcService.patchOperacionReanudar(buildOperacionReanudarPayload(row.id, estadoPendiente, user));
            setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            onRowUpdated(saved);
            addToast("success", "Operacion reanudada.");
            onMetricsChanged();
            return;
        }

        if (action === "Pagado" && estadoPagado) {
            await handleEstado(row, String(estadoPagado.id));
        }

        if (action === "ComisionEspecial") {
            openManualCommission(row, "especial");
        }

        if (action === "ComisionExtra") {
            openManualCommission(row, "extra");
        }

        if (action === "PagoDeudaDirecto") {
            await handlePagoDeudaDirecto(row);
        }

        if (action === "DirectoCaja") {
            await handleDirectoCaja(row);
        }
    };

    const empresaSalidaValue = (row: OperacionProceso) =>
        activeCompanyAccounts.find((item) =>
            item.id_empresa === row.id_empresa_salida &&
            item.id_empresa_cuenta_bancaria === row.id_empresa_cuenta_salida,
        )?.id;

    const cuentaIngresoValue = (row: OperacionProceso) =>
        activeCompanyAccounts.find((item) => item.id_empresa_cuenta_bancaria === row.id_empresa_cuenta_ingreso)?.id;

    const accountOptions = activeCompanyAccounts.map((item) => ({
        value: String(item.id),
        label: item.nombre_banco,
    }));

    return (
        <div className="overflow-hidden border-t border-secondary" aria-busy={isLoading}>
            <div className="overflow-x-auto">
                <table className="w-full min-w-max table-auto divide-y divide-secondary">
                    <thead className="bg-secondary">
                        <tr>
                            {hasSelection && (
                                <th className="w-9 px-2 py-2">
                                    <Checkbox
                                        aria-label="Seleccionar pagina"
                                        isSelected={allVisibleSelected}
                                        isDisabled={isLoading}
                                        onChange={handleToggleVisible}
                                    />
                                </th>
                            )}
                            {columnHeaders.map((column) => (
                                <th key={column.label} className={cx("px-2 py-2 text-left text-xs font-semibold text-tertiary", column.className)}>{column.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary bg-primary">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, index) => (
                                <tr key={index}>
                                    <td colSpan={13} className="px-2 py-3">
                                        <div className="h-5 animate-pulse rounded bg-secondary" />
                                    </td>
                                </tr>
                            ))
                        ) : paginatedRows.length ? (
                            paginatedRows.map((row) => {
                                const disabledIngreso = readOnlyIngreso(row);
                                const disabledSalida = readOnlySalida(row);
                                const rowSaving = savingIds.includes(row.id);
                                const tipoOptions = tipoDepositoOptions(row);

                                return (
                                    <motion.tr key={row.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                                        {hasSelection && (
                                            <td className="px-2 py-2 align-top">
                                                <Checkbox
                                                    aria-label={`Seleccionar ${row.id}`}
                                                    isSelected={selectedIds.includes(row.id)}
                                                    isDisabled={rowSaving}
                                                    onChange={() => onToggleRow?.(row.id)}
                                                />
                                            </td>
                                        )}
                                        <td className="px-2 py-2 align-top">
                                            {disabledIngreso ? (
                                                <CompactBadgeLine color={row.tipo_facturacion === "Sin Boleta" ? "gray" : "brand"}>{row.tipo_facturacion ?? "Boleta"}</CompactBadgeLine>
                                            ) : (
                                                <CompactInlineSelect
                                                    aria-label="Facturacion"
                                                    width="w-28"
                                                    value={row.tipo_facturacion ?? "Boleta"}
                                                    onChange={(event) => void persistRow({ ...row, tipo_facturacion: getSelectValue(event) }, { p_tipo_facturacion: getSelectValue(event) })}
                                                    options={[{ label: "Boleta", value: "Boleta" }, { label: "Sin Boleta", value: "Sin Boleta" }]}
                                                />
                                            )}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactCellText primary={row.codigo_operacion_deposito_cliente ?? "-"} />
                                            {showTipoDeposito && (
                                                disabledIngreso || tipoOptions.length <= 1 ? (
                                                    <CompactBadgeLine color="gray" className="mt-1">{row.nombre_tipo_deposito ?? "Sin tipo"}</CompactBadgeLine>
                                                ) : (
                                                    <CompactInlineSelect
                                                        aria-label="Tipo deposito"
                                                        className="mt-1"
                                                        width="w-30"
                                                        value={row.nombre_tipo_deposito ?? ""}
                                                        onChange={(event) => void patchWithRule(row, { nombre_tipo_deposito: event.currentTarget.value }, { p_nombre_tipo_deposito: event.currentTarget.value })}
                                                        options={tipoOptions}
                                                    />
                                                )
                                            )}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            {row.dni_cliente ? (
                                                <CompactCellText primary={row.dni_cliente} />
                                            ) : (
                                                <Input
                                                    size="sm"
                                                    aria-label="DNI cliente"
                                                    value=""
                                                    placeholder="DNI"
                                                    className="w-28"
                                                    isDisabled={disabledIngreso}
                                                    onChange={(value) => {
                                                        const dni = value.replace(/\D/g, "").slice(0, 8);
                                                        if (dni.length === 8) void persistRow({ ...row, dni_cliente: dni }, { p_dni_cliente: dni });
                                                    }}
                                                />
                                            )}
                                            {showCuentaIngresoInDni && (
                                                <CompactInlineSelect
                                                    aria-label="Cuenta ingreso"
                                                    className="mt-1"
                                                    width="w-40"
                                                    disabled={disabledIngreso || activeCompanyAccounts.length <= 1}
                                                    value={String(cuentaIngresoValue(row) ?? "")}
                                                    onChange={(event) => {
                                                        const company = activeCompanyAccounts.find((item) => String(item.id) === event.currentTarget.value);
                                                        if (!company) return;
                                                        void patchWithRule(
                                                            row,
                                                            {
                                                                id_empresa_ingreso: company.id_empresa,
                                                                nombre_empresa_ingreso: company.nombre_empresa,
                                                                id_empresa_cuenta_ingreso: company.id_empresa_cuenta_bancaria,
                                                                id_banco_empresa_cuenta_ingreso: company.id_banco,
                                                                nombre_banco_empresa_cuenta_ingreso: company.nombre_banco,
                                                            },
                                                            {
                                                                p_id_empresa_ingreso: company.id_empresa,
                                                                p_nombre_empresa_ingreso: company.nombre_empresa,
                                                                p_id_empresa_cuenta_ingreso: company.id_empresa_cuenta_bancaria,
                                                                p_id_banco_empresa_cuenta_ingreso: company.id_banco,
                                                                p_nombre_banco_empresa_cuenta_ingreso: company.nombre_banco,
                                                            },
                                                        );
                                                    }}
                                                    options={accountOptions}
                                                />
                                            )}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactInlineSelect
                                                aria-label="Comunidad"
                                                width="w-24"
                                                disabled={disabledIngreso}
                                                value={String(row.id_comunidad ?? "")}
                                                onChange={(event) => {
                                                    const comunidad = comunidades?.find((item) => String(item.id) === event.currentTarget.value);
                                                    if (!comunidad) return;
                                                    void patchWithRule(
                                                        row,
                                                        { id_comunidad: Number(comunidad.id), nombre_comunidad: String(comunidad.nombre ?? "") },
                                                        { p_id_comunidad: Number(comunidad.id), p_nombre_comunidad: String(comunidad.nombre ?? "") },
                                                    );
                                                }}
                                                options={(comunidades ?? []).map((item) => toOption(item.id, item.nombre))}
                                            />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactInlineSelect
                                                aria-label="Cuenta empresa"
                                                width="w-32"
                                                disabled={disabledSalida || activeCompanyAccounts.length <= 1}
                                                value={String(empresaSalidaValue(row) ?? "")}
                                                onChange={(event) => handleCompanySalida(row, event.currentTarget.value)}
                                                options={accountOptions}
                                            />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactInlineSelect
                                                aria-label="Cuenta cliente"
                                                width="w-32"
                                                disabled={disabledSalida}
                                                value={String(row.id_banco_cliente_transferencia ?? "")}
                                                onChange={(event) => {
                                                    const banco = bancos?.find((item) => String(item.id) === event.currentTarget.value);
                                                    if (!banco) return;
                                                    const draft = {
                                                        ...row,
                                                        id_banco_cliente_transferencia: Number(banco.id),
                                                        nombre_banco_cliente_transferencia: String(banco.nombre ?? ""),
                                                    };
                                                    void persistRow(draft, {
                                                        p_id_banco_cliente_transferencia: Number(banco.id),
                                                        p_nombre_banco_cliente_transferencia: String(banco.nombre ?? ""),
                                                    }, true);
                                                }}
                                                options={cuentaClienteOptions}
                                            />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactMoneyCell value={row.monto_deposito_cliente} />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <div className="tabular-nums">
                                                <div className="flex items-center gap-1">
                                                    <span className="whitespace-nowrap text-sm font-semibold text-primary">{formatMoney(row.resultado_comision_servicio)}</span>
                                                    <CompactBadgeLine>{toNumber(row.monto_deposito_cliente) > toNumber(row.monto_minimo_deposito_servicio) ? `${row.comision_servicio ?? 0}%` : formatMoney(row.comision_minima_servicio)}</CompactBadgeLine>
                                                </div>
                                                {toNumber(row.comision_monto_extra_servicio) > 0 && (
                                                    <div className="mt-1 flex">
                                                        <CompactBadgeLine color="warning">Extra {formatMoney(row.comision_monto_extra_servicio)}</CompactBadgeLine>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <div className="flex items-center gap-1">
                                                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-primary">{formatMoney(row.monto_transferencia_cliente)}</span>
                                                <Button size="xs" color="tertiary" iconLeading={Copy01} onClick={() => void handleAction(row, "Copiar")} />
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <Button
                                                size="xs"
                                                color={isPagado(row) ? "secondary" : "primary"}
                                                isDisabled={rowSaving || isPagado(row) || !estadoPagado}
                                                onClick={() => estadoPagado && void handleEstado(row, String(estadoPagado.id))}
                                            >
                                                {isPagado(row) ? "Pagado" : "Pendiente"}
                                            </Button>
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactCellText primary={formatTime(row.fecha_deposito_cliente) || "-"} secondary={formatDate(row.fecha_deposito_cliente)} />
                                        </td>
                                        <td className="px-2 py-2 text-center align-top">
                                            <div className="flex items-center justify-center gap-1">
                                                {mode === "efectivizacion" && (
                                                    <Button
                                                        size="xs"
                                                        color="secondary"
                                                        isDisabled={rowSaving || isPagado(row) || !(pagoDeudaMatches[row.id]?.length)}
                                                        onClick={() => void handlePagoDeudaMatch(row)}
                                                    >
                                                        PD
                                                    </Button>
                                                )}
                                            <Dropdown.Root>
                                                <Dropdown.DotsButton />
                                                <Dropdown.Popover>
                                                    <Dropdown.Menu
                                                        onAction={(key) => void handleAction(row, String(key))}
                                                    >
                                                        {isPagado(row) && <Dropdown.Item id="Reanudar" icon={RefreshCcw02}>Reanudar</Dropdown.Item>}
                                                        {!isPagado(row) && <Dropdown.Item id="ComisionEspecial" icon={Percent01}>Com. Especial</Dropdown.Item>}
                                                        {!isPagado(row) && <Dropdown.Item id="ComisionExtra" icon={Coins01}>Com. Extra</Dropdown.Item>}
                                                        {!isPagado(row) && mode === "efectivizacion" && <Dropdown.Item id="PagoDeudaDirecto" icon={Coins01}>PD Directo</Dropdown.Item>}
                                                        {!isPagado(row) && mode === "efectivizacion" && <Dropdown.Item id="DirectoCaja" icon={Coins01}>Directo Caja</Dropdown.Item>}
                                                        <Dropdown.Item id="Visualizar" icon={Eye}>Visualizar</Dropdown.Item>
                                                    </Dropdown.Menu>
                                                </Dropdown.Popover>
                                            </Dropdown.Root>
                                            </div>
                                            {rowSaving && <p className="mt-1 text-xs text-tertiary">Guardando...</p>}
                                        </td>
                                    </motion.tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={13} className="px-4 py-10 text-center text-sm text-tertiary">{emptyText}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-secondary px-4 py-3">
                <Button
                    aria-label="Pagina anterior"
                    size="sm"
                    color="secondary"
                    iconLeading={ChevronLeft}
                    isDisabled={isLoading || page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                />
                <span className="text-sm text-tertiary">Pagina {page} de {totalPages}</span>
                <Button
                    aria-label="Pagina siguiente"
                    size="sm"
                    color="secondary"
                    iconLeading={ChevronRight}
                    isDisabled={isLoading || page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                />
                <NativeSelect
                    aria-label="Filas por pagina"
                    size="sm"
                    className={cx("w-28")}
                    value={String(pageSize)}
                    onChange={(event) => setPageSize(Number(event.currentTarget.value))}
                    options={[{ label: "20", value: "20" }, { label: "50", value: "50" }, { label: "100", value: "100" }]}
                />
            </div>
            <ModalOverlay isOpen={manualCommission !== null} onOpenChange={(open) => !open && setManualCommission(null)}>
                <Modal className="max-w-sm">
                    <Dialog>
                        <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">
                                    {manualCommission?.type === "especial" ? "Com. Especial" : "Com. Extra"}
                                </h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    {manualCommission?.type === "especial" ? "Porcentaje manual para esta operacion." : "Monto adicional en soles para esta operacion."}
                                </p>
                            </div>

                            <div className="mt-5">
                                <Input
                                    size="sm"
                                    label={manualCommission?.type === "especial" ? "Porcentaje" : "Monto"}
                                    type="number"
                                    value={manualCommission?.value ?? ""}
                                    onChange={(value) => setManualCommission((current) => (current ? { ...current, value } : current))}
                                />
                            </div>

                            <div className="mt-6 flex justify-end gap-2">
                                <Button color="secondary" isDisabled={manualCommission ? savingIds.includes(manualCommission.row.id) : false} onClick={() => setManualCommission(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    isLoading={manualCommission ? savingIds.includes(manualCommission.row.id) : false}
                                    onClick={() => void handleManualCommissionSave()}
                                >
                                    Guardar
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
