import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edit03, Plus, RefreshCcw02, Save01, XClose } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useAuth } from "@/providers/auth-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { cajaOperativaService } from "@/services/caja-operativa.service";
import { empresaCuentaBancariaService } from "@/services/empresa-cuenta-bancaria.service";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { getRutaLabel } from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { cx } from "@/utils/cx";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface OperacionCajasRutaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
    ruta: OperacionRutaBancaria;
    activeCompanyId?: number | null;
    activeCajaId?: number | null;
}

interface CuentaRow {
    id: number;
    id_empresa: number;
    empresa_nombre: string;
    id_banco: number;
    banco_nombre: string;
}

interface CajaDraft {
    key: string;
    id?: number;
    isNew: boolean;
    id_empresa: string;
    id_empresa_cuenta_bancaria: string;
    saldo_inicial: string;
    saldo_actual: string;
    id_estado: string;
    nombre_empresa: string;
    id_banco?: number;
    nombre_banco: string;
}

const ROUTE_BANKS: Record<OperacionRutaBancaria, { ids: number[]; names: string[] }> = {
    bcp: { ids: [2, 12], names: ["BCP", "YAPE"] },
    bbva: { ids: [1, 13], names: ["BBVA", "PLIN"] },
    scotiabank: { ids: [3], names: ["SCOTIABANK"] },
    banbif: { ids: [4], names: ["BANBIF"] },
    interbank: { ids: [5, 13], names: ["INTERBANK", "PLIN"] },
    safetypay: { ids: [5, 13], names: ["INTERBANK", "PLIN"] },
};

const normalize = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();

const parseMoney = (value: string) => {
    const raw = String(value ?? "").trim().replace(/\s/g, "").replace(/^S\/?/i, "");
    if (!raw) return null;

    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    let normalized = raw;

    if (lastComma >= 0 && lastDot >= 0) {
        normalized = lastComma > lastDot
            ? raw.replace(/\./g, "").replace(",", ".")
            : raw.replace(/,/g, "");
    } else if (lastComma >= 0) {
        const decimalPart = raw.slice(lastComma + 1);
        normalized = decimalPart.length === 2
            ? `${raw.slice(0, lastComma).replace(/,/g, "")}.${decimalPart}`
            : raw.replace(/,/g, "");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatMoney = (value: number) =>
    new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const buildCuenta = (row: Record<string, unknown>): CuentaRow => ({
    id: Number(row.id),
    id_empresa: Number(row.id_empresa),
    empresa_nombre: String(row.empresa_nombre ?? row.nombre_empresa ?? ""),
    id_banco: Number(row.id_banco),
    banco_nombre: String(row.banco_nombre ?? row.nombre_banco ?? ""),
});

const buildCajaDraft = (row: Record<string, unknown>): CajaDraft => ({
    key: String(row.id),
    id: Number(row.id),
    isNew: false,
    id_empresa: String(row.id_empresa ?? ""),
    id_empresa_cuenta_bancaria: String(row.id_empresa_cuenta_bancaria ?? ""),
    saldo_inicial: String(row.saldo_inicial ?? "0"),
    saldo_actual: String(row.saldo_actual ?? "0"),
    id_estado: String(row.id_estado ?? ""),
    nombre_empresa: String(row.nombre_empresa ?? ""),
    id_banco: Number(row.id_banco ?? 0),
    nombre_banco: String(row.nombre_banco ?? ""),
});

const toCajaComparable = (row: CajaDraft) => ({
    saldo_inicial: row.saldo_inicial.trim(),
    saldo_actual: row.saldo_actual.trim(),
    id_estado: row.id_estado,
});

export const OperacionCajasRutaModal = ({ isOpen, onClose, onSaved, ruta, activeCompanyId, activeCajaId }: OperacionCajasRutaModalProps) => {
    const { businessUser } = useAuth();
    const { estados } = useSessionCache();
    const { addToast } = useToast();
    const [cuentas, setCuentas] = useState<CuentaRow[]>([]);
    const [cajas, setCajas] = useState<CajaDraft[]>([]);
    const [cajaSnapshots, setCajaSnapshots] = useState<Record<string, CajaDraft>>({});
    const [selectedCajaId, setSelectedCajaId] = useState<number | null>(null);
    const [editingCajaKey, setEditingCajaKey] = useState<string | null>(null);
    const [isLoadingCajas, setIsLoadingCajas] = useState(false);
    const [savingCajaKey, setSavingCajaKey] = useState<string | null>(null);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [reconciliationCaja, setReconciliationCaja] = useState<CajaDraft | null>(null);
    const [saldoBancarioDraft, setSaldoBancarioDraft] = useState("");
    const [isReconciling, setIsReconciling] = useState(false);
    const [isManagingCajas, setIsManagingCajas] = useState(false);
    const [returnToCajaList, setReturnToCajaList] = useState(false);
    const [isResolvingCaja, setIsResolvingCaja] = useState(true);
    const autoOpenedReconciliation = useRef(false);

    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const rutaLabel = getRutaLabel(ruta);
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const activeEstadoId = useMemo(() => {
        const activo = estadoItems.find((estado) => normalize(estado.label) === "ACTIVO");
        return Number(activo?.id ?? 1);
    }, [estadoItems]);

    const isCompatibleBank = useCallback((idBanco: number, bancoNombre: unknown) => {
        const config = ROUTE_BANKS[ruta];
        const bankName = normalize(bancoNombre);
        return config.ids.includes(Number(idBanco)) || config.names.some((name) => normalize(name) === bankName);
    }, [ruta]);

    const compatibleCuentas = useMemo(
        () => cuentas.filter((cuenta) => isCompatibleBank(cuenta.id_banco, cuenta.banco_nombre)),
        [cuentas, isCompatibleBank],
    );

    const assignedCuentaIds = useMemo(
        () => new Set(cajas.filter((caja) => !caja.isNew).map((caja) => Number(caja.id_empresa_cuenta_bancaria))),
        [cajas],
    );

    const availableCuentaRows = useMemo(
        () => compatibleCuentas.filter((cuenta) => !assignedCuentaIds.has(cuenta.id)),
        [assignedCuentaIds, compatibleCuentas],
    );

    const empresaItems = useMemo(() => {
        const map = new Map<number, string>();
        availableCuentaRows.forEach((cuenta) => map.set(cuenta.id_empresa, cuenta.empresa_nombre));
        return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
    }, [availableCuentaRows]);

    const getCuentaItems = (idEmpresa: string) =>
        availableCuentaRows
            .filter((cuenta) => Number(cuenta.id_empresa) === Number(idEmpresa))
            .map((cuenta) => ({ id: cuenta.id, label: cuenta.banco_nombre }));

    const loadCajas = useCallback(async () => {
        setIsLoadingCajas(true);
        try {
            const [cuentasResult, cajasResult] = await Promise.all([
                empresaCuentaBancariaService.getList(),
                cajaOperativaService.getList(),
            ]);
            const cuentaRows = (cuentasResult ?? [])
                .map(buildCuenta)
                .filter((cuenta) => !activeCompanyId || cuenta.id_empresa === activeCompanyId);
            const cajaRows = (cajasResult ?? [])
                .map(buildCajaDraft)
                .filter((caja) => isCompatibleBank(Number(caja.id_banco ?? 0), caja.nombre_banco))
                .filter((caja) => !activeCompanyId || Number(caja.id_empresa) === activeCompanyId);

            setCuentas(cuentaRows);
            setCajas(cajaRows);
            setCajaSnapshots(Object.fromEntries(cajaRows.map((caja) => [caja.key, { ...caja }])));

            const activeCaja = activeCajaId ? cajaRows.find((caja) => caja.id === activeCajaId) : null;
            if (activeCaja && !autoOpenedReconciliation.current) {
                autoOpenedReconciliation.current = true;
                setIsManagingCajas(false);
                setReturnToCajaList(false);
                setReconciliationCaja(activeCaja);
                setSaldoBancarioDraft("");
            }
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al cargar cajas operativas.");
        } finally {
            setIsLoadingCajas(false);
        }
    }, [activeCajaId, activeCompanyId, addToast, isCompatibleBank]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedCajaId(null);
        setEditingCajaKey(null);
        setReconciliationCaja(null);
        setSaldoBancarioDraft("");
        setIsManagingCajas(false);
        setReturnToCajaList(false);
        autoOpenedReconciliation.current = false;
        setIsResolvingCaja(true);
        void loadCajas().finally(() => setIsResolvingCaja(false));
    }, [isOpen, loadCajas]);

    const updateCaja = (key: string, field: keyof CajaDraft, value: string) => {
        setCajas((current) =>
            current.map((row) => {
                if (row.key !== key) return row;
                const updated = { ...row, [field]: value };
                if (field === "id_empresa") {
                    const firstCuenta = getCuentaItems(value)[0];
                    const cuenta = compatibleCuentas.find((item) => item.id === Number(firstCuenta?.id));
                    updated.id_empresa_cuenta_bancaria = firstCuenta ? String(firstCuenta.id) : "";
                    updated.nombre_empresa = cuenta?.empresa_nombre ?? "";
                    updated.nombre_banco = cuenta?.banco_nombre ?? "";
                }
                if (field === "id_empresa_cuenta_bancaria") {
                    const cuenta = compatibleCuentas.find((item) => item.id === Number(value));
                    updated.nombre_banco = cuenta?.banco_nombre ?? "";
                }
                if (field === "saldo_inicial" && row.isNew) {
                    updated.saldo_actual = value;
                }
                return updated;
            }),
        );
    };

    const addCaja = () => {
        const firstEmpresa = empresaItems[0];
        const firstCuenta = firstEmpresa ? getCuentaItems(String(firstEmpresa.id))[0] : null;
        const cuenta = compatibleCuentas.find((item) => item.id === Number(firstCuenta?.id));
        const row: CajaDraft = {
            key: `new-caja-${Date.now()}`,
            isNew: true,
            id_empresa: firstEmpresa ? String(firstEmpresa.id) : "",
            id_empresa_cuenta_bancaria: firstCuenta ? String(firstCuenta.id) : "",
            saldo_inicial: "",
            saldo_actual: "",
            id_estado: String(activeEstadoId),
            nombre_empresa: cuenta?.empresa_nombre ?? "",
            nombre_banco: cuenta?.banco_nombre ?? "",
        };

        setCajas((current) => [row, ...current]);
        setSelectedCajaId(null);
        setEditingCajaKey(row.key);
    };

    const validateCaja = (row: CajaDraft) => {
        const saldoInicial = parseMoney(row.saldo_inicial);
        const saldoActual = parseMoney(row.saldo_actual || row.saldo_inicial);
        if (!row.id_empresa) return "La empresa es obligatoria.";
        if (!row.id_empresa_cuenta_bancaria) return "La cuenta bancaria es obligatoria.";
        if (saldoInicial === null || saldoInicial < 0) return "El saldo inicial debe ser mayor o igual a cero.";
        if (saldoActual === null || saldoActual < 0) return "El saldo actual debe ser mayor o igual a cero.";
        if (!row.id_estado) return "El estado es obligatorio.";
        return null;
    };

    const isCajaChanged = (row: CajaDraft) => {
        if (row.isNew) return Boolean(row.id_empresa || row.id_empresa_cuenta_bancaria || row.saldo_inicial || row.saldo_actual || row.id_estado);
        const snapshot = cajaSnapshots[row.key];
        if (!snapshot) return false;
        return JSON.stringify(toCajaComparable(row)) !== JSON.stringify(toCajaComparable(snapshot));
    };

    const canEditCajaSaldo = (row: CajaDraft, field: "saldo_inicial" | "saldo_actual") => row.isNew && field === "saldo_inicial";

    const hasPendingChanges = cajas.some(isCajaChanged);

    const cancelCaja = (row: CajaDraft) => {
        if (row.isNew) {
            setCajas((current) => current.filter((item) => item.key !== row.key));
        } else {
            const snapshot = cajaSnapshots[row.key];
            if (snapshot) setCajas((current) => current.map((item) => item.key === row.key ? { ...snapshot } : item));
        }
        setSelectedCajaId(null);
        setEditingCajaKey(null);
    };

    const resetModalState = () => {
        setIsConfirmCloseOpen(false);
        setSelectedCajaId(null);
        setEditingCajaKey(null);
        setReconciliationCaja(null);
        setSaldoBancarioDraft("");
        setIsManagingCajas(false);
        setReturnToCajaList(false);
        autoOpenedReconciliation.current = false;
        setCuentas([]);
        setCajas([]);
        setCajaSnapshots({});
    };

    const discardAndClose = () => {
        resetModalState();
        onClose();
    };

    const openReconciliation = (row: CajaDraft) => {
        if (!row.id) return;
        setReturnToCajaList(true);
        setIsManagingCajas(false);
        setReconciliationCaja(row);
        setSaldoBancarioDraft("");
    };

    const closeReconciliation = () => {
        const shouldReturnToCajaList = returnToCajaList;
        setReconciliationCaja(null);
        setSaldoBancarioDraft("");
        setReturnToCajaList(false);
        if (shouldReturnToCajaList) {
            setIsManagingCajas(true);
        } else {
            resetModalState();
            onClose();
        }
    };

    const manageCajas = () => {
        setReconciliationCaja(null);
        setSaldoBancarioDraft("");
        setReturnToCajaList(true);
        setIsManagingCajas(true);
    };

    const reconcileCaja = async () => {
        if (!reconciliationCaja?.id) return;
        const saldoBanco = parseMoney(saldoBancarioDraft);
        if (saldoBanco === null || saldoBanco < 0) {
            addToast("error", "Ingresa un saldo bancario mayor o igual a cero.");
            return;
        }

        setIsReconciling(true);
        try {
            await cajaOperativaService.reconcileSaldoBancario({
                p_id_caja: reconciliationCaja.id,
                p_saldo_banco: saldoBanco,
                p_id_usuario: userId,
            });
            addToast("success", "Saldo bancario conciliado correctamente.");
            closeReconciliation();
            await loadCajas();
            setSelectedCajaId(reconciliationCaja.id);
            onSaved?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al conciliar el saldo bancario.");
        } finally {
            setIsReconciling(false);
        }
    };

    const reconciliationSaldoActual = reconciliationCaja ? parseMoney(reconciliationCaja.saldo_actual) ?? 0 : 0;
    const reconciliationSaldoBanco = parseMoney(saldoBancarioDraft);
    const reconciliationDifference = reconciliationSaldoBanco === null ? null : reconciliationSaldoBanco - reconciliationSaldoActual;
    const canReconcile = reconciliationSaldoBanco !== null && reconciliationSaldoBanco >= 0;

    const requestClose = () => {
        if (hasPendingChanges) {
            setIsConfirmCloseOpen(true);
            return;
        }
        resetModalState();
        onClose();
    };

    const getItemLabel = (items: Array<{ id: string | number; label: string | undefined }>, id: string | number | null | undefined) =>
        items.find((item) => String(item.id) === String(id))?.label ?? "-";

    const saveCaja = async (row: CajaDraft) => {
        const validation = validateCaja(row);
        if (validation) {
            addToast("error", validation);
            return;
        }

        const saldoInicial = parseMoney(row.saldo_inicial) ?? 0;
        setSavingCajaKey(row.key);
        try {
            const metadataParams = {
                p_id_empresa: Number(row.id_empresa),
                p_id_empresa_cuenta_bancaria: Number(row.id_empresa_cuenta_bancaria),
                p_id_estado: Number(row.id_estado),
                p_id_usuario: userId,
            };

            let savedId = row.id ?? null;
            if (row.id) {
                const snapshot = cajaSnapshots[row.key];
                if (snapshot && parseMoney(snapshot.saldo_inicial) !== saldoInicial) {
                    await cajaOperativaService.patchSaldoInicial({
                        p_id_caja: row.id,
                        p_saldo_inicial: saldoInicial,
                        p_id_usuario: userId,
                    });
                }
                await cajaOperativaService.update(row.id, metadataParams);
                addToast("success", "Caja operativa actualizada correctamente.");
            } else {
                const result = await cajaOperativaService.create({
                    ...metadataParams,
                    p_saldo_inicial: saldoInicial,
                    p_saldo_actual: saldoInicial,
                });
                savedId = result?.id ? Number(result.id) : null;
                await cajaOperativaService.createRuta({
                    p_ruta: ruta,
                    p_id_empresa: Number(row.id_empresa),
                    p_id_empresa_cuenta_bancaria: Number(row.id_empresa_cuenta_bancaria),
                    p_id_estado: Number(row.id_estado),
                    p_id_usuario: userId,
                });
                addToast("success", "Caja operativa creada correctamente.");
            }

            await loadCajas();
            if (savedId) setSelectedCajaId(savedId);
            setEditingCajaKey(null);
            onSaved?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al guardar caja operativa.");
        } finally {
            setSavingCajaKey(null);
        }
    };

    return (
        <>
        {(isManagingCajas || (!reconciliationCaja && !isResolvingCaja)) && (
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && requestClose()}>
            <Modal className="max-w-7xl">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Cajas</h2>
                                <p className="mt-1 text-sm text-tertiary">Crea cajas operativas y asocialas a {rutaLabel}.</p>
                                <p className="mt-1 text-xs text-tertiary">Para conciliar después de cargar operaciones, usa Conciliar e ingresa el saldo que muestra la banca.</p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={XClose} onClick={requestClose} />
                        </div>

                        <div className="mt-5 grid gap-5">
                            <section className="min-w-0">
                                <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
                                    <h3 className="text-sm font-semibold text-primary">Cajas Operativas</h3>
                                    <Button size="sm" color="secondary" iconLeading={Plus} onClick={addCaja}>
                                        Nueva Caja
                                    </Button>
                                </div>
                                <div className="max-h-[318px] overflow-auto rounded-lg border border-secondary">
                                    <table className="w-full min-w-[980px] text-left text-sm">
                                        <thead className="sticky top-0 z-10 border-b border-secondary bg-secondary">
                                            <tr>
                                                <th className="w-10 px-3 py-3" />
                                                <th className="min-w-52 px-3 py-3 text-xs font-medium uppercase text-tertiary">Empresa</th>
                                                <th className="min-w-40 px-3 py-3 text-xs font-medium uppercase text-tertiary">Cuenta Bancaria</th>
                                                <th className="w-36 px-3 py-3 text-xs font-medium uppercase text-tertiary">Saldo Inicial</th>
                                                <th className="w-36 px-3 py-3 text-xs font-medium uppercase text-tertiary">Saldo Actual</th>
                                                <th className="min-w-32 px-3 py-3 text-xs font-medium uppercase text-tertiary">Estado</th>
                                                <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-secondary">
                                            {isLoadingCajas ? (
                                                <tr>
                                                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-tertiary">Cargando cajas...</td>
                                                </tr>
                                            ) : cajas.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-tertiary">No hay cajas operativas para los bancos de esta ruta.</td>
                                                </tr>
                                            ) : cajas.map((row) => {
                                                const isEditing = row.isNew || editingCajaKey === row.key;
                                                const canSave = isEditing && isCajaChanged(row) && !validateCaja(row);
                                                const cuentaItems = getCuentaItems(row.id_empresa);

                                                return (
                                                    <tr key={row.key} className={cx("transition duration-100 ease-linear hover:bg-primary_hover", selectedCajaId === row.id && "bg-secondary", row.isNew && "bg-secondary")}>
                                                        <td className="px-3 py-3">
                                                            <Checkbox
                                                                isDisabled
                                                                isSelected={isEditing}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {isEditing && row.isNew ? (
                                                                <Select
                                                                    size="sm"
                                                                    placeholder="Empresa"
                                                                    items={empresaItems}
                                                                    selectedKey={row.id_empresa ? Number(row.id_empresa) : null}
                                                                    onSelectionChange={(key) => key !== null && updateCaja(row.key, "id_empresa", String(key))}
                                                                >
                                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                                </Select>
                                                            ) : (
                                                                <span className="font-medium text-primary">{row.nombre_empresa || getItemLabel(empresaItems, row.id_empresa)}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {isEditing && row.isNew ? (
                                                                <Select
                                                                    size="sm"
                                                                    placeholder="Cuenta"
                                                                    items={cuentaItems}
                                                                    isDisabled={!row.id_empresa}
                                                                    selectedKey={row.id_empresa_cuenta_bancaria ? Number(row.id_empresa_cuenta_bancaria) : null}
                                                                    onSelectionChange={(key) => key !== null && updateCaja(row.key, "id_empresa_cuenta_bancaria", String(key))}
                                                                >
                                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                                </Select>
                                                            ) : (
                                                                <span className="font-medium text-primary">{row.nombre_banco || getItemLabel(cuentaItems, row.id_empresa_cuenta_bancaria)}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {isEditing && canEditCajaSaldo(row, "saldo_inicial") ? (
                                                                <Input size="sm" type="number" value={row.saldo_inicial} onChange={(value) => updateCaja(row.key, "saldo_inicial", value)} />
                                                            ) : (
                                                                <span className="font-medium text-primary">{row.saldo_inicial || "0"}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {isEditing && canEditCajaSaldo(row, "saldo_actual") ? (
                                                                <Input size="sm" type="number" value={row.saldo_actual} onChange={(value) => updateCaja(row.key, "saldo_actual", value)} />
                                                            ) : (
                                                                <span className="font-medium text-primary">{row.saldo_actual || "0"}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            {isEditing ? (
                                                                <Select
                                                                    size="sm"
                                                                    placeholder="Estado"
                                                                    items={estadoItems}
                                                                    selectedKey={row.id_estado ? Number(row.id_estado) : null}
                                                                    onSelectionChange={(key) => key !== null && updateCaja(row.key, "id_estado", String(key))}
                                                                >
                                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                                </Select>
                                                            ) : (
                                                                <span className="font-medium text-primary">{getItemLabel(estadoItems, row.id_estado)}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-2">
                                                                {row.id ? (
                                                                    <Button
                                                                        size="xs"
                                                                        color="secondary"
                                                                        iconLeading={RefreshCcw02}
                                                                        isDisabled={savingCajaKey === row.key}
                                                                        aria-label="Conciliar saldo con banca"
                                                                        title="Conciliar saldo con banca"
                                                                        onClick={() => openReconciliation(row)}
                                                                    >
                                                                        Conciliar
                                                                    </Button>
                                                                ) : null}
                                                                <Button
                                                                    size="xs"
                                                                    color="tertiary"
                                                                    iconLeading={Edit03}
                                                                    isDisabled={row.isNew || savingCajaKey === row.key}
                                                                    aria-label="Editar caja"
                                                                title="Editar caja"
                                                                onClick={() => {
                                                                        if (row.id) setSelectedCajaId(row.id);
                                                                        setEditingCajaKey(row.key);
                                                                    }}
                                                                />
                                                                <Button
                                                                    size="xs"
                                                                    color={canSave ? "primary" : "tertiary"}
                                                                    iconLeading={Save01}
                                                                    isDisabled={!canSave}
                                                                    isLoading={savingCajaKey === row.key}
                                                                    aria-label="Guardar caja"
                                                                    title="Guardar caja"
                                                                    onClick={() => void saveCaja(row)}
                                                                />
                                                                <Button
                                                                    size="xs"
                                                                    color="tertiary"
                                                                    iconLeading={XClose}
                                                                    isDisabled={!isEditing || savingCajaKey === row.key}
                                                                    aria-label="Cancelar edicion"
                                                                    title="Cancelar edicion"
                                                                    onClick={() => cancelCaja(row)}
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                        </div>

                        <div className="mt-5 flex justify-end">
                            <Button size="sm" color="secondary" onClick={requestClose}>Cerrar</Button>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
        )}
        <ModalOverlay isOpen={Boolean(reconciliationCaja)} onOpenChange={(open) => !open && !isReconciling && closeReconciliation()}>
            <Modal className="max-w-md">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Conciliar saldo con banca</h2>
                                <p className="mt-1 text-sm text-tertiary">
                                    {reconciliationCaja?.nombre_empresa} - {reconciliationCaja?.nombre_banco}
                                </p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={XClose} isDisabled={isReconciling} onClick={closeReconciliation} />
                        </div>

                        <div className="mt-5 grid gap-4">
                            <div className="rounded-lg border border-secondary bg-secondary p-3">
                                <p className="text-xs font-medium uppercase text-tertiary">Saldo actual del sistema</p>
                                <p className="mt-1 text-lg font-semibold tabular-nums text-primary">S/ {formatMoney(reconciliationSaldoActual)}</p>
                            </div>
                            <label className="grid gap-1.5">
                                <span className="text-sm font-medium text-primary">Saldo según banca</span>
                                <Input
                                    autoFocus
                                    type="text"
                                    inputMode="decimal"
                                    value={saldoBancarioDraft}
                                    onChange={setSaldoBancarioDraft}
                                    placeholder="S/ 0.00"
                                />
                            </label>
                            <div className="rounded-lg border border-secondary p-3">
                                <p className="text-xs font-medium uppercase text-tertiary">Resultado</p>
                                <p className="mt-1 text-sm font-semibold tabular-nums text-primary">
                                    {reconciliationDifference === null
                                        ? "Ingresa el saldo de la banca."
                                        : reconciliationDifference === 0
                                            ? "La caja ya coincide con la banca."
                                            : `${reconciliationDifference > 0 ? "Ingreso" : "Salida"} administrativo: S/ ${formatMoney(Math.abs(reconciliationDifference))}`}
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 flex justify-between gap-3">
                            <Button size="sm" color="tertiary" isDisabled={isReconciling} onClick={manageCajas}>Administrar cajas</Button>
                            <div className="flex gap-3">
                            <Button size="sm" color="secondary" isDisabled={isReconciling} onClick={closeReconciliation}>Cancelar</Button>
                            <Button size="sm" color="primary" isDisabled={!canReconcile} isLoading={isReconciling} onClick={() => void reconcileCaja()}>
                                Aplicar conciliación
                            </Button>
                            </div>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
        <OperacionConfirmModal
            cancelLabel="Volver"
            confirmLabel="Salir"
            description="Tienes cambios pendientes."
            isOpen={isConfirmCloseOpen}
            onClose={() => setIsConfirmCloseOpen(false)}
            onConfirm={discardAndClose}
            title="Cambios pendientes"
        />
        </>
    );
};
