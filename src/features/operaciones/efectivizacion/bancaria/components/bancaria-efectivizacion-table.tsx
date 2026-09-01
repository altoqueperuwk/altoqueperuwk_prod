import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Coins01, Copy01, CreditCardCheck, Edit03, Percent01, RefreshCcw02, Send01, Trash01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
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
    getSelectValue,
} from "@/features/operaciones/efectivizacion/shared/components/compact-table-primitives";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import { CopyableDni } from "@/features/operaciones/efectivizacion/shared/components/copyable-dni";
import type { OperacionProceso, OperacionRutaBancaria, RutaOperacionCaja } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { formatInteger, formatMoney } from "@/features/operaciones/efectivizacion/shared/utils/money";
import { isInteractiveElement } from "@/features/operaciones/efectivizacion/shared/utils/row-selection";
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
    isRefreshing?: boolean;
    mode?: "efectivizacion" | "unificado" | "derivaciones" | "pos" | "eliminados";
    flow?: "Efectivizacion" | "POS" | "Derivado";
    presentation?: "operational" | "plain";
    readOnly?: boolean;
    onMetricsChanged: () => void;
    onRefresh: () => void;
    onRowUpdated: (row: OperacionProceso) => void;
    onDeleteOperation?: (row: OperacionProceso) => void;
    onDeriveRow?: (row: OperacionProceso) => void;
    onPayRow?: (row: OperacionProceso) => void;
    isPayingRow?: (row: OperacionProceso) => boolean;
    onRestoreOperation?: (row: OperacionProceso) => void;
    onToggleRow?: (id: number) => void;
    onToggleFueraHorario?: (row: OperacionProceso, value: boolean) => void;
    hideFueraHorario?: boolean;
    hidePagination?: boolean;
    matchRefreshKey?: string | number;
    ruta: OperacionRutaBancaria;
    showBanca?: boolean;
    selectedIds?: number[];
    user: UserRef;
}

const isPagado = (row: OperacionProceso) => (row.nombre_estado ?? "").toUpperCase() === "PAGADO";
const isDerivedOperation = (row: OperacionProceso) =>
    row.flag_derivado === true || String(row.flag_derivado).toLowerCase() === "true";
const getPagoDeudaMatchFingerprint = (row: OperacionProceso) => JSON.stringify([
    row.id,
    row.dni_cliente,
    row.monto_deposito_cliente,
    row.fecha_deposito_cliente,
    row.nombre_estado,
    row.tipo_flujo_pago_deuda,
    row.id_caja_cierre,
]);
const isRecurringInputValue = (value: string) => {
    const trimmed = value.trim();
    return trimmed === "" || /^null$/i.test(trimmed) || /^(?:\d+(?:[.,]\d*)?|\d*[.,]\d+)$/.test(trimmed);
};
const isFrozenOriginOperation = (
    row: OperacionProceso,
    mode: "efectivizacion" | "unificado" | "derivaciones" | "pos" | "eliminados",
    activeCompanyId: number | null,
    activeAccountId: number | null,
) => {
    if (
        (mode !== "efectivizacion" && mode !== "unificado") ||
        row.flag_derivado !== true ||
        activeCompanyId == null ||
        row.id_empresa_salida_origen == null
    ) {
        return false;
    }

    if (Number(row.id_empresa_salida_origen) !== Number(activeCompanyId)) {
        return false;
    }

    return (
        activeAccountId == null ||
        row.id_empresa_cuenta_salida_origen == null ||
        Number(row.id_empresa_cuenta_salida_origen) === Number(activeAccountId)
    );
};
const isDerivedReceiverOperation = (
    row: OperacionProceso,
    activeCompanyId: number | null,
    activeAccountId: number | null,
) => {
    if (
        row.flag_derivado !== true ||
        activeCompanyId == null ||
        row.id_empresa_salida == null ||
        Number(row.id_empresa_salida) !== Number(activeCompanyId)
    ) {
        return false;
    }

    const matchesDestinationAccount = activeAccountId == null
        ? true
        : row.id_empresa_cuenta_salida == null || Number(row.id_empresa_cuenta_salida) === Number(activeAccountId);
    if (!matchesDestinationAccount) return false;

    const matchesOrigin = Number(row.id_empresa_salida_origen) === Number(activeCompanyId)
        && (
            activeAccountId != null
                ? row.id_empresa_cuenta_salida_origen == null || Number(row.id_empresa_cuenta_salida_origen) === Number(activeAccountId)
                : Number(row.id_empresa_cuenta_salida) === Number(row.id_empresa_cuenta_salida_origen)
        );

    return !matchesOrigin;
};
const getDerivationDisplay = (
    row: OperacionProceso,
    mode: "efectivizacion" | "unificado" | "derivaciones" | "pos" | "eliminados",
    activeCompanyId: number | null,
    activeAccountId: number | null,
) => {
    if (row.flag_derivado !== true) return null;

    if (isFrozenOriginOperation(row, mode, activeCompanyId, activeAccountId)) {
        return {
            empresa: row.nombre_empresa_salida,
            cuenta: row.nombre_banco_empresa_cuenta_salida,
        };
    }

    if (isDerivedReceiverOperation(row, activeCompanyId, activeAccountId)) {
        return {
            empresa: row.nombre_empresa_salida_origen,
            cuenta: row.nombre_banco_empresa_cuenta_salida_origen,
        };
    }

    return null;
};
const isFrozenPaidOperation = (
    row: OperacionProceso,
    mode: "efectivizacion" | "unificado" | "derivaciones" | "pos" | "eliminados",
) => (mode === "efectivizacion" || mode === "unificado") && isPagado(row);
const isPostCloseReopenableOperation = (row: OperacionProceso, ruta: OperacionRutaBancaria) => {
    const operationRoute = String(row.ruta_destino ?? row.ruta_origen ?? ruta).trim().toLowerCase();
    return (
        isPagado(row) &&
        row.id_caja_cierre != null &&
        (operationRoute === "banbif" || operationRoute === "scotiabank" || operationRoute === "interbank") &&
        (row.tipo_servicio ?? "").trim().toUpperCase() === "EFECTIVIZACION"
    );
};
const isFrozenTableOperation = (
    row: OperacionProceso,
    mode: "efectivizacion" | "unificado" | "derivaciones" | "pos" | "eliminados",
    activeCompanyId: number | null,
    activeAccountId: number | null,
) =>
    isFrozenOriginOperation(row, mode, activeCompanyId, activeAccountId) ||
    isFrozenPaidOperation(row, mode);
const isDeletable = (row: OperacionProceso) => {
    const estado = String(row.nombre_estado ?? "").trim().toUpperCase();
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

const getColumnHeaders = (showFlow: boolean, showBanca: boolean, showDerivo: boolean, showFueraHorario: boolean, showCuentaCliente: boolean) => [
    ...(showFlow ? [{ label: "Flujo" }] : []),
    ...(showBanca ? [{ label: "Banca" }] : []),
    { label: "Facturacion" },
    ...(showDerivo ? [{ label: "Derivo" }] : []),
    { label: "Cod. Op." },
    { label: "DNI" },
    { label: "Comunidad" },
    ...(showCuentaCliente ? [{ label: "Cuenta Cliente", className: "w-32" }] : []),
    { label: "Monto" },
    { label: "Comision" },
    { label: "Transferencia" },
    ...(showFueraHorario ? [{ label: "Fuera de Horario" }] : []),
    { label: "Estado" },
    { label: "Hora", className: "w-24" },
    { label: "Acciones", className: "w-14 text-center" },
];

const flowBadgeColors: Record<string, "brand" | "blue" | "orange" | "gray"> = {
    Efectivizacion: "brand",
    POS: "blue",
    Derivado: "orange",
};

export const BancariaEfectivizacionTable = ({
    activeAccountId = null,
    activeCompanyId,
    companies,
    data,
    emptyText,
    estadoPagado,
    estadoPendiente,
    isLoading = false,
    isRefreshing = false,
    mode = "efectivizacion",
    flow,
    presentation = "operational",
    readOnly = false,
    onMetricsChanged,
    onRefresh,
    onRowUpdated,
    onDeleteOperation,
    onDeriveRow,
    onPayRow,
    isPayingRow,
    onRestoreOperation,
    onToggleRow,
    onToggleFueraHorario,
    hideFueraHorario = false,
    hidePagination = false,
    matchRefreshKey = 0,
    ruta,
    showBanca = false,
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
    const [pagoDeudaMatchFlags, setPagoDeudaMatchFlags] = useState<Record<number, boolean>>({});
    const [pagoDeudaMatches, setPagoDeudaMatches] = useState<Record<number, OperacionProceso[]>>({});
    const [pagoDeudaMatchLoadingId, setPagoDeudaMatchLoadingId] = useState<number | null>(null);
    const [pagoDeudaMatchError, setPagoDeudaMatchError] = useState<string | null>(null);
    const pagoDeudaMatchFlagCache = useRef(new Map<number, { fingerprint: string; hasMatch: boolean }>());
    const pagoDeudaMatchCache = useRef(new Map<number, { fingerprint: string; matches: OperacionProceso[] }>());
    const pagoDeudaMatchRequestId = useRef(0);
    const lastMatchRefreshKey = useRef<string | number>(matchRefreshKey);
    const [pdMatchRow, setPdMatchRow] = useState<OperacionProceso | null>(null);
    const [pdSelectedMatchId, setPdSelectedMatchId] = useState<number | null>(null);
    const [interbankTransfer, setInterbankTransfer] = useState<{ row: OperacionProceso; value: string } | null>(null);
    const [dniEdit, setDniEdit] = useState<{ row: OperacionProceso; value: string } | null>(null);
    const [dniDrafts, setDniDrafts] = useState<Record<number, string>>({});
    const [confirmAction, setConfirmAction] = useState<{ row: OperacionProceso; type: ConfirmActionType } | null>(null);
    const hasSelection = Boolean(onToggleRow) && !readOnly;
    const isPlain = presentation === "plain";
    const showPagination = !hidePagination && mode !== "unificado";
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const savingIdSet = useMemo(() => new Set(savingIds), [savingIds]);

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

    const visibleRows = useMemo(
        () => (showPagination ? rows.slice((page - 1) * pageSize, page * pageSize) : rows),
        [page, pageSize, rows, showPagination],
    );
    const visibleIds = visibleRows
        .filter((row) => !isFrozenOriginOperation(row, mode, activeCompanyId, activeAccountId))
        .map((row) => row.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIdSet.has(id));
    const showTipoDeposito = tipoDepositoVisibleRoutes.includes(ruta);
    const isUnificado = mode === "unificado";
    const isDerivaciones = mode === "derivaciones";
    const isEliminados = mode === "eliminados";
    const showDerivo = mode === "efectivizacion" || isDerivaciones || isUnificado;
    const showCuentaCliente = !isUnificado;
    const showFueraHorario = false;
    const getRowFlow = (row: OperacionProceso) => {
        if (isUnificado) {
            if (row.flag_derivado) return "Derivado";
            if (String(row.ruta_origen ?? "").toLowerCase() === "pos") return "POS";
            return "Efectivizacion";
        }
        return flow ?? (isDerivaciones ? "Derivado" : "Efectivizacion");
    };
    const columnHeaders = useMemo(
        () => getColumnHeaders(isUnificado, showBanca, showDerivo, showFueraHorario, showCuentaCliente).filter((column) => !readOnly || column.label !== "Acciones"),
        [isUnificado, readOnly, showBanca, showCuentaCliente, showDerivo, showFueraHorario],
    );
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
        const shouldInvalidate = lastMatchRefreshKey.current !== matchRefreshKey;
        if (shouldInvalidate) {
            pagoDeudaMatchFlagCache.current.clear();
            pagoDeudaMatchCache.current.clear();
            setPagoDeudaMatchFlags({});
            setPagoDeudaMatches({});
            lastMatchRefreshKey.current = matchRefreshKey;
        }

        if (
            readOnly ||
            (mode !== "efectivizacion" && mode !== "unificado") ||
            ruta === "safetypay" ||
            !rows.length
        ) {
            setPagoDeudaMatchFlags({});
            setPagoDeudaMatches({});
            return;
        }

        let ignore = false;
        const matchRows = rows.filter((row) =>
            mode !== "unificado" || (!row.flag_derivado && String(row.ruta_origen ?? "").toLowerCase() !== "pos"),
        );

        if (!matchRows.length) {
            setPagoDeudaMatchFlags({});
            setPagoDeudaMatches({});
            return;
        }

        const flagsById: Record<number, boolean> = {};
        const fingerprintById = new Map<number, string>();
        const candidateRows: OperacionProceso[] = [];

        for (const row of matchRows) {
            const fingerprint = getPagoDeudaMatchFingerprint(row);
            fingerprintById.set(row.id, fingerprint);

            const cachedDetails = pagoDeudaMatchCache.current.get(row.id);
            const cachedFlag = pagoDeudaMatchFlagCache.current.get(row.id);
            if (cachedFlag?.fingerprint === fingerprint) {
                flagsById[row.id] = cachedFlag.hasMatch;
            } else if (cachedDetails?.fingerprint === fingerprint) {
                const hasMatch = cachedDetails.matches.length > 0;
                flagsById[row.id] = hasMatch;
                pagoDeudaMatchFlagCache.current.set(row.id, { fingerprint, hasMatch });
            } else {
                flagsById[row.id] = false;
                if (!isPagado(row) && !row.tipo_flujo_pago_deuda) {
                    candidateRows.push(row);
                }
            }
        }

        const visibleMatchIds = new Set(matchRows.map((row) => row.id));
        for (const operationId of pagoDeudaMatchFlagCache.current.keys()) {
            if (!visibleMatchIds.has(operationId)) pagoDeudaMatchFlagCache.current.delete(operationId);
        }
        for (const operationId of pagoDeudaMatchCache.current.keys()) {
            if (!visibleMatchIds.has(operationId)) pagoDeudaMatchCache.current.delete(operationId);
        }

        setPagoDeudaMatchFlags(flagsById);

        if (!candidateRows.length) {
            return () => {
                ignore = true;
            };
        }

        pagoDeudaService.getMatchFlagsBatch({
            p_ids_operaciones: candidateRows.map((row) => row.id),
        })
            .then((entries) => {
                if (ignore) return;

                for (const entry of entries ?? []) {
                    const operationId = Number(entry.id_operacion_efectivizacion);
                    if (!Number.isFinite(operationId)) continue;
                    const hasMatch = entry.tiene_match === true;
                    const fingerprint = fingerprintById.get(operationId);
                    if (!fingerprint) continue;
                    pagoDeudaMatchFlagCache.current.set(operationId, { fingerprint, hasMatch });
                    flagsById[operationId] = hasMatch;
                }

                for (const row of candidateRows) {
                    const fingerprint = fingerprintById.get(row.id);
                    if (fingerprint && !pagoDeudaMatchFlagCache.current.has(row.id)) {
                        pagoDeudaMatchFlagCache.current.set(row.id, { fingerprint, hasMatch: false });
                    }
                }

                setPagoDeudaMatchFlags(flagsById);
            })
            .catch(() => {
                if (!ignore) setPagoDeudaMatchFlags(flagsById);
            });

        return () => {
            ignore = true;
        };
    }, [matchRefreshKey, mode, readOnly, rows, ruta]);

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
        if (mode !== "efectivizacion" || !visibleRows.length) {
            setRecurringByOperation({});
            return;
        }

        let ignore = false;
        Promise.all(
            visibleRows.map(async (row) => {
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
    }, [mode, visibleRows]);

    const commissionActionState = (row: OperacionProceso) => {
        const recurring = recurringByOperation[row.id];
        const rule = findRule(row);
        const hasOperationSpecial = recurring && recurring.especial === null && rule?.comision_servicio != null
            && row.comision_servicio != null
            && Math.abs(Number(row.comision_servicio) - Number(rule.comision_servicio)) > 0.000001;
        const hasOperationExtra = recurring && recurring.extra === null && toNumber(row.comision_monto_extra_servicio) > 0;

        return {
            specialDisabled: Boolean(recurring && recurring.especial !== null) || Boolean(hasOperationSpecial),
            specialRecurringDisabled: Boolean(hasOperationSpecial),
            extraDisabled: Boolean(recurring && recurring.extra !== null) || Boolean(hasOperationExtra),
            extraRecurringDisabled: Boolean(hasOperationExtra),
        };
    };

    const findRule = (row: OperacionProceso) => reglas.find((regla) =>
        regla.id_codigo_servicio === row.id_codigo_servicio &&
        (!regla.id_banco || regla.id_banco === row.id_banco_empresa_cuenta_ingreso) &&
        (!regla.id_comunidad || regla.id_comunidad === row.id_comunidad) &&
        (!regla.tipo_deposito || regla.tipo_deposito === row.nombre_tipo_deposito),
    ) ?? null;

    const persistRow = async (draft: OperacionProceso, patch: Record<string, unknown>, recalculate = false): Promise<OperacionProceso | null> => {
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
            return saved;
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "No se pudo guardar la operacion.");
            return null;
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

    const readOnlyIngreso = (row: OperacionProceso) =>
        (isDerivaciones && !isDerivedReceiverOperation(row, activeCompanyId, activeAccountId)) ||
        isEliminados ||
        isFrozenTableOperation(row, mode, activeCompanyId, activeAccountId) ||
        savingIdSet.has(row.id);
    const readOnlySalida = (row: OperacionProceso) => isEliminados || isFrozenTableOperation(row, mode, activeCompanyId, activeAccountId) || savingIdSet.has(row.id);

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
        visibleIds.filter((id) => !selectedIdSet.has(id)).forEach((id) => onToggleRow(id));
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
        if (isPagado(row) || savingIdSet.has(row.id)) return;
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
        if (mode !== "efectivizacion" || isPagado(row) || row.flag_retenido || isFrozenTableOperation(row, mode, activeCompanyId, activeAccountId) || savingIdSet.has(row.id)) return;
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
            pagoDeudaMatchFlagCache.current.delete(row.id);
            pagoDeudaMatchCache.current.delete(row.id);
            setPagoDeudaMatchFlags((current) => ({ ...current, [row.id]: false }));
            setPagoDeudaMatches((current) => {
                const next = { ...current };
                delete next[row.id];
                return next;
            });
            if (selectedIdSet.has(row.id)) {
                onToggleRow?.(row.id);
            }
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
        pagoDeudaMatchRequestId.current += 1;
        setPdMatchRow(null);
        setPdSelectedMatchId(null);
        setPagoDeudaMatchLoadingId(null);
        setPagoDeudaMatchError(null);
    };

    const loadPagoDeudaMatches = async (row: OperacionProceso) => {
        const requestId = ++pagoDeudaMatchRequestId.current;
        const fingerprint = getPagoDeudaMatchFingerprint(row);
        const cached = pagoDeudaMatchCache.current.get(row.id);

        setPdMatchRow(row);
        setPdSelectedMatchId(null);
        setPagoDeudaMatchError(null);

        if (cached?.fingerprint === fingerprint) return;

        setPagoDeudaMatchLoadingId(row.id);
        try {
            const entries = await pagoDeudaService.getMatchesBatch({
                p_ids_operaciones: [row.id],
            });
            if (requestId !== pagoDeudaMatchRequestId.current) return;
            const entry = (entries ?? []).find((item) => Number(item.id_operacion_efectivizacion) === row.id);
            const matches = Array.isArray(entry?.matches) ? entry.matches : [];

            pagoDeudaMatchCache.current.set(row.id, { fingerprint, matches });
            pagoDeudaMatchFlagCache.current.set(row.id, { fingerprint, hasMatch: matches.length > 0 });
            setPagoDeudaMatches((current) => ({ ...current, [row.id]: matches }));
            setPagoDeudaMatchFlags((current) => ({ ...current, [row.id]: matches.length > 0 }));
        } catch {
            if (requestId === pagoDeudaMatchRequestId.current) {
                setPagoDeudaMatchError("No se pudieron cargar los candidatos.");
            }
        } finally {
            if (requestId === pagoDeudaMatchRequestId.current) {
                setPagoDeudaMatchLoadingId((current) => current === row.id ? null : current);
            }
        }
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

        if ((action === "Reanudar" || action === "Reiniciar") && estadoPendiente) {
            const saved = isPostCloseReopenableOperation(row, ruta)
                ? await operacionesRpcService.patchOperacionReanudarPostCierre(buildOperacionReanudarPayload(row.id, estadoPendiente, user))
                : await operacionesRpcService.patchOperacionReanudar(buildOperacionReanudarPayload(row.id, estadoPendiente, user));
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

        if (action === "TransferenciaInterbancaria") {
            if (isPagado(row) || isFrozenTableOperation(row, mode, activeCompanyId, activeAccountId)) return;
            setInterbankTransfer({
                row,
                value: String(row.id_banco_cliente_transferencia ?? ""),
            });
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

    const handleInterbankTransferSave = async () => {
        if (!interbankTransfer) return;

        const banco = bancos?.find((item) => String(item.id) === interbankTransfer.value);
        if (!banco) {
            addToast("error", "Selecciona el banco de transferencia.");
            return;
        }

        const row = rows.find((item) => item.id === interbankTransfer.row.id) ?? interbankTransfer.row;
        const saved = await persistRow(
            {
                ...row,
                id_banco_cliente_transferencia: Number(banco.id),
                nombre_banco_cliente_transferencia: String(banco.nombre ?? ""),
            },
            {
                p_id_banco_cliente_transferencia: Number(banco.id),
                p_nombre_banco_cliente_transferencia: String(banco.nombre ?? ""),
            },
            true,
        );

        if (saved) setInterbankTransfer(null);
    };

    return (
        <div className="overflow-hidden border-t border-secondary" aria-busy={isLoading || isRefreshing}>
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
                        ) : visibleRows.length ? (
                            <AnimatePresence initial={false}>
                            {visibleRows.map((row) => {
                                const frozenOrigin = isFrozenOriginOperation(row, mode, activeCompanyId, activeAccountId);
                                const frozenPaid = isFrozenPaidOperation(row, mode);
                                const frozenRow = frozenOrigin || frozenPaid;
                                const rowFlow = getRowFlow(row);
                                const rowIsDerivaciones = isUnificado ? rowFlow === "Derivado" : isDerivaciones;
                                const rowIsPos = isUnificado ? rowFlow === "POS" : mode === "pos";
                                const rowIsEfectivizacion = !isUnificado || rowFlow === "Efectivizacion";
                                const derivedReceiver = isDerivedReceiverOperation(row, activeCompanyId, activeAccountId);
                                const showReceiverQuickActions =
                                    derivedReceiver &&
                                    (mode === "efectivizacion" || mode === "unificado") &&
                                    !isPagado(row);
                                const showStandardQuickActions =
                                    mode === "unificado" &&
                                    rowIsEfectivizacion &&
                                    !isPagado(row);
                                const showDerivedDeleteAction =
                                    isDerivedOperation(row) &&
                                    (mode === "efectivizacion" || mode === "unificado" || mode === "derivaciones") &&
                                    isDeletable(row) &&
                                    !frozenOrigin;
                                const displayOperationDate = rowIsPos ? row.fecha_registro : row.fecha_deposito_cliente;
                                const disabledIngreso =
                                    (isUnificado && rowIsDerivaciones && !isDerivedReceiverOperation(row, activeCompanyId, activeAccountId)) ||
                                    readOnlyIngreso(row);
                                const disabledSalida = readOnlySalida(row);
                                const rowSaving = savingIdSet.has(row.id);
                                const tipoOptions = tipoDepositoOptions(row);
                                const commissionState = commissionActionState(row);
                                const pdDisabled = rowSaving || isPagado(row) || !pagoDeudaMatchFlags[row.id];
                                const displayedTransferAmount = frozenOrigin ? 0 : row.monto_transferencia_cliente;
                                const derivationDisplay = getDerivationDisplay(row, mode, activeCompanyId, activeAccountId);

                                return (
                                    <motion.tr
                                        key={row.id}
                                        className={cx(
                                            isUnificado && "[content-visibility:auto] [contain-intrinsic-size:0_64px]",
                                            frozenPaid && "bg-secondary grayscale opacity-75",
                                            hasSelection && !rowSaving && !frozenRow && "cursor-pointer transition-colors hover:bg-primary_hover",
                                            selectedIdSet.has(row.id) && !frozenRow && "bg-warning-primary/20 hover:bg-warning-primary/30",
                                        )}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        onClick={(event) => !frozenRow && handleRowClick(event, row, rowSaving)}
                                    >
                                        {hasSelection && (
                                            <td className="w-10 px-2 py-2 align-top">
                                                {frozenOrigin ? null : (
                                                <Checkbox
                                                    aria-label={`Seleccionar ${row.id}`}
                                                    data-prevent-row-select
                                                    isSelected={selectedIdSet.has(row.id)}
                                                    isDisabled={rowSaving}
                                                    onChange={() => onToggleRow?.(row.id)}
                                                />
                                                )}
                                            </td>
                                        )}
                                        {isUnificado && <td className="px-2 py-2 align-top">
                                            <CompactBadgeLine color={flowBadgeColors[rowFlow] ?? "gray"}>{rowFlow}</CompactBadgeLine>
                                        </td>}
                                        {showBanca && (
                                            <td className="px-2 py-2 align-top">
                                                {isPlain ? (
                                                    <span className="text-sm text-secondary">{row.nombre_codigo_servicio || "-"}</span>
                                                ) : (
                                                    <CompactBadgeLine color="brand">{row.nombre_codigo_servicio || "-"}</CompactBadgeLine>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{row.tipo_facturacion ?? "Boleta"}</span>
                                            ) : disabledIngreso ? (
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

                                        {showDerivo && (
                                            <td className="px-2 py-2 align-top">
                                                {derivationDisplay ? (
                                                    <div className="flex min-w-36 flex-col items-start gap-1">
                                                        {isPlain ? <>
                                                            <span className="text-sm text-secondary">{derivationDisplay.empresa || "-"}</span>
                                                            <span className="text-sm text-secondary">{derivationDisplay.cuenta || "-"}</span>
                                                        </> : <>
                                                            <CompactBadgeLine color="brand">{derivationDisplay.empresa || "-"}</CompactBadgeLine>
                                                            <CompactBadgeLine>{derivationDisplay.cuenta || "-"}</CompactBadgeLine>
                                                        </>}
                                                    </div>
                                                ) : <span className="text-sm text-secondary">-</span>}
                                            </td>
                                        )}

                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{row.codigo_operacion_deposito_cliente ?? "-"}</span>
                                            ) : <>
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
                                            </>}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{row.dni_cliente || "-"}</span>
                                            ) : row.dni_cliente ? (
                                                <div className="flex items-center gap-1">
                                                    <CopyableDni value={row.dni_cliente} className="text-sm" />
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
                                                    value={dniDrafts[row.id] ?? ""}
                                                    placeholder="DNI"
                                                    className="w-28"
                                                    isDisabled={disabledIngreso}
                                                    onChange={(value) => {
                                                        const dni = value.replace(/\D/g, "").slice(0, 8);
                                                        setDniDrafts((current) => ({ ...current, [row.id]: dni }));
                                                        if (dni.length === 8) void persistRow({ ...row, dni_cliente: dni }, { p_dni_cliente: dni });
                                                    }}
                                                />
                                            )}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{row.nombre_comunidad || "-"}</span>
                                            ) : <CompactInlineSelect
                                                aria-label="Comunidad"
                                                width="w-24"
                                                disabled={disabledIngreso}
                                                value={String(row.id_comunidad ?? "")}
                                                onChange={(event) => void handleCommunityChange(row, event.currentTarget.value)}
                                                options={(comunidades ?? []).map((item) => toOption(item.id, item.nombre))}
                                            />}
                                        </td>
                                        {showCuentaCliente && <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{row.nombre_banco_cliente_transferencia || row.nombre_banco_cliente || "-"}</span>
                                            ) : <CompactInlineSelect
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
                                            />}
                                        </td>}
                                        <td className="px-2 py-2 align-top">
                                            <span className="text-sm tabular-nums text-secondary">{formatMoney(row.monto_deposito_cliente)}</span>
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm tabular-nums text-secondary">{formatMoney(row.resultado_comision_servicio)}</span>
                                            ) : <div className="tabular-nums">
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
                                            </div>}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm tabular-nums text-secondary">{formatMoney(displayedTransferAmount)}</span>
                                            ) : <div className="flex items-center gap-1">
                                                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-concept-transferencia">{formatMoney(displayedTransferAmount)}</span>
                                                <Button
                                                    size="xs"
                                                    color="tertiary"
                                                    iconLeading={Copy01}
                                                    isDisabled={frozenRow}
                                                    onClick={() => void handleAction({ ...row, monto_transferencia_cliente: displayedTransferAmount }, "Copiar")}
                                                />
                                                </div>}
                                        </td>
                                        {showFueraHorario && <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{row.flag_fuera_horario ? "Sí" : "No"}</span>
                                            ) : (
                                                <Toggle
                                                    aria-label={`Fuera de horario ${row.id}`}
                                                    size="sm"
                                                    isSelected={Boolean(row.flag_fuera_horario)}
                                                    isDisabled={readOnly || isPagado(row) || Boolean(row.id_caja_cierre) || rowSaving || !onToggleFueraHorario}
                                                    onChange={(value) => onToggleFueraHorario?.(row, value)}
                                                />
                                            )}
                                        </td>}
                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{isPagado(row) ? "Pagado" : "Pendiente"}</span>
                                            ) : <Button
                                                size="xs"
                                                color={isPagado(row) ? "secondary" : "primary"}
                                                isDisabled={rowSaving || frozenRow || isEliminados || ((!onPayRow || !rowIsPos) && !estadoPagado) || Boolean(isPayingRow?.(row))}
                                                isLoading={Boolean(isPayingRow?.(row))}
                                                onClick={() => {
                                                    if (onPayRow && rowIsPos) {
                                                        void onPayRow(row);
                                                        return;
                                                    }
                                                    if (estadoPagado) void handleEstado(row, String(estadoPagado.id));
                                                }}
                                            >
                                                {isPagado(row) ? "Pagado" : "Pendiente"}
                                            </Button>}
                                        </td>
                                        <td className="px-2 py-2 align-top">
                                            {isPlain ? (
                                                <span className="text-sm text-secondary">{formatDate(displayOperationDate) || "-"}</span>
                                            ) : <CompactCellText primary={formatTime(displayOperationDate) || "-"} secondary={formatDate(displayOperationDate)} />}
                                        </td>
                                                {!readOnly && <td className="px-2 py-2 text-center align-top">
                                            {!frozenOrigin && <div className="flex items-center justify-center gap-1">
                                                {!frozenPaid && (mode === "efectivizacion" || mode === "unificado" || mode === "derivaciones" || mode === "pos") && ruta !== "safetypay" && (
                                                    <ButtonUtility
                                                        size="xs"
                                                        color="tertiary"
                                                        icon={Send01}
                                                        tooltip="Derivar Operacion"
                                                        className={cx(
                                                            "rounded-lg text-fg-quaternary ring-1 ring-transparent ring-inset hover:bg-brand-solid hover:text-primary_on-brand hover:ring-brand-solid",
                                                            isPagado(row) && "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                                                        )}
                                                        isDisabled={frozenRow || rowSaving}
                                                        onClick={() => !frozenRow && onDeriveRow?.(row)}
                                                    />
                                                )}
                                                {(showStandardQuickActions || showReceiverQuickActions) && (
                                                    <>
                                                        <ButtonUtility
                                                            size="xs"
                                                            color="tertiary"
                                                            tooltip="% Comision Especial"
                                                            icon={Percent01}
                                                            className="rounded-lg text-fg-quaternary ring-1 ring-transparent ring-inset hover:bg-brand-solid hover:text-primary_on-brand hover:ring-brand-solid"
                                                            isDisabled={frozenRow || rowSaving || commissionState.specialDisabled}
                                                            onClick={() => void handleAction(row, "ComisionEspecial")}
                                                        />
                                                        <ButtonUtility
                                                            size="xs"
                                                            color="tertiary"
                                                            tooltip="S/ Comision Extra"
                                                            icon={<span className="text-xs font-bold leading-none">S/</span>}
                                                            className="rounded-lg text-fg-quaternary ring-1 ring-transparent ring-inset hover:bg-brand-solid hover:text-primary_on-brand hover:ring-brand-solid"
                                                            isDisabled={frozenRow || rowSaving || commissionState.extraDisabled}
                                                            onClick={() => void handleAction(row, "ComisionExtra")}
                                                        />
                                                        {showReceiverQuickActions && (
                                                            <ButtonUtility
                                                                size="xs"
                                                                color="tertiary"
                                                                tooltip="Transferencia Interbancaria"
                                                                icon={CreditCardCheck}
                                                                className="rounded-lg text-fg-quaternary ring-1 ring-transparent ring-inset hover:bg-brand-solid hover:text-primary_on-brand hover:ring-brand-solid"
                                                                isDisabled={frozenRow || rowSaving}
                                                                onClick={() => void handleAction(row, "TransferenciaInterbancaria")}
                                                            />
                                                        )}
                                                    </>
                                                )}
                                                {showDerivedDeleteAction && (
                                                    <ButtonUtility
                                                        size="xs"
                                                        color="tertiary"
                                                        tooltip="Eliminar Operacion"
                                                        icon={Trash01}
                                                        className="rounded-lg text-fg-quaternary ring-1 ring-transparent ring-inset hover:bg-brand-solid hover:text-primary_on-brand hover:ring-brand-solid"
                                                        isDisabled={frozenRow || rowSaving}
                                                        onClick={() => void handleAction(row, "EliminarOperacion")}
                                                    />
                                                )}
                                            {!frozenRow && rowIsEfectivizacion && (mode === "efectivizacion" || mode === "unificado") && ruta !== "safetypay" && Boolean(pagoDeudaMatchFlags[row.id]) && (
                                                    <ButtonUtility
                                                        size="xs"
                                                        color="secondary"
                                                        icon={CreditCardCheck}
                                                        tooltip="Confirmar Pago Deuda"
                                                        className="rounded-lg bg-concept-transferencia text-primary_on-brand ring-1 ring-concept-transferencia ring-inset hover:opacity-90"
                                                        isDisabled={pdDisabled}
                                                        onClick={() => {
                                                            void loadPagoDeudaMatches(row);
                                                        }}
                                                    />
                                                )}
                                            {!frozenOrigin && mode !== "pos" && <Dropdown.Root>
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
                                                                    return (
                                                                        <>
                                                                {isPagado(row) && <Dropdown.Item id="Reiniciar" icon={RefreshCcw02}>Reiniciar</Dropdown.Item>}
                                                                {rowIsEfectivizacion && !isPagado(row) && <Dropdown.Item isDisabled={commissionState.specialDisabled} id="ComisionEspecial" icon={Percent01}>Com. Especial</Dropdown.Item>}
                                                                {rowIsEfectivizacion && !isPagado(row) && <Dropdown.Item isDisabled={commissionState.extraDisabled} id="ComisionExtra" icon={Coins01}>Com. Extra</Dropdown.Item>}
                                                                {!isUnificado && rowIsEfectivizacion && !isPagado(row) && !row.flag_retenido && <Dropdown.Item isDisabled={commissionState.specialRecurringDisabled} id="ComisionEspecialRecurrente" icon={Percent01}>Com. Especial Recurrente</Dropdown.Item>}
                                                                {!isUnificado && rowIsEfectivizacion && !isPagado(row) && !row.flag_retenido && <Dropdown.Item isDisabled={commissionState.extraRecurringDisabled} id="ComisionExtraRecurrente" icon={Coins01}>Com. Extra Recurrente</Dropdown.Item>}
                                                                {rowIsEfectivizacion && !isPagado(row) && <Dropdown.Item id="DirectoCaja" icon={Coins01}>Directo</Dropdown.Item>}
                                                                {isUnificado && rowIsEfectivizacion && !isPagado(row) && <Dropdown.Item id="TransferenciaInterbancaria" icon={CreditCardCheck}>Transferencia Interbancaria</Dropdown.Item>}
                                                                {showDerivedDeleteAction && <Dropdown.Item id="EliminarOperacion" icon={Trash01}>Eliminar Operacion</Dropdown.Item>}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </>
                                                        )}
                                                    </Dropdown.Menu>
                                                </Dropdown.Popover>
                                            </Dropdown.Root>}
                                            </div>}
                                            {rowSaving && <p className="mt-1 text-xs text-tertiary">Guardando...</p>}
                                                </td>}
                                    </motion.tr>
                                );
                            })}
                            </AnimatePresence>
                        ) : (
                            <tr>
                                <td colSpan={tableColSpan} className="px-4 py-10 text-center text-sm text-tertiary">{emptyText}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {showPagination && <div className="flex flex-wrap items-center justify-center gap-3 border-t border-secondary px-4 py-3">
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
            </div>}
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
                                <Button color="secondary" isDisabled={manualCommission ? savingIdSet.has(manualCommission.row.id) : false} onClick={() => setManualCommission(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    isLoading={manualCommission ? savingIdSet.has(manualCommission.row.id) : false}
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
                                <Button color="secondary" isDisabled={recurringCommission ? savingIdSet.has(recurringCommission.row.id) : false} onClick={() => setRecurringCommission(null)}>
                                    Cancelar
                                </Button>
                                <Button isLoading={recurringCommission ? savingIdSet.has(recurringCommission.row.id) : false} onClick={() => void handleRecurringCommissionSave()}>
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
                                    if (pdMatchRow && pagoDeudaMatchLoadingId === pdMatchRow.id) {
                                        return <p className="px-3 py-8 text-center text-sm text-tertiary">Buscando candidatos compatibles...</p>;
                                    }
                                    if (pagoDeudaMatchError) {
                                        return <p className="px-3 py-8 text-center text-sm text-error-primary">{pagoDeudaMatchError}</p>;
                                    }
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
                                    isDisabled={!pdSelectedMatchId || (pdMatchRow ? savingIdSet.has(pdMatchRow.id) : false)}
                                    isLoading={pdMatchRow ? savingIdSet.has(pdMatchRow.id) : false}
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
            <ModalOverlay isOpen={interbankTransfer !== null} onOpenChange={(open) => !open && setInterbankTransfer(null)}>
                <Modal className="max-w-sm">
                    <Dialog>
                        <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Transferencia Interbancaria</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    Selecciona el banco de transferencia para recalcular la operacion.
                                </p>
                            </div>
                            <div className="mt-5">
                                <NativeSelect
                                    label="Banco de transferencia"
                                    size="sm"
                                    value={interbankTransfer?.value ?? ""}
                                    onChange={(event) => setInterbankTransfer((current) => current ? { ...current, value: event.currentTarget.value } : current)}
                                    options={[
                                        { label: "Seleccionar banco", value: "", disabled: true },
                                        ...cuentaClienteOptions,
                                    ]}
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <Button color="secondary" onClick={() => setInterbankTransfer(null)}>Cancelar</Button>
                                <Button
                                    isDisabled={!interbankTransfer?.value || (interbankTransfer ? savingIdSet.has(interbankTransfer.row.id) : false)}
                                    isLoading={interbankTransfer ? savingIdSet.has(interbankTransfer.row.id) : false}
                                    onClick={() => void handleInterbankTransferSave()}
                                >
                                    Guardar
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
            <OperacionConfirmModal
                confirmLabel={confirmCopy?.confirmLabel}
                description={confirmCopy?.description ?? ""}
                isLoading={confirmAction ? savingIdSet.has(confirmAction.row.id) : false}
                isOpen={confirmAction !== null}
                onClose={() => setConfirmAction(null)}
                onConfirm={() => void handleConfirmAction()}
                title={confirmCopy?.title ?? "Confirmar accion"}
            />
        </div>
    );
};
