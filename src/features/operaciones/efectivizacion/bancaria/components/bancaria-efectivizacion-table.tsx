import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Copy01, Eye, RefreshCcw02 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import {
    CompactBadgeLine,
    CompactCellText,
    CompactInlineSelect,
    CompactMoneyCell,
    getSelectValue,
} from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import type { OperacionProceso, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
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
    onRefresh: () => void;
    onToggleRow?: (id: number) => void;
    selectedIds?: number[];
    user: UserRef;
}

const isPagado = (row: OperacionProceso) => (row.nombre_estado ?? "").toUpperCase() === "PAGADO";

const toNumber = (value: unknown) => Number(value ?? 0);

const toOption = (value: unknown, label: unknown) => ({
    value: String(value ?? ""),
    label: String(label ?? ""),
});

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

const columnHeaders = [
    { label: "Facturacion", className: "w-[140px]" },
    { label: "Cod. Op.", className: "w-[92px]" },
    { label: "DNI", className: "w-[170px]" },
    { label: "Comunidad", className: "w-[110px]" },
    { label: "Empresa Salida", className: "w-[210px]" },
    { label: "Banco Transf.", className: "w-[130px]" },
    { label: "Monto", className: "w-[110px] text-right" },
    { label: "Comision", className: "w-[110px] text-right" },
    { label: "Transferencia", className: "w-[130px] text-right" },
    { label: "Estado", className: "w-[118px]" },
    { label: "Hora", className: "w-[92px]" },
    { label: "Acciones", className: "w-[52px] text-center" },
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
    onRefresh,
    onToggleRow,
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
    const isDerivacion = mode === "derivaciones";
    const activeCompanyAccounts = useMemo(
        () => companies.filter((company) => !activeCompanyId || company.id_empresa === activeCompanyId),
        [activeCompanyId, companies],
    );

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
                payload = {
                    ...payload,
                    p_resultado_comision_servicio: calc.resultado_comision_servicio,
                    p_monto_transferencia_cliente: calc.monto_transferencia_cliente,
                    p_resultado_comision_banco_ingreso: calc.resultado_comision_banco_ingreso,
                    p_resultado_comision_banco_salida: calc.resultado_comision_banco_salida,
                };
            }

            const saved = await operacionesRpcService.patchOperacionBase(payload);
            setRows((current) => current.map((row) => (row.id === saved.id ? saved : row)));
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

    const readOnlyIngreso = (row: OperacionProceso) => isPagado(row) || isDerivacion || savingIds.includes(row.id);
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
                addToast("success", "Operacion pagada.");
                onRefresh();
            } catch (err) {
                addToast("error", err instanceof Error ? err.message : "No se pudo pagar la operacion.");
            } finally {
                setSavingIds((current) => current.filter((id) => id !== row.id));
            }
            return;
        }

        await operacionesRpcService.patchOperacionEstado({
            p_id: row.id,
            p_id_estado: estadoRef.id,
            p_nombre_estado: estadoRef.nombre,
        });
        onRefresh();
    };

    const handleAction = async (row: OperacionProceso, action: string) => {
        if (action === "Copiar") {
            await navigator.clipboard.writeText(String(row.monto_transferencia_cliente ?? row.monto_deposito_cliente ?? ""));
            addToast("success", "Monto copiado.");
            return;
        }

        if (action === "Reanudar" && estadoPendiente) {
            await operacionesRpcService.patchOperacionReanudar(buildOperacionReanudarPayload(row.id, estadoPendiente, user));
            addToast("success", "Operacion reanudada.");
            onRefresh();
            return;
        }

        if (action === "Pagado" && estadoPagado) {
            await handleEstado(row, String(estadoPagado.id));
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
                <table className="min-w-[1370px] table-fixed divide-y divide-secondary">
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
                                const estadoColor = isPagado(row) ? "success" : row.nombre_estado?.toUpperCase() === "ERROR" ? "error" : "warning";

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
                                            {disabledIngreso || tipoOptions.length <= 1 ? (
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
                                                aria-label="Empresa salida"
                                                width="w-48"
                                                disabled={disabledSalida || activeCompanyAccounts.length <= 1}
                                                value={String(empresaSalidaValue(row) ?? "")}
                                                onChange={(event) => handleCompanySalida(row, event.currentTarget.value)}
                                                options={accountOptions}
                                            />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactInlineSelect
                                                aria-label="Banco transferencia"
                                                width="w-28"
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
                                                options={(bancos ?? []).map((item) => toOption(item.id, item.nombre))}
                                            />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactMoneyCell value={row.monto_deposito_cliente} />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactMoneyCell
                                                value={row.resultado_comision_servicio}
                                                secondary={
                                                    <>
                                                        <CompactBadgeLine>{toNumber(row.monto_deposito_cliente) > toNumber(row.monto_minimo_deposito_servicio) ? `${row.comision_servicio ?? 0}%` : formatMoney(row.comision_minima_servicio)}</CompactBadgeLine>
                                                        {toNumber(row.comision_monto_extra_servicio) > 0 && <CompactBadgeLine color="warning">Extra {formatMoney(row.comision_monto_extra_servicio)}</CompactBadgeLine>}
                                                    </>
                                                }
                                            />
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-primary">{formatMoney(row.monto_transferencia_cliente)}</span>
                                                <Button size="xs" color="tertiary" iconLeading={Copy01} onClick={() => void handleAction(row, "Copiar")} />
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            {isPagado(row) ? (
                                                <CompactBadgeLine color="success">{row.nombre_estado}</CompactBadgeLine>
                                            ) : (
                                                <CompactInlineSelect
                                                    aria-label="Estado"
                                                    width="w-28"
                                                    disabled={rowSaving}
                                                    value={String(row.id_estado ?? "")}
                                                    onChange={(event) => void handleEstado(row, event.currentTarget.value)}
                                                    options={(estados ?? []).map((item) => toOption(item.id, item.nombre))}
                                                />
                                            )}
                                            {!isPagado(row) && row.nombre_estado && row.nombre_estado !== "Activo" && <CompactBadgeLine color={estadoColor} className="mt-1">{row.nombre_estado}</CompactBadgeLine>}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactCellText primary={formatTime(row.fecha_deposito_cliente) || "-"} secondary={formatDate(row.fecha_deposito_cliente)} />
                                        </td>
                                        <td className="px-2 py-2 text-center align-top">
                                            <Dropdown.Root>
                                                <Dropdown.DotsButton />
                                                <Dropdown.Popover>
                                                    <Dropdown.Menu
                                                        onAction={(key) => void handleAction(row, String(key))}
                                                    >
                                                        {!isPagado(row) && <Dropdown.Item id="Pagado" icon={RefreshCcw02}>Pagado</Dropdown.Item>}
                                                        {isPagado(row) && <Dropdown.Item id="Reanudar" icon={RefreshCcw02}>Reanudar</Dropdown.Item>}
                                                        <Dropdown.Item id="Visualizar" icon={Eye}>Visualizar</Dropdown.Item>
                                                        <Dropdown.Item id="Copiar" icon={Copy01}>Copiar transferencia</Dropdown.Item>
                                                    </Dropdown.Menu>
                                                </Dropdown.Popover>
                                            </Dropdown.Root>
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
        </div>
    );
};
