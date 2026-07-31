// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { useAuth } from "@/providers/auth-provider";
import { useSessionCache } from "@/providers/session-cache-provider";
import { useToast } from "@/providers/toast-provider";
import { cajaOperativaService } from "@/services/caja-operativa.service";
import { Check, X } from "@untitledui/icons";
import { getCoreEstadoItems } from "@/utils/estado-options";

interface CajaOperativaPopupProps {
    isOpen: boolean;
    existingItems?: Record<string, unknown>[];
    item: Record<string, unknown> | null;
    onClose: () => void;
    onSave: () => void;
}

const getActivoId = (estadosList: { id: string | number; label: string }[]) => {
    const activo = estadosList.find((estado) => estado.label.toLowerCase() === "activo");
    return activo ? Number(activo.id) : 1;
};

const parseMoney = (value: string) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

const canEditSavedSaldo = (value: unknown) => {
    const parsed = parseMoney(String(value ?? "0"));
    return parsed !== null && parsed <= 0;
};

export const CajaOperativaPopup = ({ existingItems = [], isOpen, item, onClose, onSave }: CajaOperativaPopupProps) => {
    const { businessUser } = useAuth();
    const { addToast } = useToast();
    const { empresas, empresasCuentasBancarias, estados } = useSessionCache();
    const isEditing = !!item;
    const [idEmpresa, setIdEmpresa] = useState(0);
    const [idCuenta, setIdCuenta] = useState(0);
    const [saldoInicial, setSaldoInicial] = useState("");
    const [idEstado, setIdEstado] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const canEditSaldoInicial = !isEditing || canEditSavedSaldo(item?.saldo_inicial);

    const estadoItems = useMemo(() => getCoreEstadoItems(estados), [estados]);

    const assignedCuentaIds = useMemo(() => {
        const currentCuentaId = isEditing ? Number(item?.id_empresa_cuenta_bancaria ?? 0) : 0;

        return new Set(
            (existingItems || [])
                .map((caja) => Number(caja.id_empresa_cuenta_bancaria ?? 0))
                .filter((id) => id && id !== currentCuentaId),
        );
    }, [existingItems, isEditing, item]);

    const availableCuentaRows = useMemo(
        () => (empresasCuentasBancarias || []).filter((cuenta) => !assignedCuentaIds.has(Number(cuenta.id ?? 0))),
        [assignedCuentaIds, empresasCuentasBancarias],
    );

    const availableEmpresaIds = useMemo(
        () => new Set(availableCuentaRows.map((cuenta) => Number(cuenta.id_empresa ?? 0)).filter(Boolean)),
        [availableCuentaRows],
    );

    const empresaItems = useMemo(
        () =>
            (empresas || [])
                .filter((empresa) => isEditing || availableEmpresaIds.has(Number(empresa.id ?? 0)))
                .map((empresa) => ({ id: empresa.id as string | number, label: empresa.nombre as string })),
        [availableEmpresaIds, empresas, isEditing],
    );

    const cuentaItems = useMemo(
        () =>
            availableCuentaRows
                .filter((cuenta) => !idEmpresa || Number(cuenta.id_empresa) === idEmpresa)
                .map((cuenta) => ({
                    id: cuenta.id as string | number,
                    label: `${cuenta.banco_nombre ?? cuenta.nombre_banco ?? "Banco"} - ${cuenta.empresa_nombre ?? cuenta.nombre_empresa ?? "Empresa"}`,
                })),
        [availableCuentaRows, idEmpresa],
    );

    useEffect(() => {
        if (!isOpen) return;

        if (item) {
            setIdEmpresa(Number(item.id_empresa ?? 0));
            setIdCuenta(Number(item.id_empresa_cuenta_bancaria ?? 0));
            setSaldoInicial(String(item.saldo_inicial ?? "0"));
            setIdEstado(Number(item.id_estado ?? 0));
            return;
        }

        setIdEmpresa(0);
        setIdCuenta(0);
        setSaldoInicial("");
        setIdEstado(getActivoId(estadoItems));
    }, [estadoItems, isOpen, item]);

    const handleEmpresaChange = (value: number) => {
        setIdEmpresa(value);
        setIdCuenta(0);
    };

    const handleSave = async () => {
        const saldo = parseMoney(saldoInicial);

        if (!idEmpresa) {
            addToast("error", "La empresa es obligatoria");
            return;
        }

        if (!idCuenta) {
            addToast("error", "La cuenta bancaria es obligatoria");
            return;
        }

        if (saldo === null || saldo < 0) {
            addToast("error", "El saldo inicial debe ser mayor o igual a cero");
            return;
        }

        if (!idEstado) {
            addToast("error", "El estado es obligatorio");
            return;
        }

        setIsSaving(true);
        try {
            const params: Record<string, unknown> = {
                p_id_empresa: idEmpresa,
                p_id_empresa_cuenta_bancaria: idCuenta,
                p_saldo_inicial: saldo,
                p_saldo_actual: saldo,
                p_id_estado: idEstado,
                p_id_usuario: businessUser?.id ? Number(businessUser.id) : null,
            };

            if (isEditing) {
                await cajaOperativaService.update(Number(item!.id), params);
                addToast("success", "Caja operativa actualizada correctamente");
            } else {
                await cajaOperativaService.create(params);
                addToast("success", "Caja operativa creada correctamente");
            }

            onSave();
        } catch (err) {
            addToast("error", err instanceof Error ? err.message : "Error al guardar la caja operativa");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-overlay/70 backdrop-blur-[6px]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="relative z-10 w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl"
                    >
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">
                                {isEditing ? "Editar Caja Operativa" : "Nueva Caja Operativa"}
                            </h2>
                            <Button size="xs" color="tertiary" iconLeading={X} onClick={onClose} />
                        </div>

                        <div className="grid gap-4">
                            <Select
                                label="Empresa"
                                placeholder="Seleccione una empresa"
                                size="sm"
                                isRequired
                                items={empresaItems}
                                selectedKey={idEmpresa}
                                isDisabled={isEditing}
                                onSelectionChange={(key) => {
                                    if (key !== null) handleEmpresaChange(Number(key));
                                }}
                            >
                                {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                            </Select>

                            <Select
                                label="Cuenta Bancaria"
                                placeholder="Seleccione una cuenta"
                                size="sm"
                                isRequired
                                items={cuentaItems}
                                selectedKey={idCuenta}
                                isDisabled={isEditing || !idEmpresa}
                                onSelectionChange={(key) => {
                                    if (key !== null) setIdCuenta(Number(key));
                                }}
                            >
                                {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                            </Select>

                            <Input
                                label="Saldo Inicial"
                                placeholder="S/ 0.00"
                                size="sm"
                                type="number"
                                value={saldoInicial}
                                isDisabled={!canEditSaldoInicial}
                                onChange={setSaldoInicial}
                            />

                            <Select
                                label="Estado"
                                placeholder="Seleccione un estado"
                                size="sm"
                                isRequired
                                items={estadoItems}
                                selectedKey={idEstado}
                                onSelectionChange={(key) => {
                                    if (key !== null) setIdEstado(Number(key));
                                }}
                            >
                                {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                            </Select>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-3">
                            <Button size="sm" color="secondary" onClick={onClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" color="primary" iconLeading={Check} isLoading={isSaving} onClick={handleSave}>
                                Guardar
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
