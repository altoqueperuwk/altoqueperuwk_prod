import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Coins01, Copy01, CreditCardCheck, Edit03, Percent01, RefreshCcw02, Send01, Trash01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";
import { clienteService } from "@/services/cliente.service";
import { operacionesRpcService } from "@/features/operaciones/efectivizacion/shared/services/operaciones-rpc.service";
import { pagoDeudaService } from "@/features/operaciones/pago-deuda/services/pago-deuda.service";
import {
    CompactBadgeLine,
    CompactCellText,
    CompactInlineSelect,
    CompactMoneyCell,
    getSelectValue,
} from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import { CopyableDni } from "@/features/operaciones/efectivizacion/shared/components/copyable-dni";
import type { OperacionProceso, OperacionRuta, OperacionRutaBancaria, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { isInteractiveElement } from "@/features/operaciones/efectivizacion/shared/utils/row-selection";
import { buildOperacionPagadoPayload, buildOperacionReanudarPayload } from "@/features/operaciones/efectivizacion/shared/utils/rpc-payloads";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
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
type RecurringCommissionType = "especial" | "extra";
type ConfirmActionType = "pagar" | "pd-directo" | "directo";

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

interface ClienteComisionRecurrente {
    especial: number | null;
    extra: number | null;
}

interface BancariaEfectivizacionTableProps {
    activeAccountId?: number | null;
    activeCompanyId: number | null;
    companies: RutaOperacionCaja[];
    data: OperacionProceso[];
    emptyText: string;
    estadoPagado: EstadoRef | null;
    estadoPendiente: EstadoRef | null;
    isLoading?: boolean;
    mode?: "efectivizacion" | "derivaciones" | "eliminados";
    onMetricsChanged: () => void;
    onRefresh: () => void;
    onRowUpdated: (row: OperacionProceso) => void;
    onDeleteOperation?: (row: OperacionProceso) => void;
    onDeriveRow?: (row: OperacionProceso) => void;
    onRestoreOperation?: (row: OperacionProceso) => void;
    onToggleRow?: (id: number) => void;
    ruta: OperacionRutaBancaria;
    selectedIds?: number[];
    user: UserRef;
}

const isPagado = (row: OperacionProceso) => (row.nombre_estado ?? "").toUpperCase() === "PAGADO";
const isRecurringInputValue = (value: string) => {
    const trimmed = value.trim();
    return trimmed === "" || /^null$/i.test(trimmed) || /^(?:\d+(?:[.,]\d*)?|\d*[.,]\d+)$/.test(trimmed);
};
const isFrozenOriginOperation = (row: OperacionProceso, mode: "efectivizacion" | "derivaciones" | "eliminados", ruta: OperacionRutaBancaria) =>
    mode === "efectivizacion" &&
    row.flag_derivado === true &&
    String(row.ruta_origen ?? "").toLowerCase() === ruta;
const isDeletable = (row: OperacionProceso) => {
    const estado = (row.nombre_estado ?? "").toUpperCase();
    return estado === "PENDIENTE" || estado === "RETENIDO" || Boolean(row.flag_retenido);
};

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

const getColumnHeaders = (showDerivo: boolean) => [
    { label: "Facturacion" },
    ...(showDerivo ? [{ label: "Derivo" }] : []),
    { label: "Cod. Op." },
    { label: "DNI" },
    { label: "Comunidad" },
    { label: "Cuenta Cliente", className: "w-32" },
    { label: "Monto" },
    { label: "Comision" },
    { label: "Transferencia" },
    { label: "Estado" },
    { label: "Hora", className: "w-24" },
    { label: "Acciones", className: "w-14 text-center" },
];

export const BancariaEfectivizacionTable = ({
    activeAccountId = null,
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
    onDeleteOperation,
    onDeriveRow,
    onRestoreOperation,
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
    const [recurringCommission, setRecurringCommission] = useState<{
        row: OperacionProceso;
        type: RecurringCommissionType;
        value: string;
    } | null>(null);
    const [recurringByOperation, setRecurringByOperation] = useState<Record<number, ClienteComisionRecurrente>>({});
    const [pagoDeudaMatches, setPagoDeudaMatches] = useState<Record<number, OperacionProceso[]>>({});
    const [pdMatchRow, setPdMatchRow] = useState<OperacionProceso | null>(null);
    const [pdSelectedMatchId, setPdSelectedMatchId] = useState<number | null>(null);
    const [dniEdit, setDniEdit] = useState<{ row: OperacionProceso; value: string } | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ row: OperacionProceso; type: ConfirmActionType } | null>(null);
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
    const visibleIds = paginatedRows.filter((row) => !isFrozenOriginOperation(row, mode, ruta)).map((row) => row.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    const showTipoDeposito = tipoDepositoVisibleRoutes.includes(ruta);
    const columnHeaders = useMemo(() => getColumnHeaders(mode === "derivaciones"), [mode]);
    const tableColSpan = columnHeaders.length + (hasSelection ? 1 : 0);
    const activeCompanyAccounts = useMemo(
        () => companies.filter((company) =>
            (!activeCompanyId || company.id_empresa === activeCompanyId) &&
            (!activeAccountId || company.id_empresa_cuenta_bancaria === activeAccountId)
        ),
        [activeAccountId, activeCompanyId, companies],
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
        if (mode !== "efectivizacion" || ruta === "safetypay" || !paginatedRows.length) {
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
    }, [mode, paginatedRows, ruta]);

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

    useEffect(() => {
        if (mode !== "efectivizacion" || !paginatedRows.length) {
            setRecurringByOperation({});
            return;
        }

        let ignore = false;
        Promise.all(
            paginatedRows.map(async (row) => {
                try {
                    let client = row.id_cliente == null ? null : await clienteService.getById(Number(row.id_cliente));
                    if (!client) {
                        const document = String(row.dni_cliente ?? "").replace(/\D/g, "");
                        if (document.length === 8 || document.length === 9) {
                            const clients = await clienteService.getList({
                                p_tipo_documento: document.length === 9 ? 2 : 1,
                                p_numero_documento: document,
                                p_id_estado: 1,
                            });
                            client = clients[0] ?? null;
                        }
                    }
                    return [row.id, {
                        especial: client?.comision_servicio_recurrente == null ? null : Number(client.comision_servicio_recurrente),
                        extra: client?.comision_monto_extra_servicio_recurrente == null ? null : Number(client.comision_monto_extra_servicio_recurrente),
                    }] as const;
                } catch {
                    return [row.id, { especial: null, extra: null }] as const;
                }
            }),
        ).then((entries) => {
            if (!ignore) setRecurringByOperation(Object.fromEntries(entries));
        });

        return () => {
            ignore = true;
        };
    }, [mode, paginatedRows]);

    const commissionActionState = (row: OperacionProceso) => {
        const recurring = recurringByOperation[row.id];
        const rule = findRule(row);
        const hasOperationSpecial = recurring && recurring.especial === null && rule?.comision_servicio != null
            && row.comision_servicio != null
            && Math.abs(Number(row.comision_servicio) - Number(rule.comision_servicio)) > 0.000001;
        const hasOperationExtra = recurring && recurring.extra === null && toNumber(row.comision_monto_extra_servicio) > 0;

        return {
            specialDisabled: recurring?.especial !== null || Boolean(hasOperationSpecial),
            specialRecurringDisabled: Boolean(hasOperationSpecial),
            extraDisabled: recurring?.extra !== null || Boolean(hasOperationExtra),
            extraRecurringDisabled: Boolean(hasOperationExtra),
        };
    };

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

    const resolveClienteId = async (row: OperacionProceso) => {
        if (row.id_cliente) return Number(row.id_cliente);

        const documento = String(row.dni_cliente ?? "").replace(/\D/g, "");
        if (documento.length !== 8 && documento.length !== 9) return null;

        const clientes = await clienteService.getList({
            p_tipo_documento: documento.length === 9 ? 2 : 1,
            p_numero_documento: documento,
            p_id_estado: 1,
        });
        const cliente = clientes?.[0];
        return cliente?.id == null ? null : Number(cliente.id);
    };

    const handleCommunityChange = async (row: OperacionProceso, value: string) => {
        const comunidad = comunidades?.find((item) => String(item.id) === value);
        if (!comunidad) return;

        try {
            const idCliente = await resolveClienteId(row);
            const clientPatch = idCliente ? { id_cliente: idCliente } : {};
            const clientPayload = idCliente ? { p_id_cliente: idCliente } : {};

            await patchWithRule(
                { ...row, ...clientPatch },
                {
                    id_comunidad: Number(comunidad.id),
                    nombre_comunidad: String(comunidad.nombre ?? ""),
                    ...clientPatch,
                },
                {
                    p_id_comunidad: Number(comunidad.id),
                    p_nombre_comunidad: String(comunidad.nombre ?? ""),
                    ...clientPayload,
                },
            );
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo resolver el cliente.");
        }
    };

    const isDerivaciones = mode === "derivaciones";
    const isEliminados = mode === "eliminados";
    const readOnlyIngreso = (row: OperacionProceso) => isDerivaciones || isEliminados || isPagado(row) || isFrozenOriginOperation(row, mode, ruta) || savingIds.includes(row.id);
    const readOnlySalida = (row: OperacionProceso) => isEliminados || isPagado(row) || isFrozenOriginOperation(row, mode, ruta) || savingIds.includes(row.id);

    const handleDniEditSave = async () => {
        if (!dniEdit) return;
        const newDni = dniEdit.value.replace(/\D/g, "").slice(0, 8);
        if (!newDni) {
            addToast("error", "El DNI debe tener al menos un digito.");
            return;
        }

        const row = rows.find((r) => r.id === dniEdit.row.id) ?? dniEdit.row;
        setSavingIds((current) => [...current, row.id]);
        try {
            const clientes = await clienteService.getList({ p_numero_documento: newDni });
            const cliente = clientes?.[0];
            const payload: Record<string, unknown> = { p_id: row.id, p_dni_cliente: newDni };
            if (cliente) {
                payload.p_id_cliente = Number(cliente.id);
                payload.p_nombre_cliente = String(cliente.nombre ?? "");
            }
            const saved = await operacionesRpcService.patchOperacionBase(payload);
            setRows((current) => current.map((r) => (r.id === saved.id ? saved : r)));
            onRowUpdated(saved);
            addToast("success", "DNI actualizado.");
            onMetricsChanged();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo actualizar el DNI.");
        } finally {
            setSavingIds((current) => current.filter((id) => id !== row.id));
            setDniEdit(null);
        }
    };

    const handleToggleVisible = () => {
        if (!onToggleRow || isLoading) return;
        if (allVisibleSelected) {
            visibleIds.forEach((id) => onToggleRow(id));
            return;
        }
        visibleIds.filter((id) => !selectedIds.includes(id)).forEach((id) => onToggleRow(id));
    };

    const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, row: OperacionProceso, isSaving: boolean) => {
        if (!onToggleRow || isLoading || isSaving || isInteractiveElement(event.target)) return;
        onToggleRow(row.id);
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

        const rawValue = manualCommission.value.trim();
        if (!isRecurringInputValue(manualCommission.value) || rawValue === "" || /^null$/i.test(rawValue)) {
            addToast("error", "Ingresa un valor numerico mayor o igual a 0.");
            return;
        }

        const value = Number(rawValue.replace(",", "."));
        if (!Number.isFinite(value) || value < 0) {
            addToast("error", "Ingresa un valor mayor o igual a 0.");
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
            setSavingIds((current) => [...current, row.id]);
            try {
                const saved = await operacionesRpcService.patchOperacionComisionExtra({
                    p_id: row.id,
                    p_comision_monto_extra_servicio: value,
                    p_id_usuario_gestor: user.userId,
                    p_nombre_usuario_gestor: user.userName,
                });
                setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                onRowUpdated(saved);
                onMetricsChanged();
                addToast("success", "Comision extra actualizada.");
            } catch (err) {
                addToast("error", err instanceof Error ? err.message : "No se pudo actualizar la comision extra.");
            } finally {
                setSavingIds((current) => current.filter((id) => id !== row.id));
            }
        }

        setManualCommission(null);
    };

    const openRecurringCommission = async (row: OperacionProceso, type: RecurringCommissionType) => {
        if (mode !== "efectivizacion" || isPagado(row) || row.flag_retenido || isFrozenOriginOperation(row, mode, ruta) || savingIds.includes(row.id)) return;
        try {
            const clientId = await resolveClienteId(row);
            if (!clientId) {
                addToast("error", "No se encontro el cliente relacionado.");
                return;
            }
            const client = await clienteService.getById(clientId);
            const raw = type === "especial"
                ? client?.comision_servicio_recurrente
                : client?.comision_monto_extra_servicio_recurrente;
            setRecurringCommission({
                row,
                type,
                value: raw == null ? "" : String(raw),
            });
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo consultar la configuracion del cliente.");
        }
    };

    const handleRecurringCommissionSave = async () => {
        if (!recurringCommission) return;
        const rawValue = recurringCommission.value.trim();
        const clear = rawValue === "" || /^null$/i.test(rawValue);
        if (!isRecurringInputValue(recurringCommission.value)) {
            addToast("error", "Ingresa solo numeros, punto o coma decimal.");
            return;
        }
        const value = Number(rawValue.replace(",", "."));
        if (!clear && (!Number.isFinite(value) || value < 0)) {
            addToast("error", "Ingresa un valor mayor o igual a 0.");
            return;
        }

        const row = rows.find((item) => item.id === recurringCommission.row.id) ?? recurringCommission.row;
        setSavingIds((current) => [...current, row.id]);
        try {
            const saved = await operacionesRpcService.patchOperacionComisionRecurrente({
                p_id: row.id,
                p_tipo_comision: recurringCommission.type,
                p_valor: clear ? null : value,
                p_limpiar: clear,
                p_ruta_actual: ruta,
                p_id_usuario_gestor: user.userId,
                p_nombre_usuario_gestor: user.userName,
            });
            setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            setRecurringByOperation((current) => {
                const previous = current[row.id] ?? { especial: null, extra: null };
                return {
                    ...current,
                    [row.id]: {
                        especial: recurringCommission.type === "especial" ? (clear ? null : value) : previous.especial,
                        extra: recurringCommission.type === "extra" ? (clear ? null : value) : previous.extra,
                    },
                };
            });
            onRowUpdated(saved);
            onMetricsChanged();
            addToast("success", clear ? "Comision recurrente limpiada." : "Comision recurrente actualizada.");
            setRecurringCommission(null);
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo actualizar la comision recurrente.");
        } finally {
            setSavingIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const executePago = async (row: OperacionProceso) => {
        if (!estadoPagado) return;
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
    };

    const handleEstado = async (row: OperacionProceso, value: string) => {
        const estado = estados?.find((item) => String(item.id) === value);
        if (!estado) return;
        const estadoRef = { id: Number(estado.id), nombre: String(estado.nombre ?? "") };

        if (estadoRef.nombre.toUpperCase() === "PAGADO") {
            if (!estadoPagado) return;
            setConfirmAction({ row, type: "pagar" });
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

    const handlePagoDeudaMatch = async (row: OperacionProceso, matchId?: number) => {
        const matches = pagoDeudaMatches[row.id] ?? [];
        if (!matches.length) return;

        const target = matchId ? matches.find((m) => m.id === matchId) : matches[0];
        if (!target) return;

        if (!matchId && matches.length > 1) {
            return;
        }

        setSavingIds((current) => [...current, row.id]);
        try {
            const saved = await pagoDeudaService.patchMatch({
                p_id_pago_deuda: target.id,
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
        setConfirmAction({ row, type: "pd-directo" });
    };

    const executePagoDeudaDirecto = async (row: OperacionProceso) => {
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

    const closePagoDeudaMatchModal = () => {
        setPdMatchRow(null);
        setPdSelectedMatchId(null);
    };

    const handleSavePagoDeudaMatch = async () => {
        if (!pdMatchRow || !pdSelectedMatchId) return;
        const row = pdMatchRow;
        const matchId = pdSelectedMatchId;
        closePagoDeudaMatchModal();
        await handlePagoDeudaMatch(row, matchId);
    };

    const handleDirectoCaja = async (row: OperacionProceso) => {
        setConfirmAction({ row, type: "directo" });
    };

    const executeDirectoCaja = async (row: OperacionProceso) => {
        setSavingIds((current) => [...current, row.id]);
        try {
            const saved = await operacionesRpcService.patchOperacionDirectoCaja({
                p_id: row.id,
                p_id_usuario_gestor: user.userId,
                p_nombre_usuario_gestor: user.userName,
            });
            setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            onRowUpdated(saved);
            addToast("success", "Directo registrado.");
            onMetricsChanged();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo registrar Directo.");
        } finally {
            setSavingIds((current) => current.filter((id) => id !== row.id));
        }
    };

    const handleConfirmAction = async () => {
        const action = confirmAction;
        if (!action) return;
        setConfirmAction(null);

        if (action.type === "pagar") {
            await executePago(action.row);
            return;
        }

        if (action.type === "pd-directo") {
            await executePagoDeudaDirecto(action.row);
            return;
        }

        await executeDirectoCaja(action.row);
    };

    const confirmCopy = (() => {
        if (!confirmAction) return null;
        if (confirmAction.type === "pagar") {
            return {
                title: "Confirmar pago",
                description: "La operacion pasara a Pagado y se generara la salida correspondiente en caja.",
                confirmLabel: "Pagar",
            };
        }
        if (confirmAction.type === "pd-directo") {
            return {
                title: "Confirmar PD Directo",
                description: "La operacion se clasificara como Pago Deuda Directo sin enlazar una solicitud.",
                confirmLabel: "Confirmar",
            };
        }
        return {
            title: "Confirmar Directo",
            description: "La operacion se marcara como ingreso directo a caja y pasara a Pagado.",
            confirmLabel: "Confirmar",
        };
    })();

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

        if (action === "ComisionEspecialRecurrente") {
            void openRecurringCommission(row, "especial");
        }

        if (action === "ComisionExtraRecurrente") {
            void openRecurringCommission(row, "extra");
        }

        if (action === "PagoDeudaDirecto") {
            await handlePagoDeudaDirecto(row);
        }

        if (action === "DirectoCaja") {
            await handleDirectoCaja(row);
        }

        if (action === "EliminarOperacion") {
            onDeleteOperation?.(row);
        }

        if (action === "RestaurarOperacion") {
            onRestoreOperation?.(row);
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
                                <th className="w-10 px-2 py-2">
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
                                    <td colSpan={tableColSpan} className="px-2 py-3">
                                        <div className="h-5 animate-pulse rounded bg-secondary" />
                                    </td>
                                </tr>
                            ))
                        ) : paginatedRows.length ? (
                            paginatedRows.map((row) => {
                                const frozenOrigin = isFrozenOriginOperation(row, mode, ruta);
                                const disabledIngreso = readOnlyIngreso(row);
                                const disabledSalida = readOnlySalida(row);
                                const rowSaving = savingIds.includes(row.id);
                                const tipoOptions = tipoDepositoOptions(row);
                                const pdDisabled = rowSaving || isPagado(row) || !(pagoDeudaMatches[row.id]?.length);
                                const displayedTransferAmount = frozenOrigin ? 0 : row.monto_transferencia_cliente;

                                return (
                                    <motion.tr
                                        key={row.id}
                                        className={cx(
                                            hasSelection && !rowSaving && !frozenOrigin && "cursor-pointer transition-colors hover:bg-primary_hover",
                                            selectedIds.includes(row.id) && "bg-secondary",
                                        )}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={(event) => !frozenOrigin && handleRowClick(event, row, rowSaving)}
                                    >
                                        {hasSelection && (
                                            <td className="w-10 px-2 py-2 align-top">
                                                {frozenOrigin ? null : (
                                                <Checkbox
                                                    aria-label={`Seleccionar ${row.id}`}
                                                    data-prevent-row-select
                                                    isSelected={selectedIds.includes(row.id)}
                                                    isDisabled={rowSaving}
                                                    onChange={() => onToggleRow?.(row.id)}
                                                />
                                                )}
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

                                        {isDerivaciones && (
                                            <td className="px-2 py-2 align-top">
                                                <CompactBadgeLine color={row.ruta_origen ? "brand" : "gray"}>
                                                    {row.ruta_origen ? getRutaLabel(row.ruta_origen as OperacionRuta) : "-"}
                                                </CompactBadgeLine>
                                            </td>
                                        )}

                                        <td className="px-2 py-2 align-top">
                                            <div className="flex flex-col items-start gap-1">
                                                <CompactCellText primary={row.codigo_operacion_deposito_cliente ?? "-"} />
                                                {frozenOrigin && <CompactBadgeLine color="gray">Derivada</CompactBadgeLine>}
                                            </div>
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
                                                <div className="flex items-center gap-1">
                                                    <CopyableDni value={row.dni_cliente} />
                                                    {!disabledIngreso && !isDerivaciones && (
                                                        <Button
                                                            size="xs"
                                                            color="tertiary"
                                                            iconLeading={Edit03}
                                                            aria-label="Editar DNI"
                                                            onClick={() => setDniEdit({ row, value: row.dni_cliente ?? "" })}
                                                        />
                                                    )}
                                                </div>
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
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <CompactInlineSelect
                                                aria-label="Comunidad"
                                                width="w-24"
                                                disabled={disabledIngreso}
                                                value={String(row.id_comunidad ?? "")}
                                                onChange={(event) => void handleCommunityChange(row, event.currentTarget.value)}
                                                options={(comunidades ?? []).map((item) => toOption(item.id, item.nombre))}
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
                                                {(() => {
                                                    const recurring = recurringByOperation[row.id];
                                                    const hasRecurringSpecial = recurring?.especial !== null && recurring?.especial !== undefined;
                                                    const hasRecurringExtra = recurring?.extra !== null && recurring?.extra !== undefined;
                                                    const commissionLabel = hasRecurringSpecial
                                                        ? `${recurring.especial}% Rec`
                                                        : toNumber(row.monto_deposito_cliente) > toNumber(row.monto_minimo_deposito_servicio)
                                                            ? `${row.comision_servicio ?? 0}%`
                                                            : formatMoney(row.comision_minima_servicio);

                                                    return (
                                                        <>
                                                <div className="flex items-center gap-1">
                                                    <span className="whitespace-nowrap text-sm font-semibold text-primary">{formatMoney(row.resultado_comision_servicio)}</span>
                                                    <CompactBadgeLine>{commissionLabel}</CompactBadgeLine>
                                                </div>
                                                {toNumber(row.comision_monto_extra_servicio) > 0 && !hasRecurringExtra && (
                                                    <div className="mt-1 flex">
                                                        <CompactBadgeLine color="warning">Extra S/ {formatInteger(row.comision_monto_extra_servicio)}</CompactBadgeLine>
                                                    </div>
                                                )}
                                                {hasRecurringExtra && (
                                                    <div className="mt-1 flex">
                                                        <CompactBadgeLine color="warning">Extra S/ {formatInteger(recurring.extra)} Rec</CompactBadgeLine>
                                                    </div>
                                                )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <div className="flex items-center gap-1">
                                                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-primary">{formatMoney(displayedTransferAmount)}</span>
                                                <Button
                                                    size="xs"
                                                    color="tertiary"
                                                    iconLeading={Copy01}
                                                    isDisabled={frozenOrigin}
                                                    onClick={() => void handleAction({ ...row, monto_transferencia_cliente: displayedTransferAmount }, "Copiar")}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            <Button
                                                size="xs"
                                                color={isPagado(row) ? "secondary" : "primary"}
                                                isDisabled={rowSaving || frozenOrigin || isEliminados || isPagado(row) || !estadoPagado}
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
                                                {(mode === "efectivizacion" || mode === "derivaciones") && ruta !== "safetypay" && (
                                                    <ButtonUtility
                                                        size="xs"
                                                        color="secondary"
                                                        icon={Send01}
                                                        tooltip="Derivar Operacion"
                                                        className={cx(
                                                            "rounded-lg bg-brand-solid text-white ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover",
                                                            isPagado(row) && "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                                                        )}
                                                        isDisabled={frozenOrigin || rowSaving || isPagado(row)}
                                                        onClick={() => !frozenOrigin && onDeriveRow?.(row)}
                                                    />
                                                )}
                                                {!frozenOrigin && mode === "efectivizacion" && ruta !== "safetypay" && Boolean(pagoDeudaMatches[row.id]?.length) && (
                                                    <ButtonUtility
                                                        size="xs"
                                                        color="secondary"
                                                        icon={CreditCardCheck}
                                                        tooltip="Confirmar Pago Deuda"
                                                        className="rounded-lg bg-brand-solid text-white ring-1 ring-transparent ring-inset hover:bg-brand-solid_hover"
                                                        isDisabled={pdDisabled}
                                                        onClick={() => {
                                                            setPdSelectedMatchId(null);
                                                            setPdMatchRow(row);
                                                        }}
                                                    />
                                                )}
                                            {!frozenOrigin && <Dropdown.Root>
                                                <Dropdown.DotsButton />
                                                <Dropdown.Popover>
                                                    <Dropdown.Menu
                                                        onAction={(key) => void handleAction(row, String(key))}
                                                    >
                                                        {mode === "eliminados" ? (
                                                            <Dropdown.Item id="RestaurarOperacion" icon={RefreshCcw02}>Restaurar</Dropdown.Item>
                                                        ) : (
                                                            <>
                                                                {(() => {
                                                                    const commissionState = commissionActionState(row);
                                                                    return (
                                                                        <>
                                                                {isPagado(row) && <Dropdown.Item id="Reanudar" icon={RefreshCcw02}>Reanudar</Dropdown.Item>}
                                                                {!isPagado(row) && <Dropdown.Item isDisabled={commissionState.specialDisabled} id="ComisionEspecial" icon={Percent01}>Com. Especial</Dropdown.Item>}
                                                                {!isPagado(row) && <Dropdown.Item isDisabled={commissionState.extraDisabled} id="ComisionExtra" icon={Coins01}>Com. Extra</Dropdown.Item>}
                                                                {!isPagado(row) && !row.flag_retenido && mode === "efectivizacion" && <Dropdown.Item isDisabled={commissionState.specialRecurringDisabled} id="ComisionEspecialRecurrente" icon={Percent01}>Com. Especial Recurrente</Dropdown.Item>}
                                                                {!isPagado(row) && !row.flag_retenido && mode === "efectivizacion" && <Dropdown.Item isDisabled={commissionState.extraRecurringDisabled} id="ComisionExtraRecurrente" icon={Coins01}>Com. Extra Recurrente</Dropdown.Item>}
                                                                {!isPagado(row) && mode === "efectivizacion" && <Dropdown.Item id="DirectoCaja" icon={Coins01}>Directo</Dropdown.Item>}
                                                                {isDeletable(row) && mode === "efectivizacion" && <Dropdown.Item id="EliminarOperacion" icon={Trash01}>Eliminar Operacion</Dropdown.Item>}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </>
                                                        )}
                                                    </Dropdown.Menu>
                                                </Dropdown.Popover>
                                            </Dropdown.Root>}
                                            </div>
                                            {rowSaving && <p className="mt-1 text-xs text-tertiary">Guardando...</p>}
                                        </td>
                                    </motion.tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={tableColSpan} className="px-4 py-10 text-center text-sm text-tertiary">{emptyText}</td>
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
                                    type="text"
                                    inputMode="decimal"
                                    value={manualCommission?.value ?? ""}
                                    placeholder={manualCommission?.type === "especial" ? "0%" : "S/ 0.00"}
                                    onChange={(value) => {
                                        if (isRecurringInputValue(value)) {
                                            setManualCommission((current) => (current ? { ...current, value } : current));
                                        }
                                    }}
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
            <ModalOverlay isOpen={recurringCommission !== null} onOpenChange={(open) => !open && setRecurringCommission(null)}>
                <Modal className="max-w-sm">
                    <Dialog>
                        <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                            <h2 className="text-lg font-semibold text-primary">
                                {recurringCommission?.type === "especial" ? "Com. Especial Recurrente" : "Com. Extra Recurrente"}
                            </h2>
                            <p className="mt-1 text-sm text-tertiary">
                                Esta configuracion se aplicara a futuras operaciones de este cliente y tambien recalculara la operacion actual.
                            </p>
                            <p className="mt-3 text-sm text-secondary">
                                Cliente: <strong>{recurringCommission?.row.nombre_cliente || recurringCommission?.row.dni_cliente || "-"}</strong>
                            </p>
                            <div className="mt-5">
                                <Input
                                    size="sm"
                                    label={recurringCommission?.type === "especial" ? "Porcentaje recurrente" : "Monto extra recurrente"}
                                    type="text"
                                    inputMode="decimal"
                                    value={recurringCommission?.value ?? ""}
                                    placeholder={recurringCommission?.type === "especial" ? "0%" : "S/ 0.00"}
                                    onChange={(value) => {
                                        if (isRecurringInputValue(value)) {
                                            setRecurringCommission((current) => (current ? { ...current, value } : current));
                                        }
                                    }}
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button color="secondary" isDisabled={recurringCommission ? savingIds.includes(recurringCommission.row.id) : false} onClick={() => setRecurringCommission(null)}>
                                    Cancelar
                                </Button>
                                <Button isLoading={recurringCommission ? savingIds.includes(recurringCommission.row.id) : false} onClick={() => void handleRecurringCommissionSave()}>
                                    Guardar
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
            <ModalOverlay isOpen={pdMatchRow !== null} onOpenChange={(open) => !open && closePagoDeudaMatchModal()}>
                <Modal className="max-w-2xl">
                    <Dialog>
                        <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Match Pago Deuda</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    {pdMatchRow ? `Operacion retorno: ${pdMatchRow.dni_cliente ?? "-"} - ${formatMoney(pdMatchRow.monto_deposito_cliente)}` : ""}
                                </p>
                            </div>

                            <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-secondary">
                                {(() => {
                                    const matchList = pdMatchRow ? (pagoDeudaMatches[pdMatchRow.id] ?? []) : [];
                                    if (!matchList.length) {
                                        return <p className="px-3 py-8 text-center text-sm text-tertiary">Sin candidatos compatibles.</p>;
                                    }

                                    return (
                                        <table className="min-w-full table-fixed text-sm">
                                            <thead className="bg-secondary">
                                                <tr>
                                                    <th className="w-10 px-3 py-2 text-left text-xs font-semibold text-tertiary">Sel.</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">DNI</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Banco</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Monto</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-tertiary">Devuelto</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary bg-primary">
                                                {matchList.map((match) => (
                                                    <tr
                                                        key={match.id}
                                                        className="cursor-pointer transition hover:bg-secondary_hover"
                                                        onClick={() => setPdSelectedMatchId(match.id)}
                                                    >
                                                        <td className="px-3 py-3 align-middle">
                                                            <Checkbox
                                                                aria-label={`Seleccionar Pago Deuda ${match.id}`}
                                                                isSelected={pdSelectedMatchId === match.id}
                                                                onChange={() => setPdSelectedMatchId(match.id)}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-3 align-middle font-medium text-primary">{match.dni_cliente ?? "-"}</td>
                                                        <td className="px-3 py-3 align-middle text-secondary">{match.nombre_banco_cliente ?? "-"}</td>
                                                        <td className="px-3 py-3 align-middle font-semibold tabular-nums text-primary">{formatMoney(match.monto_deposito_cliente)}</td>
                                                        <td className="px-3 py-3 align-middle tabular-nums text-secondary">{formatMoney(match.monto_devuelto ?? 0)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    );
                                })()}
                            </div>

                            <div className="mt-5 flex justify-end gap-2">
                                <Button color="secondary" onClick={closePagoDeudaMatchModal}>
                                    Cancelar
                                </Button>
                                <Button
                                    isDisabled={!pdSelectedMatchId || (pdMatchRow ? savingIds.includes(pdMatchRow.id) : false)}
                                    isLoading={pdMatchRow ? savingIds.includes(pdMatchRow.id) : false}
                                    onClick={() => void handleSavePagoDeudaMatch()}
                                >
                                    Guardar
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
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
                                <Button onClick={() => void handleDniEditSave()}>Guardar</Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
            <OperacionConfirmModal
                confirmLabel={confirmCopy?.confirmLabel}
                description={confirmCopy?.description ?? ""}
                isLoading={confirmAction ? savingIds.includes(confirmAction.row.id) : false}
                isOpen={confirmAction !== null}
                onClose={() => setConfirmAction(null)}
                onConfirm={() => void handleConfirmAction()}
                title={confirmCopy?.title ?? "Confirmar accion"}
            />
        </div>
    );
};
