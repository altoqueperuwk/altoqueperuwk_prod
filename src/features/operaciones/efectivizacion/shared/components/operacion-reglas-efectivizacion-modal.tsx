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
import { reglasEfectivizacionService } from "@/services/reglas-efectivizacion.service";
import { OperacionConfirmModal } from "@/features/operaciones/efectivizacion/shared/components/operacion-confirm-modal";
import type {
    OperacionRuta,
    OperacionRutaBancaria,
    RutaOperacionCaja,
} from "@/features/operaciones/efectivizacion/shared/types/operaciones.types";
import {
    findCodigoServicioForRuta,
} from "@/features/operaciones/efectivizacion/shared/utils/route-config";
import { cx } from "@/utils/cx";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface OperacionReglasEfectivizacionModalProps {
    activeCompany?: RutaOperacionCaja | null;
    isOpen: boolean;
    mode?: "ruta" | "pago-deuda";
    onClose: () => void;
    onSaved?: () => void;
    ruta?: OperacionRuta;
}

interface RuleDraft {
    id?: number;
    key: string;
    isNew: boolean;
    id_banco: string;
    id_comunidad: string;
    tipo_deposito: string;
    comision_servicio: string;
    monto_minimo_deposito_servicio: string;
    comision_minima_servicio: string;
    id_estado: string;
}

const TIPO_DEPOSITO_OPTIONS = [
    { id: "Mismo Día", label: "Mismo Día" },
    { id: "Día Siguiente", label: "Día Siguiente" },
];

const toNumber = (value: unknown) => Number(value ?? 0);
const toText = (value: unknown) => String(value ?? "");
const normalize = (value: unknown) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();

const findServicioForOperacionRuta = (
    codigosServicio: Record<string, unknown>[] | null,
    ruta: OperacionRuta | undefined,
    mode: "ruta" | "pago-deuda",
) => {
    const items = (codigosServicio ?? []).map((item) => ({
        id: Number(item.id),
        nombre: String(item.nombre ?? ""),
        tipo: item.tipo == null ? null : String(item.tipo),
    }));

    if (!items.length) return null;

    if (mode === "pago-deuda") {
        return (
            items.find((item) => normalize(item.tipo) === "PAGO DEUDA") ??
            items.find((item) => normalize(item.nombre) === "PAGO DEUDA") ??
            items.find((item) => normalize(item.tipo).includes("PAGO DEUDA")) ??
            items.find((item) => normalize(item.nombre).includes("PAGO DEUDA")) ??
            null
        );
    }

    if (!ruta) return null;

    if (ruta !== "pos" && ruta !== "linkpago") {
        return findCodigoServicioForRuta(items, ruta as OperacionRutaBancaria);
    }

    const needle = ruta === "pos" ? "POS" : "LINK";
    return (
        items.find((item) => normalize(item.tipo).includes(needle)) ??
        items.find((item) => normalize(item.nombre).includes(needle)) ??
        null
    );
};

export const OperacionReglasEfectivizacionModal = ({
    activeCompany,
    isOpen,
    mode = "ruta",
    onClose,
    onSaved,
    ruta,
}: OperacionReglasEfectivizacionModalProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const { bancos, codigosServicio, comunidades, estados } = useSessionCache();
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
    const [newRows, setNewRows] = useState<RuleDraft[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
    const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);

    const servicio = useMemo(
        () => findServicioForOperacionRuta(codigosServicio, ruta, mode),
        [codigosServicio, mode, ruta],
    );
    const isPagoDeudaMode = mode === "pago-deuda";
    const estadoActivo = useMemo(
        () => (estados ?? []).find((item) => normalize(item.nombre) === "ACTIVO") ?? null,
        [estados],
    );
    const comunidadDefaultPagoDeuda = useMemo(
        () => (comunidades ?? []).find((item) => normalize(item.nombre) === "ATK1") ?? null,
        [comunidades],
    );
    const bancoItems = useMemo(
        () => (bancos ?? []).map((item) => ({
            id: Number(item.id),
            label: String(item.nombre ?? ""),
        })),
        [bancos],
    );
    const comunidadItems = useMemo(
        () => (comunidades ?? []).map((item) => ({
            id: Number(item.id),
            label: String(item.nombre ?? ""),
        })),
        [comunidades],
    );
    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

    const userId = businessUser?.id ? Number(businessUser.id) : null;
    const canResolveContext = !!servicio?.id && (isPagoDeudaMode ? !!comunidadDefaultPagoDeuda?.id : !!activeCompany?.id_banco);

    const buildDraftFromRow = (row: Record<string, unknown>): RuleDraft => ({
        id: Number(row.id),
        key: String(row.id),
        isNew: false,
        id_banco: row.id_banco == null ? "" : String(row.id_banco),
        id_comunidad: row.id_comunidad == null ? "" : String(row.id_comunidad),
        tipo_deposito: toText(row.tipo_deposito),
        comision_servicio: toText(row.comision_servicio),
        monto_minimo_deposito_servicio: toText(row.monto_minimo_deposito_servicio),
        comision_minima_servicio: toText(row.comision_minima_servicio),
        id_estado: row.id_estado == null ? "" : String(row.id_estado),
    });

    const loadRules = useCallback(async () => {
        if (!isOpen || !canResolveContext) {
            setRows([]);
            return;
        }

        setIsLoading(true);
        try {
            const result = await reglasEfectivizacionService.getList({
                p_id_codigo_servicio: servicio?.id,
                ...(isPagoDeudaMode ? {} : { p_id_banco: activeCompany?.id_banco }),
            });
            setRows(result ?? []);
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al cargar reglas de efectivizacion.");
        } finally {
            setIsLoading(false);
        }
    }, [activeCompany?.id_banco, addToast, canResolveContext, isOpen, isPagoDeudaMode, servicio?.id]);

    useEffect(() => {
        if (!isOpen) return;
        setDrafts({});
        setNewRows([]);
        setEditingRuleKey(null);
        void loadRules();
    }, [isOpen, loadRules]);

    const getDraft = (row: Record<string, unknown>) => drafts[String(row.id)] ?? buildDraftFromRow(row);

    const isDraftChanged = (row: Record<string, unknown>) => {
        const draft = drafts[String(row.id)];
        if (!draft) return false;
        const original = buildDraftFromRow(row);
        return (
            draft.id_banco !== original.id_banco ||
            draft.id_comunidad !== original.id_comunidad ||
            draft.tipo_deposito !== original.tipo_deposito ||
            draft.comision_servicio !== original.comision_servicio ||
            draft.monto_minimo_deposito_servicio !== original.monto_minimo_deposito_servicio ||
            draft.comision_minima_servicio !== original.comision_minima_servicio ||
            draft.id_estado !== original.id_estado
        );
    };

    const hasPendingChanges = newRows.length > 0 || rows.some(isDraftChanged);

    const updateDraft = (key: string, field: keyof RuleDraft, value: string) => {
        setDrafts((current) => {
            const row = rows.find((item) => String(item.id) === key);
            const base = current[key] ?? (row ? buildDraftFromRow(row) : null);
            if (!base) return current;
            return { ...current, [key]: { ...base, [field]: value } };
        });
    };

    const updateNewRow = (key: string, field: keyof RuleDraft, value: string) => {
        setNewRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
    };

    const addNewRow = () => {
        const key = `new-${Date.now()}`;
        setNewRows((current) => [
            ...current,
            {
                key,
                isNew: true,
                id_banco: "",
                id_comunidad: isPagoDeudaMode && comunidadDefaultPagoDeuda?.id != null ? String(comunidadDefaultPagoDeuda.id) : "",
                tipo_deposito: "",
                comision_servicio: "",
                monto_minimo_deposito_servicio: "",
                comision_minima_servicio: "",
                id_estado: estadoActivo?.id == null ? "" : String(estadoActivo.id),
            },
        ]);
        setEditingRuleKey(key);
    };

    const resolveDraftBancoId = (draft: RuleDraft) => (
        isPagoDeudaMode ? Number(draft.id_banco || 0) : Number(activeCompany?.id_banco ?? 0)
    );

    const resolveDraftComunidadId = (draft: RuleDraft) => (
        isPagoDeudaMode ? Number(comunidadDefaultPagoDeuda?.id ?? 0) : Number(draft.id_comunidad || 0)
    );

    const validateDraft = (draft: RuleDraft) => {
        const draftBancoId = resolveDraftBancoId(draft);
        const draftComunidadId = resolveDraftComunidadId(draft);

        if (!servicio?.id || !draftBancoId) return "No se pudo resolver el servicio o banco de la ruta.";
        if (!draftComunidadId) return "La comunidad es obligatoria.";
        if (!draft.tipo_deposito) return "El tipo deposito es obligatorio.";
        if (!draft.id_estado) return "El estado es obligatorio.";

        const numericFields = [
            ["Comision Servicio", draft.comision_servicio],
            ["Monto Minimo Deposito", draft.monto_minimo_deposito_servicio],
            ["Comision Minima", draft.comision_minima_servicio],
        ];

        for (const [label, value] of numericFields) {
            if (String(value).trim() === "" || !Number.isFinite(Number(value))) {
                return `${label} es obligatorio.`;
            }
        }

        const activeId = Number(estadoActivo?.id ?? 0);
        if (Number(draft.id_estado) === activeId) {
            const duplicatedExisting = rows.some((row) => {
                if (draft.id && Number(row.id) === draft.id) return false;
                return (
                    Number(row.id_estado) === activeId &&
                    Number(row.id_codigo_servicio) === Number(servicio.id) &&
                    Number(row.id_banco) === draftBancoId &&
                    Number(row.id_comunidad) === draftComunidadId &&
                    normalize(row.tipo_deposito) === normalize(draft.tipo_deposito)
                );
            });

            const duplicatedNew = newRows.some((row) => {
                if (row.key === draft.key) return false;
                return (
                    Number(row.id_estado) === activeId &&
                    resolveDraftBancoId(row) === draftBancoId &&
                    resolveDraftComunidadId(row) === draftComunidadId &&
                    normalize(row.tipo_deposito) === normalize(draft.tipo_deposito)
                );
            });

            if (duplicatedExisting || duplicatedNew) {
                return "Ya existe una regla activa para servicio, banco, comunidad y tipo deposito.";
            }
        }

        return null;
    };

    const saveDraft = async (draft: RuleDraft) => {
        const validation = validateDraft(draft);
        if (validation) throw new Error(validation);

        const params = {
            p_id_codigo_servicio: Number(servicio?.id),
            p_id_banco: resolveDraftBancoId(draft),
            p_id_comunidad: resolveDraftComunidadId(draft),
            p_tipo_deposito: draft.tipo_deposito,
            p_comision_servicio: toNumber(draft.comision_servicio),
            p_monto_minimo_deposito_servicio: toNumber(draft.monto_minimo_deposito_servicio),
            p_comision_minima_servicio: toNumber(draft.comision_minima_servicio),
            p_id_estado: Number(draft.id_estado),
            p_id_usuario: userId,
        };

        if (draft.isNew) {
            await reglasEfectivizacionService.create(params);
            setNewRows((current) => current.filter((row) => row.key !== draft.key));
        } else if (draft.id) {
            await reglasEfectivizacionService.update(draft.id, params);
            setDrafts((current) => {
                const next = { ...current };
                delete next[draft.key];
                return next;
            });
        }

        await loadRules();
        setEditingRuleKey(null);
        onSaved?.();
    };

    const handleSaveDraft = async (draft: RuleDraft) => {
        setIsSaving(true);
        try {
            await saveDraft(draft);
            addToast("success", "Regla guardada correctamente.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Error al guardar la regla.";
            addToast("error", message);
        } finally {
            setIsSaving(false);
        }
    };

    const resetModalState = () => {
        setIsConfirmCloseOpen(false);
        setDrafts({});
        setNewRows([]);
        setEditingRuleKey(null);
        setRows([]);
    };

    const requestClose = () => {
        if (hasPendingChanges) {
            setIsConfirmCloseOpen(true);
            return;
        }
        resetModalState();
        onClose();
    };

    const discardAndClose = () => {
        resetModalState();
        onClose();
    };

    const getItemLabel = (items: Array<{ id: string | number; label: string }>, id: string) =>
        items.find((item) => String(item.id) === String(id))?.label ?? "-";

    const renderRow = (draft: RuleDraft, row?: Record<string, unknown>) => {
        const isEditing = draft.isNew || editingRuleKey === draft.key;
        const changed = draft.isNew || (row ? isDraftChanged(row) : false);
        const update = draft.isNew ? updateNewRow : updateDraft;
        const handleCancel = () => {
            if (draft.isNew) {
                setNewRows((current) => current.filter((item) => item.key !== draft.key));
            } else {
                setDrafts((current) => {
                    const next = { ...current };
                    delete next[draft.key];
                    return next;
                });
            }
            setEditingRuleKey(null);
        };

        return (
            <tr key={draft.key} className={cx("transition duration-100 ease-linear hover:bg-primary_hover", draft.isNew && "bg-secondary")}>
                <td className="w-10 px-3 py-3">
                    <Checkbox isDisabled isSelected={isEditing} />
                </td>
                {isPagoDeudaMode && (
                    <td className="min-w-40 px-3 py-3">
                        {isEditing ? (
                            <Select
                                size="sm"
                                placeholder="Banco"
                                items={bancoItems}
                                selectedKey={draft.id_banco ? Number(draft.id_banco) : null}
                                onSelectionChange={(key) => key !== null && update(draft.key, "id_banco", String(key))}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        ) : (
                            <span className="font-medium text-primary">{getItemLabel(bancoItems, draft.id_banco)}</span>
                        )}
                    </td>
                )}
                <td className="min-w-40 px-3 py-3">
                    {isEditing ? (
                        <Select
                            size="sm"
                            placeholder="Comunidad"
                            items={comunidadItems}
                            selectedKey={isPagoDeudaMode && comunidadDefaultPagoDeuda?.id != null ? Number(comunidadDefaultPagoDeuda.id) : (draft.id_comunidad ? Number(draft.id_comunidad) : null)}
                            isDisabled={isPagoDeudaMode}
                            onSelectionChange={(key) => key !== null && update(draft.key, "id_comunidad", String(key))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    ) : (
                        <span className="font-medium text-primary">
                            {getItemLabel(comunidadItems, isPagoDeudaMode && comunidadDefaultPagoDeuda?.id != null ? String(comunidadDefaultPagoDeuda.id) : draft.id_comunidad)}
                        </span>
                    )}
                </td>
                <td className="min-w-40 px-3 py-3">
                    {isEditing ? (
                        <Select
                            size="sm"
                            placeholder="Tipo"
                            items={TIPO_DEPOSITO_OPTIONS}
                            selectedKey={draft.tipo_deposito || null}
                            onSelectionChange={(key) => key !== null && update(draft.key, "tipo_deposito", String(key))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    ) : (
                        <span className="font-medium text-primary">{draft.tipo_deposito || "-"}</span>
                    )}
                </td>
                <td className="w-34 px-3 py-3">
                    {isEditing ? (
                        <Input
                            size="sm"
                            type="number"
                            value={draft.comision_servicio}
                            onChange={(value) => update(draft.key, "comision_servicio", value)}
                        />
                    ) : (
                        <span className="font-medium text-primary">{draft.comision_servicio || "-"}</span>
                    )}
                </td>
                <td className="w-40 px-3 py-3">
                    {isEditing ? (
                        <Input
                            size="sm"
                            type="number"
                            value={draft.monto_minimo_deposito_servicio}
                            onChange={(value) => update(draft.key, "monto_minimo_deposito_servicio", value)}
                        />
                    ) : (
                        <span className="font-medium text-primary">{draft.monto_minimo_deposito_servicio || "-"}</span>
                    )}
                </td>
                <td className="w-36 px-3 py-3">
                    {isEditing ? (
                        <Input
                            size="sm"
                            type="number"
                            value={draft.comision_minima_servicio}
                            onChange={(value) => update(draft.key, "comision_minima_servicio", value)}
                        />
                    ) : (
                        <span className="font-medium text-primary">{draft.comision_minima_servicio || "-"}</span>
                    )}
                </td>
                <td className="min-w-32 px-3 py-3">
                    {isEditing ? (
                        <Select
                            size="sm"
                            placeholder="Estado"
                            items={estadoItems}
                            selectedKey={draft.id_estado ? Number(draft.id_estado) : null}
                            onSelectionChange={(key) => key !== null && update(draft.key, "id_estado", String(key))}
                        >
                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                        </Select>
                    ) : (
                        <span className="font-medium text-primary">{getItemLabel(estadoItems, draft.id_estado)}</span>
                    )}
                </td>
                <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                        <Button
                            size="xs"
                            color="tertiary"
                            iconLeading={Edit03}
                            aria-label="Editar regla"
                            title="Editar regla"
                            isDisabled={draft.isNew || isSaving}
                            onClick={() => setEditingRuleKey(draft.key)}
                        />
                        <Button
                            size="xs"
                            color={changed && isEditing ? "primary" : "tertiary"}
                            iconLeading={Save01}
                            aria-label="Guardar regla"
                            title="Guardar regla"
                            isDisabled={!changed || !isEditing || isSaving}
                            onClick={() => void handleSaveDraft(draft)}
                        />
                        <Button
                            size="xs"
                            color="tertiary"
                            iconLeading={XClose}
                            aria-label="Cancelar edicion"
                            title="Cancelar edicion"
                            isDisabled={!isEditing || isSaving}
                            onClick={handleCancel}
                        />
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <>
            <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && requestClose()}>
                <Modal className="max-w-6xl">
                    <Dialog>
                        <div className="w-full rounded-xl bg-primary p-5 shadow-xl ring-1 ring-secondary">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-primary">Reglas de Efectivizacion</h2>
                                </div>
                                <Button size="xs" color="tertiary" iconLeading={XClose} onClick={requestClose} />
                            </div>

                            {!canResolveContext ? (
                                <div className="mt-5 rounded-lg border border-warning_subtle bg-warning-primary px-4 py-3 text-sm text-warning-primary">
                                    No se pudo resolver el codigo de servicio o banco para esta ruta. Revisa la configuracion de servicio/caja activa.
                                </div>
                            ) : (
                                <>
                                    <div className="mt-5 flex justify-end">
                                        <Button size="sm" color="secondary" iconLeading={Plus} onClick={addNewRow}>
                                            Agregar regla
                                        </Button>
                                    </div>

                                    <div className="mt-3 max-h-[62vh] overflow-auto rounded-lg border border-secondary">
                                        <table className="min-w-full text-left text-sm">
                                            <thead className="sticky top-0 z-10 border-b border-secondary bg-secondary">
                                                <tr>
                                                    <th className="w-10 px-3 py-3" />
                                                    {isPagoDeudaMode && (
                                                        <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Banco</th>
                                                    )}
                                                    <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Comunidad</th>
                                                    <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Tipo Deposito</th>
                                                    <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Comision Servicio</th>
                                                    <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Monto Minimo Deposito</th>
                                                    <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Comision Minima</th>
                                                    <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Estado</th>
                                                    <th className="px-3 py-3 text-xs font-medium uppercase text-tertiary">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary">
                                                {newRows.map((row) => renderRow(row))}
                                                {isLoading ? (
                                                    <tr>
                                                        <td colSpan={isPagoDeudaMode ? 9 : 8} className="px-4 py-10 text-center text-sm text-tertiary">
                                                            Cargando reglas...
                                                        </td>
                                                    </tr>
                                                ) : rows.length === 0 && newRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={isPagoDeudaMode ? 9 : 8} className="px-4 py-10 text-center text-sm text-tertiary">
                                                            {isPagoDeudaMode ? "No hay reglas para Pago Deuda." : "No hay reglas para esta ruta y banco."}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    rows.map((row) => renderRow(getDraft(row), row))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            <div className="mt-5 flex justify-end gap-2">
                                <Button size="sm" color="secondary" onClick={requestClose}>Cerrar</Button>
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
