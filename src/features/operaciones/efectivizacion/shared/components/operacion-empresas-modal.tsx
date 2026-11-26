import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit03, Plus, Save01, XClose } from "@untitledui/icons";
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
import { empresaService } from "@/services/empresa.service";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import type { OperacionRutaBancaria } from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import { cx } from "@/utils/cx";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface OperacionEmpresasModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
    ruta: OperacionRutaBancaria;
}

interface EmpresaDraft {
    key: string;
    id?: number;
    isNew: boolean;
    nombre: string;
    abreviatura: string;
    flag_transferencia: boolean;
    id_estado: string;
    isImported?: boolean;
}

interface CuentaDraft {
    key: string;
    id?: number;
    isNew: boolean;
    id_banco: string;
    flag_por_sol_comision_banco_ingreso: boolean;
    comision_itf_ingreso_salida: string;
    comision_banco_ingreso: string;
    comision_minimo_banco_ingreso: string;
    comision_igv_banco_ingreso: string;
    comision_transf_banco_salida: string;
    comision_transf_inter_banco_salida: string;
    id_estado: string;
}

const COMISION_TIPO_OPTIONS = [
    { id: "false", label: "Porcentaje" },
    { id: "true", label: "Soles" },
];

const normalize = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();

const routeBankNames: Record<OperacionRutaBancaria, string> = {
    bcp: "BCP",
    bbva: "BBVA",
    scotiabank: "SCOTIABANK",
    banbif: "BANBIF",
    interbank: "INTERBANK",
    safetypay: "INTERBANK",
};

const parseNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
};

const getIdFromRpcResult = (value: unknown): number | null => {
    if (!value || typeof value !== "object") return null;
    const row = Array.isArray(value) ? value[0] : value;
    if (!row || typeof row !== "object" || !("id" in row)) return null;
    const id = Number((row as Record<string, unknown>).id);
    return Number.isFinite(id) ? id : null;
};

const buildEmpresaDraft = (row: Record<string, unknown>): EmpresaDraft => ({
    key: String(row.id),
    id: Number(row.id),
    isNew: false,
    nombre: String(row.nombre ?? ""),
    abreviatura: String(row.abreviatura ?? ""),
    flag_transferencia: Boolean(row.flag_transferencia),
    id_estado: row.id_estado == null ? "" : String(row.id_estado),
    isImported: false,
});

const buildCuentaDraft = (row: Record<string, unknown>): CuentaDraft => ({
    key: String(row.id),
    id: Number(row.id),
    isNew: false,
    id_banco: row.id_banco == null ? "" : String(row.id_banco),
    flag_por_sol_comision_banco_ingreso: Boolean(row.flag_por_sol_comision_banco_ingreso),
    comision_itf_ingreso_salida: row.comision_itf_ingreso_salida == null ? "" : String(row.comision_itf_ingreso_salida),
    comision_banco_ingreso: row.comision_banco_ingreso == null ? "" : String(row.comision_banco_ingreso),
    comision_minimo_banco_ingreso: row.comision_minimo_banco_ingreso == null ? "" : String(row.comision_minimo_banco_ingreso),
    comision_igv_banco_ingreso: row.comision_igv_banco_ingreso == null ? "" : String(row.comision_igv_banco_ingreso),
    comision_transf_banco_salida: row.comision_transf_banco_salida == null ? "" : String(row.comision_transf_banco_salida),
    comision_transf_inter_banco_salida: row.comision_transf_inter_banco_salida == null ? "" : String(row.comision_transf_inter_banco_salida),
    id_estado: row.id_estado == null ? "" : String(row.id_estado),
});

const cloneEmpresaDraft = (row: EmpresaDraft): EmpresaDraft => ({ ...row });
const cloneCuentaDraft = (row: CuentaDraft): CuentaDraft => ({ ...row });

const toEmpresaComparable = (row: EmpresaDraft) => ({
    nombre: row.nombre.trim(),
    abreviatura: row.abreviatura.trim(),
    flag_transferencia: row.flag_transferencia,
    id_estado: row.id_estado,
});

const toCuentaComparable = (row: CuentaDraft) => ({
    id_banco: row.id_banco,
    flag_por_sol_comision_banco_ingreso: row.flag_por_sol_comision_banco_ingreso,
    comision_itf_ingreso_salida: row.comision_itf_ingreso_salida.trim(),
    comision_banco_ingreso: row.comision_banco_ingreso.trim(),
    comision_minimo_banco_ingreso: row.comision_minimo_banco_ingreso.trim(),
    comision_igv_banco_ingreso: row.comision_igv_banco_ingreso.trim(),
    comision_transf_banco_salida: row.comision_transf_banco_salida.trim(),
    comision_transf_inter_banco_salida: row.comision_transf_inter_banco_salida.trim(),
    id_estado: row.id_estado,
});

export const OperacionEmpresasModal = ({ isOpen, onClose, onSaved, ruta }: OperacionEmpresasModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const { bancos, estados } = useSessionCache();
    const [empresas, setEmpresas] = useState<EmpresaDraft[]>([]);
    const [allEmpresas, setAllEmpresas] = useState<EmpresaDraft[]>([]);
    const [cuentas, setCuentas] = useState<CuentaDraft[]>([]);
    const [empresaSnapshots, setEmpresaSnapshots] = useState<Record<string, EmpresaDraft>>({});
    const [cuentaSnapshots, setCuentaSnapshots] = useState<Record<string, CuentaDraft>>({});
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null);
    const [editingEmpresaKey, setEditingEmpresaKey] = useState<string | null>(null);
    const [editingCuentaKey, setEditingCuentaKey] = useState<string | null>(null);
    const [ensureRouteAccount, setEnsureRouteAccount] = useState(false);
    const [isLoadingEmpresas, setIsLoadingEmpresas] = useState(false);
    const [isLoadingCuentas, setIsLoadingCuentas] = useState(false);
    const [savingEmpresaKey, setSavingEmpresaKey] = useState<string | null>(null);
    const [savingCuentaKey, setSavingCuentaKey] = useState<string | null>(null);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [isNewEmpresaInfoOpen, setIsNewEmpresaInfoOpen] = useState(false);

    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const estadoActivo = useMemo(
        () => (estados ?? []).find((estado) => normalize(estado.nombre) === "ACTIVO") ?? null,
        [estados],
    );
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);
    const bancoItems = useMemo(
        () => (bancos ?? [])
            .map((banco) => ({
                id: Number(banco.id),
                label: String(banco.nombre ?? ""),
            })),
        [bancos],
    );

    const activeEstadoId = Number(estadoActivo?.id ?? 1);
    const routeBankId = useMemo(
        () => bancoItems.find((bank) => normalize(bank.label) === routeBankNames[ruta])?.id ?? null,
        [bancoItems, ruta],
    );

    const loadEmpresas = useCallback(async (includeEmpresaId: number | null = null) => {
        setIsLoadingEmpresas(true);
        try {
            const [empresaResult, cuentaResult] = await Promise.all([
                empresaService.getList(),
                empresaCuentaBancariaService.getList({}),
            ]);
            const allRows = (empresaResult ?? []).map(buildEmpresaDraft);
            const visibleEmpresaIds = new Set(
                (cuentaResult ?? [])
                    .filter((row) => Number(row.id_estado) === activeEstadoId && Number(row.id_banco) === routeBankId)
                    .map((row) => Number(row.id_empresa)),
            );
            const rows = allRows.filter((row) => row.id && (visibleEmpresaIds.has(row.id) || row.id === includeEmpresaId));
            setAllEmpresas(allRows);
            setEmpresas(rows);
            setEmpresaSnapshots(Object.fromEntries(rows.map((row) => [row.key, cloneEmpresaDraft(row)])));
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al cargar empresas.");
        } finally {
            setIsLoadingEmpresas(false);
        }
    }, [activeEstadoId, addToast, routeBankId]);

    const loadCuentas = useCallback(async (idEmpresa: number | null) => {
        if (!idEmpresa) {
            setCuentas([]);
            setCuentaSnapshots({});
            return [] as CuentaDraft[];
        }

        setIsLoadingCuentas(true);
        try {
            const result = await empresaCuentaBancariaService.getList({ p_id_empresa: idEmpresa });
            const rows = (result ?? [])
                .filter((row) => Number(row.id_estado) === activeEstadoId && Number(row.id_banco) === routeBankId)
                .map(buildCuentaDraft);
            setCuentas(rows);
            setCuentaSnapshots(Object.fromEntries(rows.map((row) => [row.key, cloneCuentaDraft(row)])));
            return rows;
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al cargar cuentas bancarias.");
            return [];
        } finally {
            setIsLoadingCuentas(false);
        }
    }, [activeEstadoId, addToast, routeBankId]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedEmpresaId(null);
        setEditingEmpresaKey(null);
        setEditingCuentaKey(null);
        setEnsureRouteAccount(false);
        setCuentas([]);
        setCuentaSnapshots({});
        setAllEmpresas([]);
        void loadEmpresas();
    }, [isOpen, loadEmpresas]);

    useEffect(() => {
        if (!isOpen) return;
        setEditingCuentaKey(null);
        const shouldEnsureRouteAccount = ensureRouteAccount;
        setEnsureRouteAccount(false);
        void loadCuentas(selectedEmpresaId).then((rows) => {
            if (shouldEnsureRouteAccount && selectedEmpresaId && rows.length === 0) addCuentaForRoute();
        });
    }, [isOpen, loadCuentas, selectedEmpresaId, ensureRouteAccount]);

    const updateEmpresa = (key: string, field: keyof EmpresaDraft, value: string | boolean) => {
        setEmpresas((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
    };

    const updateCuenta = (key: string, field: keyof CuentaDraft, value: string | boolean) => {
        setCuentas((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
    };

    const addEmpresa = () => {
        const row: EmpresaDraft = {
            key: `new-empresa-${Date.now()}`,
            isNew: true,
            nombre: "",
            abreviatura: "",
            flag_transferencia: false,
            id_estado: String(activeEstadoId),
            isImported: false,
        };
        setEmpresas((current) => [row, ...current]);
        setSelectedEmpresaId(null);
        setEditingEmpresaKey(row.key);
        setEditingCuentaKey(null);
        setCuentas([]);
        setCuentaSnapshots({});
    };

    const buildRouteCuentaDraft = (): CuentaDraft => ({
        key: `new-cuenta-${Date.now()}`,
        isNew: true,
        id_banco: routeBankId ? String(routeBankId) : "",
        flag_por_sol_comision_banco_ingreso: false,
        comision_itf_ingreso_salida: "0.005",
        comision_banco_ingreso: "",
        comision_minimo_banco_ingreso: "",
        comision_igv_banco_ingreso: "",
        comision_transf_banco_salida: "0",
        comision_transf_inter_banco_salida: "",
        id_estado: String(activeEstadoId),
    });

    const addCuentaForRoute = () => {
        const row = buildRouteCuentaDraft();
        setCuentas((current) => [row, ...current]);
        setEditingCuentaKey(row.key);
    };

    const addEmpresaExistente = () => {
        const visibleIds = new Set(empresas.map((row) => row.id).filter((id): id is number => Boolean(id)));
        const available = allEmpresas.find((row) => row.id && !visibleIds.has(row.id));
        if (!available) {
            addToast("info", "No hay empresas adicionales disponibles para esta ruta.");
            return;
        }

        const row: EmpresaDraft = {
            ...cloneEmpresaDraft(available),
            key: `imported-empresa-${Date.now()}`,
            id: undefined,
            isNew: true,
            isImported: true,
            nombre: "",
            abreviatura: "",
            id_estado: String(activeEstadoId),
        };
        setEmpresas((current) => [row, ...current]);
        setEditingEmpresaKey(row.key);
        setSelectedEmpresaId(null);
        setEnsureRouteAccount(false);
        setCuentas([]);
        setCuentaSnapshots({});
    };

    const selectEmpresaExistente = async (key: string, id: number) => {
        const source = allEmpresas.find((row) => row.id === id);
        if (!source) return;

        setEmpresas((current) => current.map((row) => row.key === key ? {
            ...row,
            id,
            nombre: source.nombre,
            abreviatura: source.abreviatura,
            flag_transferencia: source.flag_transferencia,
            id_estado: source.id_estado,
        } : row));
        setSelectedEmpresaId(id);
        setEditingEmpresaKey(key);
        setEnsureRouteAccount(true);
    };

    const addCuenta = () => {
        if (!selectedEmpresaId) {
            addToast("error", "Selecciona o guarda una empresa antes de crear cuentas.");
            return;
        }

        if (!routeBankId) {
            addToast("error", `No se encontró el banco configurado para ${ruta}.`);
            return;
        }
        if (cuentas.some((cuenta) => Number(cuenta.id_banco) === routeBankId && !cuenta.isNew)) {
            addToast("info", "La empresa ya tiene una cuenta activa para el banco de esta ruta.");
            return;
        }
        addCuentaForRoute();
    };

    const validateEmpresa = (row: EmpresaDraft) => {
        if (!row.nombre.trim()) return "El nombre de la empresa es obligatorio.";
        if (!row.id_estado) return "El estado de la empresa es obligatorio.";
        return null;
    };

    const validateCuenta = (row: CuentaDraft) => {
        if (!selectedEmpresaId) return "Selecciona una empresa antes de guardar cuentas.";
        if (!row.id_banco) return "El banco es obligatorio.";
        if (row.isNew && routeBankId !== null && Number(row.id_banco) !== routeBankId) {
            return "La nueva cuenta debe usar el banco de la ruta actual.";
        }
        if (!row.id_estado) return "El estado de la cuenta es obligatorio.";

        const duplicated = cuentas.some((item) => (
            item.key !== row.key &&
            Number(item.id_banco) === Number(row.id_banco)
        ));
        if (duplicated) return "La empresa ya tiene una cuenta configurada para ese banco.";

        return null;
    };

    const isEmpresaChanged = (row: EmpresaDraft) => {
        if (row.isNew) return Boolean(row.nombre.trim() || row.abreviatura.trim() || row.flag_transferencia || row.id_estado);
        const snapshot = empresaSnapshots[row.key];
        if (!snapshot) return false;
        return JSON.stringify(toEmpresaComparable(row)) !== JSON.stringify(toEmpresaComparable(snapshot));
    };

    const isCuentaChanged = (row: CuentaDraft) => {
        if (row.isNew) {
            return Boolean(
                row.id_banco ||
                row.comision_itf_ingreso_salida.trim() ||
                row.comision_banco_ingreso.trim() ||
                row.comision_minimo_banco_ingreso.trim() ||
                row.comision_igv_banco_ingreso.trim() ||
                row.comision_transf_banco_salida.trim() ||
                row.comision_transf_inter_banco_salida.trim() ||
                row.id_estado,
            );
        }
        const snapshot = cuentaSnapshots[row.key];
        if (!snapshot) return false;
        return JSON.stringify(toCuentaComparable(row)) !== JSON.stringify(toCuentaComparable(snapshot));
    };

    const hasPendingChanges = empresas.some(isEmpresaChanged) || cuentas.some(isCuentaChanged);

    const cancelEmpresa = (row: EmpresaDraft) => {
        if (row.isNew) {
            setEmpresas((current) => current.filter((item) => item.key !== row.key));
        } else {
            const snapshot = empresaSnapshots[row.key];
            if (snapshot) setEmpresas((current) => current.map((item) => item.key === row.key ? cloneEmpresaDraft(snapshot) : item));
        }
        setEditingEmpresaKey(null);
        setSelectedEmpresaId(null);
        setCuentas([]);
        setCuentaSnapshots({});
    };

    const cancelCuenta = (row: CuentaDraft) => {
        if (row.isNew) {
            setCuentas((current) => current.filter((item) => item.key !== row.key));
        } else {
            const snapshot = cuentaSnapshots[row.key];
            if (snapshot) setCuentas((current) => current.map((item) => item.key === row.key ? cloneCuentaDraft(snapshot) : item));
        }
        setEditingCuentaKey(null);
    };

    const resetModalState = () => {
        setIsConfirmCloseOpen(false);
        setIsNewEmpresaInfoOpen(false);
        setSelectedEmpresaId(null);
        setEditingEmpresaKey(null);
        setEditingCuentaKey(null);
        setEnsureRouteAccount(false);
        setEmpresas([]);
        setAllEmpresas([]);
        setEmpresaSnapshots({});
        setCuentas([]);
        setCuentaSnapshots({});
    };

    const discardAndClose = () => {
        resetModalState();
        onClose();
    };

    const requestClose = () => {
        if (hasPendingChanges) {
            setIsConfirmCloseOpen(true);
            return;
        }
        resetModalState();
        onClose();
    };

    const continueNewEmpresa = () => {
        setIsNewEmpresaInfoOpen(false);
        addEmpresa();
    };

    const getItemLabel = (items: Array<{ id: string | number; label: string }>, id: string | number | null | undefined) =>
        items.find((item) => String(item.id) === String(id))?.label ?? "-";

    const saveEmpresa = async (row: EmpresaDraft) => {
        const validation = validateEmpresa(row);
        if (validation) {
            addToast("error", validation);
            return;
        }

        setSavingEmpresaKey(row.key);
        try {
            const params = {
                p_nombre: row.nombre.trim(),
                p_abreviatura: row.abreviatura.trim(),
                p_flag_transferencia: row.flag_transferencia,
                p_id_estado: Number(row.id_estado),
            };

            let savedId = row.id ?? null;
            if (row.id) {
                await empresaService.update(row.id, params);
                addToast("success", "Empresa actualizada correctamente.");
            } else {
                const result = await empresaService.create(params);
                savedId = getIdFromRpcResult(result);
                addToast("success", "Empresa creada correctamente.");
            }

            await loadEmpresas(savedId);
            if (savedId) setSelectedEmpresaId(savedId);
            setEditingEmpresaKey(null);
            onSaved?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al guardar empresa.");
        } finally {
            setSavingEmpresaKey(null);
        }
    };

    const prepareCuentaForRoute = async (idEmpresa: number, idCuenta: number) => {
        const cajas = await cajaOperativaService.getList({
            p_id_empresa: idEmpresa,
            p_id_empresa_cuenta_bancaria: idCuenta,
        });

        if (!cajas.length) {
            await cajaOperativaService.create({
                p_id_empresa: idEmpresa,
                p_id_empresa_cuenta_bancaria: idCuenta,
                p_saldo_inicial: 0,
                p_id_estado: activeEstadoId,
                p_id_usuario: userId,
            });
        }

        const rutas = await cajaOperativaService.getRutas({
            p_ruta: ruta,
            p_id_empresa: idEmpresa,
            p_id_empresa_cuenta_bancaria: idCuenta,
        });

        if (!rutas.length) {
            await cajaOperativaService.createRuta({
                p_ruta: ruta,
                p_id_empresa: idEmpresa,
                p_id_empresa_cuenta_bancaria: idCuenta,
                p_flag_caja_ingreso_principal: false,
                p_id_estado: activeEstadoId,
                p_id_usuario: userId,
            });
        }
    };

    const saveCuenta = async (row: CuentaDraft) => {
        const validation = validateCuenta(row);
        if (validation) {
            addToast("error", validation);
            return;
        }

        setSavingCuentaKey(row.key);
        try {
            const params = {
                p_id_empresa: selectedEmpresaId,
                p_id_banco: Number(row.id_banco),
                p_flag_por_sol_comision_banco_ingreso: row.flag_por_sol_comision_banco_ingreso,
                p_comision_itf_ingreso_salida: parseNumber(row.comision_itf_ingreso_salida),
                p_comision_banco_ingreso: parseNumber(row.comision_banco_ingreso),
                p_comision_minimo_banco_ingreso: parseNumber(row.comision_minimo_banco_ingreso),
                p_comision_igv_banco_ingreso: parseNumber(row.comision_igv_banco_ingreso),
                p_comision_transf_banco_salida: parseNumber(row.comision_transf_banco_salida),
                p_comision_transf_inter_banco_salida: parseNumber(row.comision_transf_inter_banco_salida),
                p_id_estado: Number(row.id_estado),
            };

            let savedId = row.id ?? null;
            if (row.id) {
                await empresaCuentaBancariaService.update(row.id, params);
                addToast("success", "Cuenta bancaria actualizada correctamente.");
            } else {
                const result = await empresaCuentaBancariaService.create(params);
                savedId = getIdFromRpcResult(result);
                addToast("success", "Cuenta bancaria creada correctamente.");
            }

            if (selectedEmpresaId && savedId) {
                await prepareCuentaForRoute(selectedEmpresaId, savedId);
            }

            await loadCuentas(selectedEmpresaId);
            setEditingCuentaKey(null);
            onSaved?.();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al guardar cuenta bancaria.");
        } finally {
            setSavingCuentaKey(null);
        }
    };

    const selectedEmpresa = empresas.find((empresa) => empresa.id === selectedEmpresaId) ?? null;

    return (
        <>
        <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && requestClose()}>
            <Modal className="max-w-7xl">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                        <div className="atk-modal-head flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-primary">Empresas</h2>
                                <p className="mt-1 text-sm text-tertiary">Crea empresas y cuentas disponibles para la ruta actual.</p>
                            </div>
                            <Button size="xs" color="tertiary" iconLeading={XClose} onClick={requestClose} />
                        </div>

                        <div className="mt-5 grid gap-5">
                            <section className="min-w-0">
                                <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-primary">Empresas</h3>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        <Button size="sm" color="secondary" iconLeading={Plus} onClick={addEmpresaExistente}>
                                            Agregar Empresa
                                        </Button>
                                        <Button size="sm" color="secondary" iconLeading={Plus} onClick={() => setIsNewEmpresaInfoOpen(true)}>
                                            Nueva Empresa
                                        </Button>
                                    </div>
                                </div>
                                <div className="max-h-[318px] overflow-auto rounded-lg border border-secondary">
                                    <table className="w-full min-w-[980px] text-left text-sm">
                                        <thead className="sticky top-0 z-10 border-b border-secondary bg-secondary">
                                            <tr>
                                                <th className="w-10 px-3 py-3" />
                                                <th className="min-w-52 px-3 py-3 text-xs font-medium uppercase text-tertiary">Nombre</th>
                                                <th className="min-w-32 px-3 py-3 text-xs font-medium uppercase text-tertiary">Abreviatura</th>
                                                <th className="min-w-36 px-3 py-3 text-xs font-medium uppercase text-tertiary">Transferencia</th>
                                                <th className="min-w-32 px-3 py-3 text-xs font-medium uppercase text-tertiary">Estado</th>
                                                <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-secondary">
                                            {isLoadingEmpresas ? (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-tertiary">Cargando empresas...</td>
                                                </tr>
                                            ) : empresas.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-tertiary">No hay empresas registradas.</td>
                                                </tr>
                                            ) : empresas.map((row) => {
                                                const isEditing = row.isNew || editingEmpresaKey === row.key;
                                                const changed = isEmpresaChanged(row);
                                                const canSave = isEditing && changed && !validateEmpresa(row);

                                                return (
                                                <tr
                                                    key={row.key}
                                                    className={cx(
                                                        "transition duration-100 ease-linear hover:bg-primary_hover",
                                                        selectedEmpresaId === row.id && "bg-secondary",
                                                        row.isNew && "bg-secondary",
                                                    )}
                                                >
                                                    <td className="px-3 py-3" data-prevent-row-select>
                                                        <Checkbox
                                                            isDisabled
                                                            isSelected={isEditing}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {row.isImported && !row.id ? (
                                                            <Select
                                                                size="sm"
                                                                placeholder="Seleccionar empresa"
                                                                items={allEmpresas
                                                                    .filter((item) => item.id && !empresas.some((visible) => visible.id === item.id))
                                                                    .map((item) => ({ id: item.id!, label: item.nombre }))}
                                                                selectedKey={null}
                                                                onSelectionChange={(key) => {
                                                                    if (key !== null) void selectEmpresaExistente(row.key, Number(key));
                                                                }}
                                                            >
                                                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                            </Select>
                                                        ) : isEditing ? (
                                                            <Input size="sm" value={row.nombre} onChange={(value) => updateEmpresa(row.key, "nombre", value)} />
                                                        ) : (
                                                            <span className="font-medium text-primary">{row.nombre || "-"}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Input size="sm" value={row.abreviatura} onChange={(value) => updateEmpresa(row.key, "abreviatura", value)} />
                                                        ) : (
                                                            <span className="font-medium text-primary">{row.abreviatura || "-"}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Checkbox
                                                                label="Permite"
                                                                isSelected={row.flag_transferencia}
                                                                onChange={(value) => updateEmpresa(row.key, "flag_transferencia", value)}
                                                            />
                                                        ) : (
                                                            <span className="font-medium text-primary">{row.flag_transferencia ? "Permite" : "No permite"}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Select
                                                                size="sm"
                                                                placeholder="Estado"
                                                                items={estadoItems}
                                                                selectedKey={row.id_estado ? Number(row.id_estado) : null}
                                                                onSelectionChange={(key) => key !== null && updateEmpresa(row.key, "id_estado", String(key))}
                                                            >
                                                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                            </Select>
                                                        ) : (
                                                            <span className="font-medium text-primary">{getItemLabel(estadoItems, row.id_estado)}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                size="xs"
                                                                color="tertiary"
                                                                iconLeading={Edit03}
                                                                isDisabled={row.isNew || savingEmpresaKey === row.key}
                                                                aria-label="Editar empresa"
                                                                title="Editar empresa"
                                                                onClick={() => {
                                                                    if (row.id) setSelectedEmpresaId(row.id);
                                                                    setEditingEmpresaKey(row.key);
                                                                }}
                                                            />
                                                            <Button
                                                                size="xs"
                                                                color={canSave ? "primary" : "tertiary"}
                                                                iconLeading={Save01}
                                                                isDisabled={!canSave}
                                                                isLoading={savingEmpresaKey === row.key}
                                                                aria-label="Guardar empresa"
                                                                title="Guardar empresa"
                                                                onClick={() => void saveEmpresa(row)}
                                                            />
                                                            <Button
                                                                size="xs"
                                                                color="tertiary"
                                                                iconLeading={XClose}
                                                                isDisabled={!isEditing || savingEmpresaKey === row.key}
                                                                aria-label="Cancelar edicion"
                                                                title="Cancelar edicion"
                                                                onClick={() => cancelEmpresa(row)}
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

                            <section className="min-w-0">
                                <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-primary">Cuentas Bancarias</h3>
                                        <p className="text-xs text-tertiary">
                                            {selectedEmpresa ? selectedEmpresa.nombre : "Selecciona una empresa para administrar sus cuentas."}
                                        </p>
                                    </div>
                                    <Button size="sm" color="secondary" iconLeading={Plus} isDisabled={!selectedEmpresaId} onClick={addCuenta}>
                                        Nueva Cuenta
                                    </Button>
                                </div>
                                <div className={cx("max-h-[318px] overflow-auto rounded-lg border border-secondary", !selectedEmpresaId && "opacity-60")}>
                                    <table className="w-full min-w-[980px] text-left text-sm">
                                        <thead className="sticky top-0 z-10 border-b border-secondary bg-secondary">
                                            <tr>
                                                <th className="w-10 px-3 py-3" />
                                                <th className="min-w-36 px-3 py-3 text-xs font-medium uppercase text-tertiary">Banco</th>
                                                <th className="min-w-32 px-3 py-3 text-xs font-medium uppercase text-tertiary">Tipo Com.</th>
                                                <th className="w-32 px-3 py-3 text-xs font-medium uppercase text-tertiary">Com. Banco</th>
                                                <th className="w-32 px-3 py-3 text-xs font-medium uppercase text-tertiary">Com. Minima</th>
                                                <th className="w-28 px-3 py-3 text-xs font-medium uppercase text-tertiary">Com. IGV</th>
                                                <th className="w-36 px-3 py-3 text-xs font-medium uppercase text-tertiary">Com. Transf. Inter.</th>
                                                <th className="min-w-32 px-3 py-3 text-xs font-medium uppercase text-tertiary">Estado</th>
                                                <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-secondary">
                                            {!selectedEmpresaId ? (
                                                <tr>
                                                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-tertiary">Selecciona una empresa para ver sus cuentas.</td>
                                                </tr>
                                            ) : isLoadingCuentas ? (
                                                <tr>
                                                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-tertiary">Cargando cuentas...</td>
                                                </tr>
                                            ) : cuentas.length === 0 ? (
                                                <tr>
                                                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-tertiary">No hay cuentas bancarias registradas.</td>
                                                </tr>
                                            ) : cuentas.map((row) => {
                                                const isEditing = row.isNew || editingCuentaKey === row.key;
                                                const changed = isCuentaChanged(row);
                                                const canSave = isEditing && changed && !validateCuenta(row);

                                                return (
                                                <tr key={row.key} className={cx("transition duration-100 ease-linear hover:bg-primary_hover", row.isNew && "bg-secondary")}>
                                                    <td className="px-3 py-3">
                                                        <Checkbox isDisabled isSelected={isEditing} />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Select
                                                                size="sm"
                                                                placeholder="Banco"
                                                                items={row.isNew && routeBankId
                                                                    ? bancoItems.filter((item) => item.id === routeBankId)
                                                                    : bancoItems}
                                                                selectedKey={row.id_banco ? Number(row.id_banco) : null}
                                                                isDisabled={Boolean(row.isNew && routeBankId)}
                                                                onSelectionChange={(key) => key !== null && updateCuenta(row.key, "id_banco", String(key))}
                                                            >
                                                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                            </Select>
                                                        ) : (
                                                            <span className="font-medium text-primary">{getItemLabel(bancoItems, row.id_banco)}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Select
                                                                size="sm"
                                                                items={COMISION_TIPO_OPTIONS}
                                                                selectedKey={String(row.flag_por_sol_comision_banco_ingreso)}
                                                                onSelectionChange={(key) => key !== null && updateCuenta(row.key, "flag_por_sol_comision_banco_ingreso", String(key) === "true")}
                                                            >
                                                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                            </Select>
                                                        ) : (
                                                            <span className="font-medium text-primary">
                                                                {getItemLabel(COMISION_TIPO_OPTIONS, String(row.flag_por_sol_comision_banco_ingreso))}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Input
                                                                size="sm"
                                                                type="number"
                                                                value={row.comision_banco_ingreso}
                                                                placeholder={row.flag_por_sol_comision_banco_ingreso ? "S/. 0.00" : "%"}
                                                                onChange={(value) => updateCuenta(row.key, "comision_banco_ingreso", value)}
                                                            />
                                                        ) : (
                                                            <span className="font-medium text-primary">{row.comision_banco_ingreso || "-"}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Input
                                                                size="sm"
                                                                type="number"
                                                                value={row.comision_minimo_banco_ingreso}
                                                                placeholder="S/. 0.00"
                                                                onChange={(value) => updateCuenta(row.key, "comision_minimo_banco_ingreso", value)}
                                                            />
                                                        ) : (
                                                            <span className="font-medium text-primary">{row.comision_minimo_banco_ingreso || "-"}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Input
                                                                size="sm"
                                                                type="number"
                                                                value={row.comision_igv_banco_ingreso}
                                                                placeholder="%"
                                                                onChange={(value) => updateCuenta(row.key, "comision_igv_banco_ingreso", value)}
                                                            />
                                                        ) : (
                                                            <span className="font-medium text-primary">{row.comision_igv_banco_ingreso || "-"}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Input
                                                                size="sm"
                                                                type="number"
                                                                value={row.comision_transf_inter_banco_salida}
                                                                placeholder="S/. 0.00"
                                                                onChange={(value) => updateCuenta(row.key, "comision_transf_inter_banco_salida", value)}
                                                            />
                                                        ) : (
                                                            <span className="font-medium text-primary">{row.comision_transf_inter_banco_salida || "-"}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {isEditing ? (
                                                            <Select
                                                                size="sm"
                                                                placeholder="Estado"
                                                                items={estadoItems}
                                                                selectedKey={row.id_estado ? Number(row.id_estado) : null}
                                                                onSelectionChange={(key) => key !== null && updateCuenta(row.key, "id_estado", String(key))}
                                                            >
                                                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                            </Select>
                                                        ) : (
                                                            <span className="font-medium text-primary">{getItemLabel(estadoItems, row.id_estado)}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                size="xs"
                                                                color="tertiary"
                                                                iconLeading={Edit03}
                                                                isDisabled={row.isNew || savingCuentaKey === row.key}
                                                                aria-label="Editar cuenta"
                                                                title="Editar cuenta"
                                                                onClick={() => setEditingCuentaKey(row.key)}
                                                            />
                                                            <Button
                                                                size="xs"
                                                                color={canSave ? "primary" : "tertiary"}
                                                                iconLeading={Save01}
                                                                isDisabled={!canSave}
                                                                isLoading={savingCuentaKey === row.key}
                                                                aria-label="Guardar cuenta"
                                                                title="Guardar cuenta"
                                                                onClick={() => void saveCuenta(row)}
                                                            />
                                                            <Button
                                                                size="xs"
                                                                color="tertiary"
                                                                iconLeading={XClose}
                                                                isDisabled={!isEditing || savingCuentaKey === row.key}
                                                                aria-label="Cancelar edicion"
                                                                title="Cancelar edicion"
                                                                onClick={() => cancelCuenta(row)}
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
        <ModalOverlay isOpen={isNewEmpresaInfoOpen} onOpenChange={(open) => !open && setIsNewEmpresaInfoOpen(false)}>
            <Modal className="max-w-xl">
                <Dialog>
                    <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                        <div className="atk-modal-head">
                            <h2 className="text-lg font-semibold text-primary">Nueva Empresa</h2>
                            <p className="mt-1 text-sm text-tertiary">
                                Estas son las empresas registradas actualmente.
                            </p>
                        </div>

                        <div className="mt-5 flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-lg border border-secondary bg-secondary p-3">
                            {allEmpresas.length > 0 ? allEmpresas.map((empresa) => (
                                <span
                                    key={empresa.id ?? empresa.key}
                                    className="inline-flex max-w-full items-center rounded-md border border-secondary bg-primary px-2 py-1 text-xs font-medium text-secondary"
                                    title={empresa.nombre}
                                >
                                    {empresa.nombre || "Sin nombre"}
                                </span>
                            )) : (
                                <span className="text-sm text-tertiary">No hay empresas registradas.</span>
                            )}
                        </div>

                        <p className="mt-3 text-sm text-tertiary">
                            Si la empresa no existe y deseas crearla, selecciona{" "}
                            <span className="mx-1 inline-flex rounded-md border border-secondary bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-4 text-secondary">
                                CONTINUAR
                            </span>
                            . Si la empresa ya existe, selecciona{" "}
                            <span className="mx-1 inline-flex rounded-md border border-secondary bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-4 text-secondary">
                                CANCELAR
                            </span>
                            {" "}y utiliza{" "}
                            <span className="mx-1 inline-flex rounded-md border border-secondary bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-4 text-secondary">
                                AGREGAR EMPRESA
                            </span>
                            .
                        </p>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button color="secondary" onClick={() => setIsNewEmpresaInfoOpen(false)}>
                                Cancelar
                            </Button>
                            <Button color="primary" onClick={continueNewEmpresa}>
                                Continuar
                            </Button>
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
